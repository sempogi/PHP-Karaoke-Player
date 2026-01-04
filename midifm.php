<?php
/**
 * MIDI Mini File Manager (Optimized Single-File Edition) — FIXED v1.0.3
 * - Core fix: remove nested forms in table; single batch form only
 * - Actions via button names (no JS dependency)
 * - Server-side fallback: Enter in target_folder triggers Move
 * - Rename reads title/artist from array inputs keyed by filename
 * - Preserves your clean_text() and cache behaviors
 */

declare(strict_types=1);
mb_internal_encoding('UTF-8');
session_start();

/* ---------------------- CONFIG ---------------------- */
const BASE_DIR = __DIR__ . '/midi';
const MAX_READ_BYTES = 262144;
const ITEMS_PER_PAGE = 50;
const CACHE_FILE = BASE_DIR . '/.midi_meta_cache.json';
$ALLOWED_EXTS = ['mid','midi','kar'];

/* ------------------ HELPER: SECURITY ------------------ */
function base_path(): string {
    $real = realpath(BASE_DIR);
    if ($real === false) {
        @mkdir(BASE_DIR, 0775, true);
        $real = realpath(BASE_DIR);
    }
    return $real ?: BASE_DIR;
}

function clean_rel(string $rel): string {
    $rel = str_replace('\\', '/', $rel);
    $rel = preg_replace('#/+#','/', $rel);
    $rel = ltrim($rel, '/');
    $parts = array_filter(explode('/', $rel), function($p) {
        return $p !== '' && $p !== '.' && $p !== '..';
    });
    return implode('/', $parts);
}

function resolve_in_base(string $rel, bool $allowNonExisting = false): string {
    $rel = clean_rel($rel);
    $base = base_path();
    $target = $base . ($rel === '' ? '' : '/' . $rel);

    if ($allowNonExisting) {
        $parent = realpath(dirname($target));
        if ($parent === false) return '';
        if (strpos($parent, $base) !== 0) return '';
        return $target;
    } else {
        $real = realpath($target);
        if ($real === false) return '';
        if (strpos($real, $base) !== 0) return '';
        return $real;
    }
}

function is_allowed_ext(string $filename): bool {
    global $ALLOWED_EXTS;
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    return in_array($ext, $ALLOWED_EXTS, true);
}

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/* -------------------- MESSAGES -------------------- */
function add_msg(string $type, string $text): void {
    $_SESSION['__msgs'][] = ['t'=>$type, 'm'=>$text];
}
function take_msgs(): array {
    $msgs = $_SESSION['__msgs'] ?? [];
    unset($_SESSION['__msgs']);
    return $msgs;
}

/* --------------------- CSRF --------------------- */
function csrf_token(): string {
    if (empty($_SESSION['__csrf'])) {
        $_SESSION['__csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['__csrf'];
}
function csrf_check(?string $token): void {
    if (!$token || !hash_equals($_SESSION['__csrf'] ?? '', $token)) {
        throw new RuntimeException('Invalid CSRF token.');
    }
}

/* --------------- MIDI META EXTRACTION --------------- */
function clean_text($s): string {
    if ($s === null) return '';
    if (is_array($s)) {
        $s = implode(' ', array_map(function($x){ return is_string($x) ? $x : (string)$x; }, $s));
    } elseif (!is_string($s)) {
        $s = (string)$s;
    }
    // Replace control characters with spaces (except CRLF/TAB)
    $out = @preg_replace('/[^\P{C}\t\r\n]+/u', ' ', $s);
    if (!is_string($out)) $out = $s;
    // Collapse repeated whitespace
    $out2 = @preg_replace('/\s+/u', ' ', $out);
    if (!is_string($out2)) $out2 = $out;
    return trim($out2);
}

function extract_meta_text_events(string $bin, array $wantedTypes = [0x03,0x01,0x02,0x05]): array {
    $out = [];
    $len = strlen($bin);
    for ($i=0; $i<$len-3; $i++) {
        if (ord($bin[$i]) !== 0xFF) continue;
        $type = ord($bin[$i+1] ?? "\x00");
        if (!in_array($type, $wantedTypes, true)) continue;

        $j = $i+2;
        $val = 0;
        $maxJ = min($j+4, $len);
        $ok = false;
        for (; $j < $maxJ; $j++) {
            $b = ord($bin[$j]);
            $val = ($val << 7) | ($b & 0x7F);
            if (($b & 0x80) === 0) { $ok = true; $j++; break; }
        }
        if (!$ok) continue;
        $textLen = $val;
        if ($textLen <= 0 || $textLen > 1000) continue;
        if ($j + $textLen > $len) continue;

        $text = substr($bin, $j, $textLen);
        $text = @mb_convert_encoding($text, 'UTF-8', 'UTF-8,ISO-8859-1');
        if (!is_string($text)) $text = (string)$text;
        $text = clean_text($text);
        if ($text !== '') $out[] = $text;

        $i = $j + $textLen - 1;
    }
    return $out;
}

function filename_to_meta(string $filename): array {
    $name = pathinfo($filename, PATHINFO_FILENAME);
    $name = str_replace(['_', '–', '—'], [' ', '-','-'], (string)$name);
    $name = trim($name);
    $title = '';
    $artist = '';
    if (preg_match('/^(.+?)\s*-\s*(.+)$/u', $name, $m)) {
        $left = clean_text($m[1] ?? '');
        $right = clean_text($m[2] ?? '');
        if (preg_match('/^(.+?)\s+by\s+(.+)$/iu', $name, $m2)) {
            return ['title'=>clean_text($m2[1] ?? ''), 'artist'=>clean_text($m2[2] ?? '')];
        }
        if (preg_match('/\b(feat\.|ft\.|featuring)\b/i', $left)) {
            $artist = $left; $title = $right;
        } elseif (preg_match('/\b(feat\.|ft\.|featuring)\b/i', $right)) {
            $title = $left; $artist = $right;
        } else {
            $title = $left; $artist = $right;
        }
    } elseif (preg_match('/^(.+?)\s+by\s+(.+)$/iu', $name, $m)) {
        $title = clean_text($m[1] ?? '');
        $artist = clean_text($m[2] ?? '');
    } else {
        $title = clean_text($name);
    }
    return ['title'=>$title, 'artist'=>$artist];
}

function midi_meta(string $filepath, ?string $relPath = null): array {
    $res = ['title'=>'', 'artist'=>''];
    $bin = @file_get_contents($filepath, false, null, 0, MAX_READ_BYTES);
    if ($bin === false) return $res;

    if (preg_match('/@T([^\r\n]+)/', $bin, $m)) {
        $res['title'] = clean_text($m[1] ?? '');
    }
    if (preg_match('/@I([^\r\n]+)/', $bin, $m)) {
        $artist = clean_text($m[1] ?? '');
        if (preg_match('/\bby\s+(.+)$/i', $artist, $m2)) {
            $artist = clean_text($m2[1] ?? '');
        }
        $res['artist'] = $artist;
    }

    if ($res['title'] === '' && preg_match('/Title\s*[:=]\s*([^\r\n]+)/i', $bin, $m)) {
        $res['title'] = clean_text($m[1] ?? '');
    }
    if ($res['artist'] === '' && preg_match('/Artist\s*[:=]\s*([^\r\n]+)/i', $bin, $m)) {
        $res['artist'] = clean_text($m[1] ?? '');
    }

    $texts = extract_meta_text_events($bin);
    foreach ($texts as $t) {
        if (mb_strlen($t) <= 2) continue;
        if (preg_match('/^lyric/i', $t)) continue;
        if ($res['title'] === '' && !preg_match('/(track|midi|karaoke)/i', $t)) {
            if (preg_match('/^(.+?)\s*-\s*(.+)$/', $t, $mm)) {
                $res['title'] = clean_text($mm[1] ?? '');
                if ($res['artist'] === '') $res['artist'] = clean_text($mm[2] ?? '');
                continue;
            }
            if (preg_match('/^(.+?)\s+by\s+(.+)$/i', $t, $mm)) {
                $res['title'] = clean_text($mm[1] ?? '');
                if ($res['artist'] === '') $res['artist'] = clean_text($mm[2] ?? '');
                continue;
            }
            if ($res['title'] === '' && mb_strlen($t) >= 3 && mb_strlen($t) <= 80) {
                $res['title'] = clean_text($t);
                continue;
            }
        } elseif ($res['artist'] === '' && preg_match('/^(artist|singer|performer)[:=\s]+(.+)$/i', $t, $mm)) {
            $res['artist'] = clean_text($mm[2] ?? '');
        }
        if ($res['title'] !== '' && $res['artist'] !== '') break;
    }

    $pi = pathinfo($filepath);
    $fnameMeta = filename_to_meta($pi['basename'] ?? '');
    if ($res['title'] === '') $res['title'] = clean_text($fnameMeta['title'] ?? '');
    if ($res['artist'] === '') $res['artist'] = clean_text($fnameMeta['artist'] ?? '');

    $res['title'] = trim($res['title'], "- \t.");
    $res['artist'] = trim($res['artist'], "- \t.");

    return $res;
}

/* --------------------- FILE OPS --------------------- */
function safe_name(string $s): string {
    $s = clean_text($s);
    $s = preg_replace('/[\/\\\?\*\:\|"<>\x00-\x1F]+/u', ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

function build_new_filename(string $title, string $artist, string $ext): string {
    $title = safe_name($title);
    $artist = safe_name($artist);
    $base = $title !== '' ? $title : 'Untitled';
    if ($artist !== '') $base .= ' - ' . $artist;
    return $base . '.' . strtolower($ext);
}

function unique_name_in_dir(string $dirAbs, string $filename): string {
    $path = $dirAbs . '/' . $filename;
    if (!file_exists($path)) return $filename;
    $pi = pathinfo($filename);
    $name = $pi['filename'] ?? 'file';
    $ext = isset($pi['extension']) ? ('.' . $pi['extension']) : '';
    for ($i=1; $i<10000; $i++) {
        $candidate = $name . " ($i)" . $ext;
        if (!file_exists($dirAbs . '/' . $candidate)) return $candidate;
    }
    return $filename;
}

/* -------------------- META CACHE -------------------- */
function cache_load(): array {
    $path = CACHE_FILE;
    if (!is_file($path)) return [];
    $json = @file_get_contents($path);
    if ($json === false) return [];
    $arr = json_decode($json, true);
    return is_array($arr) ? $arr : [];
}
function cache_save(array $cache): void {
    @file_put_contents(CACHE_FILE, json_encode($cache, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
}
function cache_get_meta(string $abs, string $rel): array {
    static $cache;
    if ($cache === null) $cache = cache_load();
    $mtime = @filemtime($abs) ?: 0;
    $key = $rel;
    $hit = $cache[$key] ?? null;
    if (is_array($hit) && ($hit['mtime'] ?? 0) === $mtime) {
        return ['title'=>clean_text($hit['title'] ?? ''), 'artist'=>clean_text($hit['artist'] ?? '')];
    }
    $meta = midi_meta($abs, $rel);
    $cache[$key] = ['title'=>$meta['title'] ?? '', 'artist'=>$meta['artist'] ?? '', 'mtime'=>$mtime];
    cache_save($cache);
    return $meta;
}
function cache_remove(string $rel): void {
    static $cache;
    if ($cache === null) $cache = cache_load();
    if (isset($cache[$rel])) {
        unset($cache[$rel]);
        cache_save($cache);
    }
}
function cache_set(string $rel, array $meta, int $mtime): void {
    static $cache;
    if ($cache === null) $cache = cache_load();
    $cache[$rel] = ['title'=>clean_text($meta['title'] ?? ''), 'artist'=>clean_text($meta['artist'] ?? ''), 'mtime'=>$mtime];
    cache_save($cache);
}

/* -------------------- STATE: DIR -------------------- */
$currentRel = isset($_GET['dir']) ? clean_rel((string)$_GET['dir']) : '';
$currentAbs = resolve_in_base($currentRel);
if ($currentAbs === '') {
    $currentRel = '';
    $currentAbs = base_path();
}

/* -------------------- HANDLE POST -------------------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Normalize action based on button names
    $action = $_POST['action'] ?? '';
    $token = $_POST['csrf'] ?? '';

    // Map per-row buttons to canonical action + file
    if (isset($_POST['rename_file'])) {
        $action = 'rename';
        $_POST['file'] = $_POST['rename_file'];
    } elseif (isset($_POST['delete_file'])) {
        $action = 'delete';
        $_POST['file'] = $_POST['delete_file'];
    }
    // Fallback when Enter pressed in target_folder
    if ($action === '' && isset($_POST['target_folder'])) {
        $action = 'move_selected';
    }

    $dirRel = clean_rel($_POST['dir'] ?? $currentRel);
    $dirAbs = resolve_in_base($dirRel);
    if ($dirAbs === '') $dirAbs = $currentAbs;

    try {
        csrf_check($token);

        if ($action === 'rename') {
            $file = basename((string)($_POST['file'] ?? ''));
            $srcRel = ($dirRel ? $dirRel.'/' : '') . $file;
            $src = resolve_in_base($srcRel);
            if ($src === '' || !is_file($src)) throw new RuntimeException('File not found.');
            if (!is_allowed_ext($src)) throw new RuntimeException('Not a permitted MIDI file.');

            // Read row-specific inputs
            $title  = (string)($_POST['title'][$file]  ?? '');
            $artist = (string)($_POST['artist'][$file] ?? '');

            $ext = pathinfo($src, PATHINFO_EXTENSION);
            $newName = build_new_filename($title, $artist, $ext);
            $newName = unique_name_in_dir($dirAbs, $newName);
            $dst = $dirAbs . '/' . $newName;
            $dstRel = ($dirRel ? $dirRel.'/' : '') . $newName;
            if (!@rename($src, $dst)) throw new RuntimeException('Rename failed.');
            add_msg('ok', "Renamed to <b>".h($newName)."</b>");
            cache_remove($srcRel);
            $mtime = @filemtime($dst) ?: time();
            cache_set($dstRel, ['title'=>$title, 'artist'=>$artist], $mtime);

        } elseif ($action === 'delete') {
            $file = basename((string)($_POST['file'] ?? ''));
            $srcRel = ($dirRel ? $dirRel.'/' : '') . $file;
            $src = resolve_in_base($srcRel);
            if ($src === '' || !is_file($src)) throw new RuntimeException('File not found.');
            if (!is_allowed_ext($src)) throw new RuntimeException('Not a permitted MIDI file.');
            if (!@unlink($src)) throw new RuntimeException('Delete failed.');
            add_msg('ok', "Deleted <b>".h($file)."</b>");
            cache_remove($srcRel);

        } elseif ($action === 'create_folder') {
            $folder = trim((string)($_POST['folder'] ?? ''));
            if ($folder === '') throw new RuntimeException('Folder name is empty.');
            $segments = array_map('safe_name', array_filter(explode('/', str_replace('\\','/',$folder))));
            $safeRel = implode('/', array_filter($segments, fn($x) => $x !== ''));
            if ($safeRel === '') throw new RuntimeException('Invalid folder name.');
            $targetAbs = resolve_in_base(($dirRel ? $dirRel.'/' : '') . $safeRel, true);
            if ($targetAbs === '') throw new RuntimeException('Invalid target path.');
            if (!is_dir($targetAbs)) {
                if (!@mkdir($targetAbs, 0775, true)) throw new RuntimeException('Failed to create folder.');
            }
            add_msg('ok', "Folder created: <b>".h($safeRel)."</b>");

        } elseif ($action === 'move_selected') {
            $target = (string)($_POST['target_folder'] ?? '');
            $files = isset($_POST['selected']) && is_array($_POST['selected']) ? $_POST['selected'] : [];
            if ($target === '') throw new RuntimeException('Target folder name is empty.');
            if (count($files) === 0) throw new RuntimeException('No files selected.');
            $segments = array_map('safe_name', array_filter(explode('/', str_replace('\\','/',$target))));
            $safeRel = implode('/', array_filter($segments, fn($x) => $x !== ''));
            if ($safeRel === '') throw new RuntimeException('Invalid target folder name.');
            $targetAbs = resolve_in_base(($dirRel ? $dirRel.'/' : '') . $safeRel, true);
            if ($targetAbs === '') throw new RuntimeException('Invalid target path.');
            if (!is_dir($targetAbs)) {
                if (!@mkdir($targetAbs, 0775, true)) throw new RuntimeException('Failed to create target folder.');
            }

            $moved = 0; $skipped = 0;
            foreach ($files as $f) {
                $f = basename((string)$f);
                $srcRel = ($dirRel ? $dirRel.'/' : '') . $f;
                $src = resolve_in_base($srcRel);
                if ($src === '' || !is_file($src) || !is_allowed_ext($src)) { $skipped++; continue; }
                $dstName = unique_name_in_dir($targetAbs, $f);
                $dst = $targetAbs . '/' . $dstName;
                $dstRel = ($dirRel ? $dirRel.'/' : '') . $safeRel . '/' . $dstName;
                if (@rename($src, $dst)) {
                    $moved++;
                    cache_remove($srcRel);
                    $mtime = @filemtime($dst) ?: time();
                    $meta = midi_meta($dst, $dstRel);
                    cache_set($dstRel, $meta, $mtime);
                } else {
                    $skipped++;
                }
            }
            add_msg('ok', "Moved <b>$moved</b> file(s). Skipped <b>$skipped</b>.");

        } elseif ($action === 'upload') {
            if (!isset($_FILES['files'])) throw new RuntimeException('No files uploaded.');
            $count = count($_FILES['files']['name']);
            $saved = 0; $skipped = 0;
            for ($i=0; $i<$count; $i++) {
                $name = basename((string)($_FILES['files']['name'][$i] ?? ''));
                $tmp = $_FILES['files']['tmp_name'][$i] ?? '';
                $err = $_FILES['files']['error'][$i] ?? UPLOAD_ERR_OK;
                if ($err !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) { $skipped++; continue; }
                if (!is_allowed_ext($name)) { $skipped++; continue; }
                $name = safe_name($name);
                $destName = unique_name_in_dir($dirAbs, $name);
                $dest = $dirAbs . '/' . $destName;
                if (@move_uploaded_file($tmp, $dest)) {
                    $saved++;
                    $rel = ($dirRel ? $dirRel.'/' : '') . $destName;
                    $mtime = @filemtime($dest) ?: time();
                    $meta = midi_meta($dest, $rel);
                    cache_set($rel, $meta, $mtime);
                } else {
                    $skipped++;
                }
            }
            add_msg('ok', "Uploaded <b>$saved</b> file(s). Skipped <b>$skipped</b>.");
        }
    } catch (Throwable $e) {
        add_msg('err', $e->getMessage());
    }

    $qsParts = [];
    if ($dirRel !== '') $qsParts['dir'] = $dirRel;
    if (isset($_GET['page'])) $qsParts['page'] = (string)$_GET['page'];
    if (isset($_GET['q'])) $qsParts['q'] = (string)$_GET['q'];
    $qs = empty($qsParts) ? '' : ('?' . http_build_query($qsParts));
    header('Location: '.$_SERVER['PHP_SELF'].$qs);
    exit;
}

/* -------------------- DIRECTORY LIST -------------------- */
$items = scandir($currentAbs) ?: [];
$dirs = [];
$files = [];
foreach ($items as $it) {
    if ($it === '.' || $it === '..') continue;
    $p = $currentAbs . '/' . $it;
    if (is_dir($p)) $dirs[] = $it;
    elseif (is_file($p) && is_allowed_ext($it)) $files[] = $it;
}
natcasesort($dirs);
natcasesort($files);
$files = array_values($files);

/* -------------------- SEARCH + META -------------------- */
$q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
$display = [];
foreach ($files as $f) {
    $rel = ($currentRel ? $currentRel.'/' : '') . $f;
    $abs = $currentAbs . '/' . $f;
    $meta = cache_get_meta($abs, $rel);
    if ($q !== '') {
        $hay = strtolower((string)$f . ' ' . ($meta['title'] ?? '') . ' ' . ($meta['artist'] ?? ''));
        if (strpos($hay, strtolower($q)) === false) continue;
    }
    $display[] = ['name'=>$f, 'meta'=>$meta, 'abs'=>$abs];
}

/* -------------------- PAGINATION -------------------- */
$total = count($display);
$page = max(1, (int)($_GET['page'] ?? 1));
$pages = max(1, (int)ceil($total / ITEMS_PER_PAGE));
if ($page > $pages) $page = $pages;
$start = ($page - 1) * ITEMS_PER_PAGE;
$visible = array_slice($display, $start, ITEMS_PER_PAGE);

/* ----------------------- VIEW ----------------------- */
$messages = take_msgs();
$token = csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MIDI Mini File Manager</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    :root { color-scheme: light dark; --bg:#111; --fg:#eee; --muted:#888; --ok:#2d8a34; --err:#b51d1d; --accent:#3366cc; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 16px; }
    header { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom: 12px; justify-content:space-between; }
    .crumbs a { text-decoration:none; color: var(--accent); }
    .crumbs span { color: var(--muted); }
    .panel { background:#f6f6f6; border:1px solid #ddd; border-radius:8px; padding:12px; }
    @media (prefers-color-scheme: dark) {
        .panel { background:#1b1b1b; border-color:#333; }
        body { background:#121212; color:#eaeaea; }
        input, button { background:#1a1a1a; color:#eaeaea; border-color:#444; }
    }
    .msgs { margin-bottom: 10px; }
    .msg { padding:8px 10px; border-radius:6px; margin-bottom:6px; }
    .msg.ok { background: #e8f5ea; color:#1f4f23; border:1px solid #bfe2c3; }
    .msg.err { background: #fde8e8; color:#5a1212; border:1px solid #f3bcbc; }

    table { width:100%; border-collapse: collapse; margin-top:10px; font-size:14px; }
    th, td { padding:8px; border-bottom:1px solid #ddd; vertical-align: middle; }
    th { text-align:left; }
    .right { text-align:right; white-space:nowrap; }
    .muted { color: var(--muted); }

    input[type="text"] { width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:6px; }
    .actions button { padding:6px 10px; margin:0 4px 4px 0; border-radius:6px; border:1px solid #888; background:#eee; cursor:pointer; }
    .actions .danger { border-color:#b51d1d; color:#b51d1d; background:#fff; }
    .rowform { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .small { font-size:12px; }
    .dirlist a { text-decoration:none; }
    .selectall { margin-left: 8px; font-size:12px; color:var(--muted); }

    .grid { overflow-x:auto; }

    .uploader { border:2px dashed #999; border-radius:8px; padding:10px; text-align:center; }
    .uploader.drag { border-color: var(--accent); background: rgba(51,102,204,0.08); }
    .paging { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; margin-top:8px; }
    .paging a { text-decoration:none; padding:4px 8px; border:1px solid #999; border-radius:6px; }
    .paging .cur { font-weight:bold; }
</style>
</head>
<body>

<header>
    <div>
        <strong>Base:</strong> <span class="muted"><?=h(base_path())?></span>
        <div class="crumbs" style="margin-top:6px;">
            <?php
            $crumbs = [];
            $accum = '';
            $crumbs[] = '<a href="'.h($_SERVER['PHP_SELF']).'">/</a>';
            if ($currentRel !== '') {
                $parts = explode('/', $currentRel);
                foreach ($parts as $i => $p) {
                    $accum = $accum === '' ? $p : ($accum.'/'.$p);
                    $crumbs[] = '<span>/</span> <a href="'.h($_SERVER['PHP_SELF']).'?dir='.rawurlencode($accum).'">'.h($p).'</a>';
                }
            }
            echo implode(' ', $crumbs);
            ?>
        </div>
    </div>
    <form method="get" action="" class="rowform" style="gap:8px;">
        <input type="hidden" name="dir" value="<?=h($currentRel)?>">
        <input type="text" name="q" placeholder="Search filename / title / artist" value="<?=h($q)?>" style="min-width:240px;">
        <button type="submit">Search</button>
        <?php if ($q !== ''): ?><a href="<?=h($_SERVER['PHP_SELF']).($currentRel!==''?'?dir='.rawurlencode($currentRel):'')?>" class="small">Clear</a><?php endif; ?>
    </form>
</header>

<?php if ($messages): ?>
<div class="msgs">
    <?php foreach ($messages as $m): ?>
        <div class="msg <?=h($m['t'])?>"><?php echo $m['m']; ?></div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<div class="panel">
    <form class="rowform" method="post" action="" enctype="multipart/form-data">
        <input type="hidden" name="dir" value="<?=h($currentRel)?>">
        <input type="hidden" name="action" value="upload">
        <input type="hidden" name="csrf" value="<?=h($token)?>">
        <div style="flex:1;min-width:280px;">
            <div class="uploader" id="dropZone">
                <div><strong>Upload MIDI</strong> (.mid .midi .kar)</div>
                <div class="small muted">Drag & drop here or use the picker</div>
                <div style="margin-top:6px;"><input type="file" name="files[]" multiple accept=".mid,.midi,.kar"></div>
            </div>
        </div>
        <div><button type="submit">Upload</button></div>
    </form>
</div>

<div class="panel" style="margin-top:12px;">
    <form class="rowform" method="post" action="">
        <input type="hidden" name="dir" value="<?=h($currentRel)?>">
        <input type="hidden" name="action" value="create_folder">
        <input type="hidden" name="csrf" value="<?=h($token)?>">
        <div><strong>Create folder:</strong></div>
        <div style="min-width:220px;"><input type="text" name="folder" placeholder="e.g., New Set / Disc 1"></div>
        <div><button type="submit">Create</button></div>
    </form>
</div>

<div class="panel" style="margin-top:12px;">
    <div><strong>Folders</strong> (<?=count($dirs)?>)</div>
    <div class="dirlist">
        <?php if ($currentRel !== ''): ?>
            <?php
                $upDir = dirname($currentRel);
                if ($upDir === '.') $upDir = '';
                $upUrl = $_SERVER['PHP_SELF'] . ($upDir !== '' ? ('?dir=' . rawurlencode($upDir)) : '');
            ?>
            <div>📁 <a href="<?=h($upUrl)?>">.. (Up)</a></div>
        <?php endif; ?>
        <?php foreach ($dirs as $d): ?>
            <?php
                $to = ($currentRel === '' ? $d : $currentRel . '/' . $d);
                $href = $_SERVER['PHP_SELF'] . '?dir=' . rawurlencode($to);
            ?>
            <div>📁 <a href="<?=h($href)?>"><?=h($d)?></a></div>
        <?php endforeach; ?>
        <?php if (empty($dirs)): ?>
            <div class="muted small">No subfolders</div>
        <?php endif; ?>
    </div>
</div>

<div class="panel" style="margin-top:12px;">
    <form method="post" action="" id="batchForm">
        <input type="hidden" name="dir" value="<?=h($currentRel)?>">
        <input type="hidden" name="csrf" value="<?=h($token)?>">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div><strong>MIDI Files</strong> (<?=$total?> total<?= $q!==''? ', filtered':'' ?>)</div>
            <div class="rowform small">
                <div>Move selected to folder:</div>
                <div><input type="text" name="target_folder" placeholder="e.g., Ballads / 90s OPM" style="min-width:220px;"></div>
                <div>
                    <button type="submit" name="action" value="move_selected">Move</button>
                </div>
                <div class="selectall"><label><input type="checkbox" id="selAll"> Select all (this page)</label></div>
            </div>
        </div>

        <div class="grid">
            <table>
                <thead>
                    <tr>
                        <th style="width:28px;"></th>
                        <th>File</th>
                        <th style="width:28%;">Title</th>
                        <th style="width:22%;">Artist</th>
                        <th class="right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                <?php if (empty($visible)): ?>
                    <tr><td colspan="5" class="muted">No MIDI files here. Supported: .mid .midi .kar</td></tr>
                <?php else: ?>
                    <?php foreach ($visible as $row):
                        $f = $row['name'];
                        $abs = $row['abs'];
                        $meta = $row['meta'];
                        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                        $sizeKB = number_format(filesize($abs) / 1024, 1);
                    ?>
                    <tr>
                        <td><input type="checkbox" name="selected[]" value="<?=h($f)?>" class="rowchk"></td>
                        <td>
                            <div><strong><?=h($f)?></strong></div>
                            <div class="small muted"><?=$ext?> · <?=$sizeKB?> KB</div>
                        </td>
                        <td>
                            <input type="text" name="title[<?=h($f)?>]" placeholder="Title" value="<?=h($meta['title'] ?? '')?>">
                        </td>
                        <td>
                            <input type="text" name="artist[<?=h($f)?>]" placeholder="Artist (optional)" value="<?=h($meta['artist'] ?? '')?>">
                        </td>
                        <td class="right actions">
                            <button type="submit" name="rename_file" value="<?=h($f)?>">Rename</button>
                            <button type="submit" name="delete_file" value="<?=h($f)?>" class="danger" onclick="return confirm('Delete this file?')">Delete</button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>
    </form>

    <div class="paging">
        <div class="small muted">Page <?=$page?> of <?=$pages?></div>
        <?php
        $baseQS = ['dir'=>$currentRel];
        if ($q !== '') $baseQS['q'] = $q;
        for ($p=1; $p<=$pages; $p++) {
            $qs = http_build_query(array_merge($baseQS, ['page'=>$p]));
            $href = h($_SERVER['PHP_SELF'].'?'.$qs);
            if ($p === $page) echo '<span class="cur">'.$p.'</span>'; else echo '<a href="'.$href.'">'.$p.'</a>';
        }
        ?>
    </div>
</div>

<script>
// Select all checkboxes for this page
const selAll = document.getElementById('selAll');
if (selAll) {
  selAll.addEventListener('change', function(){
    document.querySelectorAll('.rowchk').forEach(cb => cb.checked = this.checked);
  });
}
// Drag & drop uploader UI
(function(){
  const dz = document.getElementById('dropZone');
  if (!dz) return;
  const fileInput = dz.querySelector('input[type="file"]');
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files) return;
    fileInput.files = dt.files;
  });
})();
</script>
</body>
</html>
