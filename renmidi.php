<?php
/**
 * midi_kar_rename_by_meta_v1.1.php
 * Read MIDI/KAR meta Title & Artist, rename files to "Title - Artist.ext".
 * If meta incomplete -> skip, write to manual_rename.csv.
 * Sem • v1.1 • 2025-10-18
 *
 * WEB:  http://localhost/midi_kar_rename_by_meta_v1.1.php
 * CLI:  php midi_kar_rename_by_meta_v1.1.php --root "/path" --dry 1 --ext "mid,midi,kar"
 */

declare(strict_types=1);

const DEF_EXTS   = 'mid,midi,kar';
const DEF_DRYRUN = true;
const MAX_DETAILS= 5000;
const TIMEZONE   = 'Asia/Manila';

date_default_timezone_set(TIMEZONE);

// ---------- helpers ----------
function boolish($x, bool $def): bool {
  if ($x===null || $x==='') return $def;
  $t = strtolower((string)$x);
  return in_array($t, ['1','true','on','yes','y'], true);
}
function cleanExts(string $csv): array {
  return array_values(array_filter(array_map(fn($s)=>ltrim(strtolower(trim($s)),'.'), explode(',', $csv))));
}
function humanBytes(int $b): string {
  $u=['B','KB','MB','GB','TB']; $i=0; $f=(float)$b;
  while($f>=1024 && $i<count($u)-1){ $f/=1024; $i++; }
  return sprintf(($f>=10?'%d %s':'%.1f %s'), $f, $u[$i]);
}
function extLower(string $path): string { return strtolower(pathinfo($path, PATHINFO_EXTENSION)); }
function isWantedExt(string $path, array $exts): bool { return in_array(extLower($path), $exts, true); }
function safeJoin(string $dir, string $name): string {
  $dir = rtrim($dir, DIRECTORY_SEPARATOR);
  return $dir . DIRECTORY_SEPARATOR . $name;
}
function sanitizeTag(string $s): string {
  $s = preg_replace('/[\x00-\x1F\x7F]/', '', $s);
  $s = preg_replace('/\s+/', ' ', $s);
  $s = trim($s, " \t\r\n.-_");
  return $s;
}
function sanitizeFileBase(string $title, string $artist): string {
  $t = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], ' ', sanitizeTag($title));
  $a = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], ' ', sanitizeTag($artist));
  $base = trim($t . ' - ' . $a);
  $base = preg_replace('/\s*-\s*/', ' - ', $base);
  $base = preg_replace('/\s{2,}/', ' ', $base);
  if (strlen($base) > 160) $base = substr($base, 0, 160);
  return $base;
}

// ---------- scanner ----------
function scanFiles(string $root, array $exts): array {
  $files = [];
  $it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS),
    RecursiveIteratorIterator::SELF_FIRST
  );
  foreach ($it as $fi) {
    if (!$fi->isFile() || $fi->isLink()) continue;
    $path = $fi->getPathname();
    if (!isWantedExt($path, $exts)) continue;
    $files[] = [
      'path' => $path,
      'size' => $fi->getSize(),
      'mtime'=> $fi->getMTime(),
      'ext'  => extLower($path),
    ];
  }
  return $files;
}

// ---------- MIDI/KAR meta ----------
function readVarLen(string $bin, int &$i): int {
  $value = 0; $limit = strlen($bin);
  do {
    if ($i >= $limit) return 0;
    $c = ord($bin[$i++]);
    $value = ($value << 7) + ($c & 0x7F);
  } while ($c & 0x80);
  return $value;
}
function midiReadTracksMetaTexts(string $bin): array {
  $out = ['trackNames'=>[],'texts'=>[],'lyrics'=>[],'copyrights'=>[],'markers'=>[]];
  $len = strlen($bin);
  if ($len < 8 || substr($bin,0,4) !== 'MThd') return $out;
  $hdrLen = unpack('N', substr($bin,4,4))[1];
  $offset = 8 + $hdrLen;

  while ($offset + 8 <= $len) {
    $chunkType = substr($bin, $offset, 4);
    $chunkLen  = unpack('N', substr($bin, $offset+4, 4))[1];
    $dataStart = $offset + 8;
    $dataEnd   = $dataStart + $chunkLen;
    if ($dataEnd > $len) break;

    if ($chunkType === 'MTrk') {
      $i = $dataStart;
      while ($i < $dataEnd) {
        if ($i >= $dataEnd) break;
        $b = ord($bin[$i]);
        if ($b === 0xFF && $i+1 < $dataEnd) {
          $type = ord($bin[$i+1]); $i += 2;
          $metaLen = readVarLen($bin, $i);
          if ($metaLen < 0 || $i + $metaLen > $dataEnd) { $i++; continue; }
          $payload = substr($bin, $i, $metaLen);
          $i += $metaLen;
          switch ($type) {
            case 0x01: $out['texts'][]      = $payload; break;
            case 0x02: $out['copyrights'][] = $payload; break;
            case 0x03: $out['trackNames'][] = $payload; break;
            case 0x05: $out['lyrics'][]     = $payload; break;
            case 0x06: $out['markers'][]    = $payload; break;
          }
        } else { $i++; }
      }
    }
    $offset = $dataEnd;
  }
  return $out;
}
function extractTitleArtistFromMeta(array $meta): array {
  $title = ''; $artist = '';
  $allText = implode("\n", array_merge($meta['texts'], $meta['lyrics']));
  if ($allText !== '') {
    $allText = str_replace("\r", "\n", $allText);
    if (preg_match('/(^|\n)@T[ \t]+(.+?)\n/i', $allText, $m)) $title  = $m[2];
    if (preg_match('/(^|\n)@A[ \t]+(.+?)\n/i', $allText, $m)) $artist = $m[2];
    if ($title===''  && preg_match('/(^|\n)Title:\s*(.+?)\n/i',  $allText, $m)) $title  = $m[2];
    if ($artist==='' && preg_match('/(^|\n)Artist:\s*(.+?)\n/i', $allText, $m)) $artist = $m[2];
    if ($artist==='' && preg_match('/\bby\s+([A-Za-z0-9].+?)(?:\n|$)/i', $allText, $m)) $artist = $m[1];
  }
  if ($title==='') {
    foreach ($meta['trackNames'] as $tn) {
      $tn = trim($tn);
      if ($tn==='' || preg_match('/^(karaoke|lyrics?|track\s*\d+)$/i', $tn)) continue;
      $title = $tn; break;
    }
  }
  if ($artist==='') {
    foreach (array_merge($meta['texts'],$meta['markers'],$meta['copyrights']) as $t) {
      if (preg_match('/(Artist|Singer|Performed\s+by)\s*:\s*(.+)/i', $t, $m)) { $artist = $m[2]; break; }
      if (preg_match('/\bby\s+([A-Za-z0-9].+)/i', $t, $m)) { $artist = $m[1]; break; }
      if (preg_match('/$$(.*?)$$/', $t, $m) && strlen($m[1])>=3) { $artist = $m[1]; }
    }
  }
  $title  = sanitizeTag($title);
  $artist = sanitizeTag($artist);
  if ($artist && preg_match('/$$(.*?)$$$/', $title, $m) && stripos($m[1], $artist)!==false) {
    $title = trim(preg_replace('/\s*$$.*?$$\s*$/', '', $title));
  }
  return [$title, $artist];
}
function readTitleArtist(string $path): array {
  $bin = @file_get_contents($path);
  if ($bin===false || strlen($bin)<8) return ['', ''];
  if (preg_match('/@T[ \t]+(.+?)(\r?\n|$)/', $bin, $mT)) {
    $title  = sanitizeTag($mT[1]); $artist = '';
    if (preg_match('/@A[ \t]+(.+?)(\r?\n|$)/', $bin, $mA)) $artist = sanitizeTag($mA[1]);
    if ($title !== '' && $artist !== '') return [$title, $artist];
  }
  $meta = midiReadTracksMetaTexts($bin);
  return extractTitleArtistFromMeta($meta);
}

// ---------- rename ----------
function renameOne(string $path, string $root, bool $dryRun): array {
  $ext   = extLower($path);
  [$title, $artist] = readTitleArtist($path);
  if ($title==='' || $artist==='') {
    return ['status'=>'skip', 'reason'=>'insufficient meta', 'old'=>$path, 'new'=>'', 'title'=>$title, 'artist'=>$artist];
  }
  $base  = sanitizeFileBase($title, $artist);
  if ($base==='') {
    return ['status'=>'skip', 'reason'=>'empty sanitized base', 'old'=>$path, 'new'=>'', 'title'=>$title, 'artist'=>$artist];
  }
  $dir   = dirname($path);
  $new   = safeJoin($dir, $base . '.' . $ext);

  $cnt = 1; $name = $base;
  while (file_exists($new)) {
    $name = $base . " ($cnt)";
    $new  = safeJoin($dir, $name . '.' . $ext);
    $cnt++;
    if ($cnt > 999) return ['status'=>'skip','reason'=>'too many collisions','old'=>$path,'new'=>'','title'=>$title,'artist'=>$artist];
  }

  if ($dryRun) {
    return ['status'=>'would_rename', 'reason'=>'dry-run', 'old'=>$path, 'new'=>$new, 'title'=>$title, 'artist'=>$artist];
  } else {
    $ok = @rename($path, $new);
    return ['status'=>$ok?'renamed':'rename_failed', 'reason'=>$ok?'':'rename error', 'old'=>$path, 'new'=>$ok?$new:'', 'title'=>$title, 'artist'=>$artist];
  }
}

function writeManualCsv(string $baseDir, array $rows): string {
  $file = safeJoin($baseDir, 'manual_rename_' . date('Ymd_His') . '.csv');
  $fp = @fopen($file, 'w'); if (!$fp) return '';
  fputcsv($fp, ['old_path','title_detected','artist_detected','reason']);
  foreach ($rows as $r) fputcsv($fp, [$r['old'],$r['title'],$r['artist'],$r['reason'] ?? '']);
  fclose($fp);
  return $file;
}

// ---------- run (CLI / WEB) ----------
if (php_sapi_name() === 'cli') {
  $opts = getopt('', ['root:','dry::','ext::']);
  $root = isset($opts['root']) ? (string)$opts['root'] : getcwd();
  $dry  = boolish($opts['dry'] ?? '1', DEF_DRYRUN);
  $exts = cleanExts((string)($opts['ext'] ?? DEF_EXTS));
  if (!is_dir($root)) { fwrite(STDERR, "Base path not found: $root\n"); exit(2); }

  $files = scanFiles($root, $exts);
  $todo  = count($files);
  $skipRows=[]; $renamed=0; $would=0; $fail=0; $bytes=0;

  foreach ($files as $f) {
    $res = renameOne($f['path'], $root, $dry);
    if ($res['status']==='skip') { $skipRows[]=$res; }
    elseif ($res['status']==='renamed') { $renamed++; $bytes += $f['size']; echo "RENAMED: {$res['old']} -> {$res['new']}\n"; }
    elseif ($res['status']==='would_rename') { $would++; echo "DRY: {$res['old']} -> {$res['new']}\n"; }
    else { $fail++; echo "FAILED: {$res['old']} ({$res['reason']})\n"; }
  }

  $csv = '';
  if (!empty($skipRows)) $csv = writeManualCsv($root, $skipRows);

  echo "== Rename by Meta (MIDI/KAR) ==\n";
  echo "Base: $root\nDry-run: " . ($dry?'Yes':'No') . "\n";
  echo "Scanned files: $todo\nWould rename: $would; Renamed: $renamed; Failed: $fail; Skipped (manual): ".count($skipRows)."\n";
  if ($csv) echo "Manual rename CSV: $csv\n";
  exit(0);

} else {
  // WEB — fixed checkbox handling
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $root = isset($_POST['root']) ? (string)$_POST['root'] : getcwd();
    $dry  = isset($_POST['dry']); // unchecked -> false
    $exts = cleanExts((string)($_POST['ext'] ?? DEF_EXTS));
  } else {
    $root = getcwd();
    $dry  = DEF_DRYRUN;
    $exts = cleanExts(DEF_EXTS);
  }

  $h = fn($s)=>htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

  $files = is_dir($root) ? scanFiles($root, $exts) : [];
  $todo  = count($files);
  $skipRows=[]; $renamed=0; $would=0; $fail=0; $bytes=0; $details=[];

  foreach ($files as $f) {
    $res = renameOne($f['path'], $root, $dry);
    if ($res['status']==='skip') { $skipRows[]=$res; }
    elseif ($res['status']==='renamed') { $renamed++; $bytes += $f['size']; }
    elseif ($res['status']==='would_rename') { $would++; }
    else { $fail++; }
    $details[] = array_merge($res, ['size'=>$f['size']]);
    if (count($details) >= MAX_DETAILS) break;
  }

  $csv = '';
  if (!empty($skipRows) && is_dir($root)) $csv = writeManualCsv($root, $skipRows);
  ?>
<!doctype html>
<meta charset="utf-8">
<title>MIDI/KAR Rename by Meta</title>
<style>
 body{font:14px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b1620;color:#eaf2ff;padding:18px}
 .wrap{max-width:1060px;margin:auto}
 h1{margin:0 0 12px 0;font-size:20px}
 .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;margin:10px 0}
 label{display:block;margin:6px 0}
 input[type=text]{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0e2233;color:#eaf2ff}
 .row{display:flex;gap:12px;flex-wrap:wrap}
 .row > div{flex:1 1 240px}
 .btn{background:#1a7ef5;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
 .note{color:#9fb6c9;font-size:12px}
 table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
 th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px 8px;text-align:left}
 code{color:#bfe5ff}
 .pill{display:inline-block;background:#fff;color:#142230;border-radius:999px;padding:.15em .6em;font-size:12px;margin-left:6px}
 .ok{color:#98e695} .warn{color:#ffd38a} .err{color:#ffb3b3}
</style>
<div class="wrap">
  <h1>MIDI/KAR Rename by Meta</h1>
  <form method="post" class="card">
    <div class="row">
      <div><label>Base folder <input type="text" name="root" value="<?=$h($root)?>" required></label></div>
      <div><label>Extensions (csv) <input type="text" name="ext" value="<?=$h(implode(',', $exts))?>"></label></div>
      <div><label><input type="checkbox" name="dry" value="1" <?= $dry?'checked':''; ?>> Dry‑run (preview only)</label></div>
    </div>
    <div class="row">
      <div><button class="btn" type="submit"><?= $dry?'Preview':'Execute Rename' ?></button></div>
      <div><span class="note">Tip: Run Dry‑run first. Files lacking Title/Artist will be listed in a CSV for manual rename.</span></div>
    </div>
  </form>

  <div class="card">
    <h3>Summary</h3>
    <div class="row">
      <div>
        <div>Base: <b><?=$h($root)?></b></div>
        <div>Exts: <?=$h(implode(', ', $exts))?></div>
        <div>Dry‑run: <?= $dry ? '<span class="pill">ON</span>' : '<span class="pill">OFF</span>' ?></div>
      </div>
      <div>
        <div>Scanned: <b><?=$h((string)$todo)?></b> files</div>
        <div>Data size (first <?=MAX_DETAILS?> shown): <?=$h(humanBytes((int)$bytes))?></div>
      </div>
      <div>
        <div>Would rename: <span class="pill"><?=$h((string)$would)?></span></div>
        <div>Renamed: <span class="pill"><?=$h((string)$renamed)?></span></div>
        <div>Failed: <span class="pill"><?=$h((string)$fail)?></span></div>
        <div>Manual rename (skipped): <span class="pill"><?= $h((string)count($skipRows)) ?></span></div>
        <div>CSV: <?= $csv ? '<code>'.$h($csv).'</code>' : '—' ?></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>Details (first <?=MAX_DETAILS?>)</h3>
    <table>
      <thead><tr><th>Status</th><th>Old path</th><th>New path</th><th>Title</th><th>Artist</th><th>Size</th></tr></thead>
      <tbody>
        <?php foreach ($details as $r): ?>
          <tr>
            <td class="<?= $r['status']==='renamed'?'ok':($r['status']==='would_rename'?'warn':'err') ?>"><?= $h($r['status']) ?></td>
            <td><code><?= $h($r['old']) ?></code></td>
            <td><code><?= $h($r['new']) ?></code></td>
            <td><?= $h($r['title']) ?></td>
            <td><?= $h($r['artist']) ?></td>
            <td><?= $h(humanBytes((int)$r['size'])) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php
}