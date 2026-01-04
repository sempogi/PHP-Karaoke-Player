<?php
/**
 * midi_kar_organize_by_artist.php
 * Sanitize filenames and organize MIDI/KAR files into subfolders by Artist.
 * - If Title & Artist present: rename to "Title - Artist.ext"
 * - If only Artist present: keep sanitized original filename, move into Artist/
 * - If Artist missing: skip (log) or move to "_Unknown Artist/" (optional)
 *
 * WEB: http://localhost/midi_kar_organize_by_artist.php
 * CLI: php midi_kar_organize_by_artist.php --root "/path" --dry 1 --ext "mid,midi,kar" --unknown move
 *
 * Sem • v1.0 • 2025-10-18
 */

declare(strict_types=1);

const TIMEZONE          = 'Asia/Manila';
const DEF_EXTS          = 'mid,midi,kar';  // CSV (lowercase/no dot)
const DEF_DRYRUN        = true;            // default: preview only
const DEF_UNKNOWN       = 'skip';          // 'skip' or 'move' (to "_Unknown Artist")
const REPORT_ROWS_LIMIT = 6000;            // web details cap
date_default_timezone_set(TIMEZONE);

// -------------------------- tiny helpers --------------------------
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
function ensureDir(string $dir): bool {
  if (!is_dir($dir)) @mkdir($dir, 0777, true);
  return is_dir($dir);
}

// -------------------------- sanitizers --------------------------
function sanitizeTag(string $s): string {
  // strip control chars, collapse spaces, trim common punctuation
  $s = preg_replace('/[\x00-\x1F\x7F]/', '', $s);
  $s = preg_replace('/\s+/', ' ', $s);
  $s = trim($s, " \t\r\n.-_");
  return $s;
}
function sanitizeForFile(string $s): string {
  $s = sanitizeTag($s);
  // replace forbidden FS chars
  $s = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], ' ', $s);
  // trim dots/spaces at ends (Windows)
  $s = trim($s, " .");
  // avoid reserved names on Windows (simple guard)
  $reserved = ['CON','PRN','AUX','NUL','COM1','LPT1','COM2','LPT2','COM3','LPT3','COM4','LPT4'];
  if (in_array(strtoupper($s), $reserved, true)) $s .= '_';
  // limit length
  if (strlen($s) > 160) $s = substr($s, 0, 160);
  return $s;
}
function sanitizeForFolder(string $s): string {
  $s = sanitizeForFile($s);
  if ($s === '') $s = '_';
  return $s;
}
function makeDestBaseTitleArtist(string $title, string $artist): string {
  $t = sanitizeForFile($title);
  $a = sanitizeForFile($artist);
  $base = trim($t . ' - ' . $a);
  $base = preg_replace('/\s*-\s*/', ' - ', $base);
  $base = preg_replace('/\s{2,}/', ' ', $base);
  if (strlen($base) > 160) $base = substr($base, 0, 160);
  return $base ?: '_';
}
function sanitizeStem(string $stem): string {
  $stem = sanitizeForFile($stem);
  return $stem !== '' ? $stem : '_';
}

// -------------------------- scan --------------------------
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
      'stem' => pathinfo($path, PATHINFO_FILENAME),
    ];
  }
  return $files;
}

// -------------------------- MIDI/KAR meta parsing --------------------------
// We reuse a lightweight parser: scan MTrk chunks, pick 0xFF metas (Text/TrackName/Lyric...), KAR tags @T/@A.
function readVarLen(string $bin, int &$i): int {
  $value = 0; $limit = strlen($bin);
  do { if ($i >= $limit) return 0; $c = ord($bin[$i++]); $value = ($value << 7) + ($c & 0x7F); } while ($c & 0x80);
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
            case 0x01: $out['texts'][]      = $payload; break; // Text
            case 0x02: $out['copyrights'][] = $payload; break;
            case 0x03: $out['trackNames'][] = $payload; break; // Track Name
            case 0x05: $out['lyrics'][]     = $payload; break; // Lyric
            case 0x06: $out['markers'][]    = $payload; break; // Marker
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
  // quick KAR tags first
  if (preg_match('/@T[ \t]+(.+?)(\r?\n|$)/', $bin, $mT)) {
    $t = sanitizeTag($mT[1]); $a = '';
    if (preg_match('/@A[ \t]+(.+?)(\r?\n|$)/', $bin, $mA)) $a = sanitizeTag($mA[1]);
    if ($t!=='' && $a!=='') return [$t,$a];
  }
  $meta = midiReadTracksMetaTexts($bin);
  return extractTitleArtistFromMeta($meta);
}

// -------------------------- organizer --------------------------
function moveWithRename(
  string $src, string $baseDir, string $artist, string $title, string $ext, string $origStem,
  bool $dry, string $unknownPolicy, array &$stats
): array {
  $hasArtist = ($artist !== '');
  if (!$hasArtist) {
    if ($unknownPolicy === 'move') {
      $artistFolder = '_Unknown Artist';
    } else {
      // skip (log for manual)
      return ['action'=>'skip_no_artist','old'=>$src,'new'=>'','artist'=>'','title'=>$title,'reason'=>'no artist meta'];
    }
  } else {
    $artistFolder = sanitizeForFolder($artist);
  }

  $targetDir = safeJoin($baseDir, $artistFolder);
  if (!$dry && !ensureDir($targetDir)) {
    return ['action'=>'move_failed','old'=>$src,'new'=>'','artist'=>$artistFolder,'title'=>$title,'reason'=>'mkdir failed'];
  }

  // Decide destination filename:
  // prefer "Title - Artist.ext" when both present; else sanitized original stem
  if ($title !== '' && $hasArtist) {
    $destBase = makeDestBaseTitleArtist($title, $artist);
  } else {
    $destBase = sanitizeStem($origStem);
  }
  $dest = safeJoin($targetDir, $destBase . '.' . $ext);

  // Avoid collisions
  $cnt = 1;
  while (file_exists($dest)) {
    $alt = $destBase . " ($cnt)." . $ext;
    $dest = safeJoin($targetDir, $alt);
    $cnt++;
    if ($cnt > 999) {
      return ['action'=>'move_failed','old'=>$src,'new'=>'','artist'=>$artistFolder,'title'=>$title,'reason'=>'too many collisions'];
    }
  }

  if ($dry) {
    $act = 'would_move';
  } else {
    // If same path (already in correct place/name), mark as 'noop'
    if (realpath($src) === realpath($dest)) {
      return ['action'=>'noop','old'=>$src,'new'=>$dest,'artist'=>$artistFolder,'title'=>$title,'reason'=>'already organized'];
    }
    // Try rename (move)
    $ok = @rename($src, $dest);
    $act = $ok ? 'moved' : 'move_failed';
    if (!$ok) {
      // Fallback copy+unlink
      if (@copy($src, $dest) && @unlink($src)) $act = 'moved';
    }
  }

  if ($act==='moved') { $stats['moved']++; } elseif ($act==='would_move') { $stats['would']++; }
  return ['action'=>$act,'old'=>$src,'new'=>$dest,'artist'=>$artistFolder,'title'=>$title,'reason'=>''];
}

function saveCsvReport(string $base, array $rows): string {
  $file = safeJoin($base, 'organize_report_' . date('Ymd_His') . '.csv');
  $fp = @fopen($file, 'w'); if (!$fp) return '';
  fputcsv($fp, ['action','artist_folder','title','old_path','new_path','reason']);
  foreach ($rows as $r) {
    fputcsv($fp, [$r['action'],$r['artist'],$r['title'],$r['old'],$r['new'],$r['reason']]);
  }
  fclose($fp);
  return $file;
}

// -------------------------- run (CLI / WEB) --------------------------
$isCli = (php_sapi_name() === 'cli');

if ($isCli) {
  $opts   = getopt('', ['root:','dry::','ext::','unknown::']);
  $root   = isset($opts['root']) ? (string)$opts['root'] : getcwd();
  $dry    = boolish($opts['dry'] ?? null, DEF_DRYRUN);
  $exts   = cleanExts((string)($opts['ext'] ?? DEF_EXTS));
  $unknown= strtolower((string)($opts['unknown'] ?? DEF_UNKNOWN));
  if (!in_array($unknown, ['skip','move'], true)) $unknown = DEF_UNKNOWN;

  if (!is_dir($root)) { fwrite(STDERR, "Base path not found: $root\n"); exit(2); }

  $files = scanFiles($root, $exts);
  $stats = ['moved'=>0,'would'=>0,'skip'=>0,'fail'=>0];
  $rows  = [];
  foreach ($files as $f) {
    [$title,$artist] = readTitleArtist($f['path']);
    $res = moveWithRename($f['path'], $root, $artist, $title, $f['ext'], $f['stem'], $dry, $unknown, $stats);
    if ($res['action']==='skip_no_artist') $stats['skip']++;
    if ($res['action']==='move_failed')    $stats['fail']++;
    $rows[] = $res;
  }
  $csv = saveCsvReport($root, $rows);

  echo "== MIDI/KAR Organizer (by Artist) ==\n";
  echo "Base: $root\nDry-run: ".($dry?'Yes':'No')."\nExts: ".implode(',',$exts)."\n";
  echo "Unknown policy: $unknown\n";
  echo "Files scanned: ".count($files)."\n";
  echo "Would move: {$stats['would']}; Moved: {$stats['moved']}; Skipped(no artist): {$stats['skip']}; Failed: {$stats['fail']}\n";
  echo "CSV: $csv\n";
  exit(0);

} else {
  // WEB
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $root    = isset($_POST['root']) ? (string)$_POST['root'] : getcwd();
    $dry     = isset($_POST['dry']); // checkbox present => true
    $exts    = cleanExts((string)($_POST['ext'] ?? DEF_EXTS));
    $unknown = strtolower((string)($_POST['unknown'] ?? DEF_UNKNOWN));
  } else {
    $root    = getcwd();
    $dry     = DEF_DRYRUN;
    $exts    = cleanExts(DEF_EXTS);
    $unknown = DEF_UNKNOWN;
  }
  if (!in_array($unknown, ['skip','move'], true)) $unknown = DEF_UNKNOWN;

  $h = fn($s)=>htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

  $files = is_dir($root) ? scanFiles($root, $exts) : [];
  $stats = ['moved'=>0,'would'=>0,'skip'=>0,'fail'=>0];
  $rows  = [];
  foreach ($files as $f) {
    [$title,$artist] = readTitleArtist($f['path']);
    $res = moveWithRename($f['path'], $root, $artist, $title, $f['ext'], $f['stem'], $dry, $unknown, $stats);
    if ($res['action']==='skip_no_artist') $stats['skip']++;
    if ($res['action']==='move_failed')    $stats['fail']++;
    $rows[] = array_merge($res, ['size'=>$f['size']]);
    if (count($rows) >= REPORT_ROWS_LIMIT) break;
  }
  $csv = is_dir($root) ? saveCsvReport($root, $rows) : '';

  ?>
<!doctype html>
<meta charset="utf-8">
<title>MIDI/KAR Organizer by Artist</title>
<style>
 body{font:14px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b1620;color:#eaf2ff;padding:18px}
 .wrap{max-width:1120px;margin:auto}
 h1{margin:0 0 12px 0;font-size:20px}
 .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;margin:10px 0}
 label{display:block;margin:6px 0}
 input[type=text],select{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0e2233;color:#eaf2ff}
 .row{display:flex;gap:12px;flex-wrap:wrap}
 .row > div{flex:1 1 260px}
 .btn{background:#1a7ef5;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
 .pill{display:inline-block;background:#fff;color:#142230;border-radius:999px;padding:.15em .6em;font-size:12px;margin-left:6px}
 table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
 th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px 8px;text-align:left}
 code{color:#bfe5ff}
 .ok{color:#98e695} .warn{color:#ffd38a} .err{color:#ffb3b3}
</style>
<div class="wrap">
  <h1>MIDI/KAR Organizer by Artist</h1>
  <form method="post" class="card">
    <div class="row">
      <div><label>Base folder <input type="text" name="root" value="<?=$h($root)?>" required></label></div>
      <div><label>Extensions (csv) <input type="text" name="ext" value="<?=$h(implode(',', $exts))?>"></label></div>
      <div>
        <label>Unknown artist
          <select name="unknown">
            <option value="skip" <?=$unknown==='skip'?'selected':''?>>Skip & log (manual)</option>
            <option value="move" <?=$unknown==='move'?'selected':''?>>Move to <code>_Unknown Artist/</code></option>
          </select>
        </label>
      </div>
      <div><label><input type="checkbox" name="dry" value="1" <?=$dry?'checked':''?>> Dry‑run (preview only)</label></div>
    </div>
    <div class="row">
      <div><button class="btn" type="submit"><?=$dry?'Preview':'Execute Organize'?></button></div>
      <div><span class="pill">Tip</span> Run Dry‑run first. Check the CSV report. Then uncheck Dry‑run to apply.</div>
    </div>
  </form>

  <div class="card">
    <h3>Summary</h3>
    <div class="row">
      <div>
        <div>Base: <b><?=$h($root)?></b></div>
        <div>Exts: <?=$h(implode(', ', $exts))?></div>
      </div>
      <div>
        <div>Dry‑run: <?=$dry?'<span class="pill">ON</span>':'<span class="pill">OFF</span>'?></div>
        <div>Unknown policy: <span class="pill"><?=$h($unknown)?></span></div>
      </div>
      <div>
        <div>Would move: <span class="pill"><?=$h((string)$stats['would'])?></span></div>
        <div>Moved: <span class="pill"><?=$h((string)$stats['moved'])?></span></div>
        <div>Skipped (no artist): <span class="pill"><?=$h((string)$stats['skip'])?></span></div>
        <div>Failed: <span class="pill"><?=$h((string)$stats['fail'])?></span></div>
        <div>CSV: <?=$csv?'<code>'.$h($csv).'</code>':'—'?></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>Details (first <?=REPORT_ROWS_LIMIT?>)</h3>
    <table>
      <thead><tr><th>Action</th><th>Artist folder</th><th>Title</th><th>Old path</th><th>New path</th><th>Size</th><th>Reason</th></tr></thead>
      <tbody>
        <?php foreach ($rows as $r): ?>
        <tr>
          <td class="<?=
              $r['action']==='moved'?'ok':(
              $r['action']==='would_move'?'warn':(
              $r['action']==='skip_no_artist'?'err':'')
          )?>"><?=$h($r['action'])?></td>
          <td><?= $h($r['artist']) ?></td>
          <td><?= $h($r['title']) ?></td>
          <td><code><?= $h($r['old']) ?></code></td>
          <td><code><?= $h($r['new']) ?></code></td>
          <td><?= isset($r['size']) ? $h(humanBytes((int)$r['size'])) : '' ?></td>
          <td><?= $h($r['reason']) ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php
}