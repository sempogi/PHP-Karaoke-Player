<?php
/**
 * midi_sanitizer_renamer.php
 * Sanitize and rename filenames for .mid/.midi/.kar inside the 'midi' directory (recursive).
 * Dry-run ON by default. Web UI + CLI. Writes CSV report in base folder.
 *
 * Sem • v1.0 • 2025-10-18
 *
 * WEB:  http://localhost/midi_sanitizer_renamer.php
 * CLI:  php midi_sanitizer_renamer.php --base "/path/to/midi" --dry 1 --lowerext 1 --stripdia 0 --maxlen 160
 */

declare(strict_types=1);

const TZ             = 'Asia/Manila';
const DEF_BASE       = __DIR__ . DIRECTORY_SEPARATOR . 'midi';  // default to ./midi
const DEF_DRYRUN     = true;   // preview first
const DEF_LOWEREXT   = true;   // force extension to lowercase
const DEF_STRIPDIA   = false;  // strip diacritics (é->e) if possible
const DEF_MAXLEN     = 160;    // max length for base (without ext)
const REPORT_LIMIT   = 6000;   // rows shown in web table

date_default_timezone_set(TZ);

// ------------------------ helpers ------------------------
function v($arr,$key,$def=null){ return isset($arr[$key]) ? $arr[$key] : $def; }
function boolish($x,$def=false){
  if ($x===null || $x==='') return $def;
  $t=strtolower((string)$x);
  return in_array($t,['1','true','on','yes','y'],true);
}
function humanBytes(int $b): string {
  $u=['B','KB','MB','GB','TB']; $i=0; $f=(float)$b;
  while($f>=1024 && $i<count($u)-1){ $f/=1024; $i++; }
  return sprintf(($f>=10?'%d %s':'%.1f %s'), $f, $u[$i]);
}
function safeJoin(string $base,string $name): string {
  $base = rtrim($base, DIRECTORY_SEPARATOR);
  return $base . DIRECTORY_SEPARATOR . $name;
}

// ------------------------ sanitizers ------------------------
function removeControlChars(string $s): string {
  return preg_replace('/[\x00-\x1F\x7F]/', '', $s);
}
function stripDiacritics(string $s): string {
  $out = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  if ($out !== false) return $out;
  return preg_replace('/\p{Mn}+/u', '', $s);
}
function sanitizeBase(string $base, int $maxLen=DEF_MAXLEN, bool $stripDia=DEF_STRIPDIA): string {
  $base = removeControlChars($base);
  if ($stripDia) $base = stripDiacritics($base);

  // Replace forbidden FS chars
  $base = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], ' ', $base);

  // Collapse whitespace
  $base = preg_replace('/\s+/u', ' ', $base);

  // Normalize dash/underscore sequences
  $base = preg_replace('/[-_]{2,}/', '-', $base);

  // Trim edges
  $base = trim($base, " .\t\r\n-");

  // Avoid reserved Windows device names
  $reserved = ['CON','PRN','AUX','NUL','COM1','LPT1','COM2','LPT2','COM3','LPT3','COM4','LPT4','COM5','LPT5'];
  if (in_array(strtoupper($base), $reserved, true)) $base .= '_';

  // Enforce max length
  if ($maxLen > 0 && strlen($base) > $maxLen) $base = substr($base, 0, $maxLen);

  // Ensure not empty
  if ($base === '') $base = '_';

  return $base;
}

function nextAvailable(string $dir, string $base, string $ext): string {
  $target = safeJoin($dir, $base . ($ext!=='' ? ('.'.$ext) : ''));
  if (!file_exists($target)) return $target;
  $i=1;
  while (true) {
    $alt = $base . " ($i)" . ($ext!=='' ? ('.'.$ext) : '');
    $target = safeJoin($dir, $alt);
    if (!file_exists($target)) return $target;
    $i++;
    if ($i > 999) return safeJoin($dir, $base . '.' . $ext);
  }
}

// ------------------------ scan .mid/.midi/.kar only ------------------------
function buildMidiList(string $base): array {
  $list=[];
  $flags = FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_FILEINFO;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, $flags), RecursiveIteratorIterator::SELF_FIRST);
  $rootReal = realpath($base) ?: $base;
  foreach ($it as $fi) {
    if (!$fi instanceof SplFileInfo) continue;
    if ($fi->isDir() || $fi->isLink()) continue;

    $ext = strtolower(pathinfo($fi->getFilename(), PATHINFO_EXTENSION));
    if (!in_array($ext, ['mid','midi','kar'], true)) continue; // ONLY these

    $path = $fi->getPathname();
    $rel  = ltrim(str_replace($rootReal, '', $path), DIRECTORY_SEPARATOR);
    $dir  = dirname($path);
    $stem = pathinfo($path, PATHINFO_FILENAME);

    $list[] = [
      'path'=>$path,
      'rel'=>$rel,
      'dir'=>$dir,
      'ext'=>$ext,
      'stem'=>$stem,
      'size'=>$fi->getSize(),
      'mtime'=>$fi->getMTime(),
    ];
  }
  return $list;
}

// ------------------------ sanitize + rename ------------------------
function processSanitize(array $files, bool $dryRun, bool $lowerExt, int $maxLen, bool $stripDia): array {
  $rows=[]; $stats=['renamed'=>0,'would'=>0,'skip'=>0,'fail'=>0]; $bytes=0;

  foreach ($files as $f) {
    $oldPath = $f['path'];
    $dir     = $f['dir'];
    $ext     = $lowerExt ? strtolower($f['ext']) : $f['ext'];
    $newBase = sanitizeBase($f['stem'], $maxLen, $stripDia);

    // If no change (base and ext identical), skip
    $same = ($newBase === $f['stem']) && ($ext === $f['ext']);
    $newPath = $same ? $oldPath : nextAvailable($dir, $newBase, $ext);

    $action = 'skip_nochange'; $ok=false; $reason='';
    if (!$same) {
      if ($dryRun) {
        $action = 'would_rename';
      } else {
        if (realpath($oldPath) === realpath($newPath)) {
          $action='noop'; $ok=true;
        } else {
          $ok = @rename($oldPath, $newPath);
          $action = $ok ? 'renamed' : 'rename_failed';
          if (!$ok) {
            if (@copy($oldPath, $newPath) && @unlink($oldPath)) { $ok=true; $action='renamed'; }
            else $reason='rename error';
          }
        }
      }
    } else {
      $stats['skip']++;
    }

    if ($action==='renamed') { $stats['renamed']++; $bytes+=$f['size']; }
    if ($action==='would_rename') { $stats['would']++; }

    $rows[] = [
      'action'=>$action,
      'old'=>$oldPath,
      'new'=>$same ? '' : $newPath,
      'rel'=>$f['rel'],
      'size'=>$f['size'],
      'mtime'=>date('Y-m-d H:i:s',$f['mtime']),
      'reason'=>$reason,
      'new_base'=>$newBase,
      'new_ext'=>$ext,
    ];
  }

  return [$rows, $stats, $bytes];
}

function saveCsv(string $base, array $rows): string {
  $file = safeJoin($base, 'sanitize_report_' . date('Ymd_His') . '.csv');
  $fp = @fopen($file, 'w');
  if (!$fp) return '';
  fputcsv($fp, ['action','rel','old_path','new_path','new_base','new_ext','size','mtime','reason']);
  foreach ($rows as $r){
    fputcsv($fp, [$r['action'],$r['rel'],$r['old'],$r['new'],$r['new_base'],$r['new_ext'],$r['size'],$r['mtime'],$r['reason']]);
  }
  fclose($fp);
  return $file;
}

// ------------------------ run (CLI / WEB) ------------------------
$isCli = (php_sapi_name()==='cli');

if ($isCli) {
  $opts = getopt('', ['base::','dry::','lowerext::','stripdia::','maxlen::']);
  $BASE      = (string)v($opts,'base', DEF_BASE);
  $DRY       = boolish(v($opts,'dry', DEF_DRYRUN?'1':'0'), DEF_DRYRUN);
  $LOWEREXT  = boolish(v($opts,'lowerext', DEF_LOWEREXT?'1':'0'), DEF_LOWEREXT);
  $STRIPDIA  = boolish(v($opts,'stripdia', DEF_STRIPDIA?'1':'0'), DEF_STRIPDIA);
  $MAXLEN    = (int)v($opts,'maxlen', DEF_MAXLEN);

  if (!is_dir($BASE)) { fwrite(STDERR, "Base path not found: $BASE\n"); exit(2); }

  $files = buildMidiList($BASE);
  [$rows, $stats, $bytes] = processSanitize($files, $DRY, $LOWEREXT, $MAXLEN, $STRIPDIA);
  $csv = saveCsv($BASE, $rows);

  echo "== MIDI/KAR Filename Sanitizer ==\n";
  echo "Base: $BASE\nDry-run: ".($DRY?'Yes':'No')."\nLower ext: ".($LOWEREXT?'Yes':'No')."\nStrip diacritics: ".($STRIPDIA?'Yes':'No')."\nMax len: $MAXLEN\n";
  echo "Files scanned: ".count($files)."\n";
  echo "Would rename: {$stats['would']}; Renamed: {$stats['renamed']}; Skipped: {$stats['skip']}\n";
  echo "Bytes renamed: ".humanBytes($bytes)."\n";
  echo "CSV: $csv\n";
  exit(0);

} else {
  // WEB
  if ($_SERVER['REQUEST_METHOD']==='POST') {
    $BASE      = (string)v($_POST,'base', DEF_BASE);
    $DRY       = isset($_POST['dry']);         // unchecked => false
    $LOWEREXT  = isset($_POST['lowerext']);
    $STRIPDIA  = isset($_POST['stripdia']);
    $MAXLEN    = (int)v($_POST,'maxlen', DEF_MAXLEN);
  } else {
    $BASE      = DEF_BASE;
    $DRY       = DEF_DRYRUN;
    $LOWEREXT  = DEF_LOWEREXT;
    $STRIPDIA  = DEF_STRIPDIA;
    $MAXLEN    = DEF_MAXLEN;
  }

  $h = fn($s)=>htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

  $validBase = is_dir($BASE);
  $files = $validBase ? buildMidiList($BASE) : [];
  [$rows, $stats, $bytes] = processSanitize($files, $DRY, $LOWEREXT, $MAXLEN, $STRIPDIA);
  $csv = $validBase ? saveCsv($BASE, $rows) : '';

  ?>
<!doctype html>
<meta charset="utf-8">
<title>MIDI/KAR Filename Sanitizer</title>
<style>
 body{font:14px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b1620;color:#eaf2ff;padding:18px}
 .wrap{max-width:1120px;margin:auto}
 h1{margin:0 0 12px 0;font-size:20px}
 .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;margin:10px 0}
 label{display:block;margin:6px 0}
 input[type=text],input[type=number]{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0e2233;color:#eaf2ff}
 .row{display:flex;gap:12px;flex-wrap:wrap}
 .row > div{flex:1 1 240px}
 .btn{background:#1a7ef5;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
 .pill{display:inline-block;background:#fff;color:#142230;border-radius:999px;padding:.15em .6em;font-size:12px;margin-left:6px}
 table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
 th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px 8px;text-align:left}
 code{color:#bfe5ff}
 .ok{color:#98e695} .warn{color:#ffd38a} .skip{color:#9fb6c9} .err{color:#ffb3b3}
</style>
<div class="wrap">
  <h1>MIDI/KAR Filename Sanitizer</h1>
  <form method="post" class="card">
    <div class="row">
      <div><label>Base folder (defaults to ./midi) <input type="text" name="base" value="<?=$h($BASE)?>" required></label></div>
      <div><label><input type="checkbox" id="dryChk" name="dry" value="1" <?=$DRY?'checked':''?>> Dry‑run (preview only)</label></div>
      <div><label><input type="checkbox" name="lowerext" value="1" <?=$LOWEREXT?'checked':''?>> Lower‑case extensions</label></div>
      <div><label><input type="checkbox" name="stripdia" value="1" <?=$STRIPDIA?'checked':''?>> Strip diacritics (é→e)</label></div>
      <div><label>Max base length <input type="number" name="maxlen" min="16" max="200" step="1" value="<?=$h((string)$MAXLEN)?>"></label></div>
    </div>
    <div class="row">
      <div><button class="btn" id="actionBtn" type="submit"><?=$DRY?'Preview':'Execute Rename'?></button></div>
      <div><span class="pill" id="dryBadge"><?=$DRY?'ON':'OFF'?></span> Dry‑run</div>
    </div>
  </form>

  <?php if(!$validBase): ?>
    <div class="card err">Base path does not exist: <code><?=$h($BASE)?></code>. Create a <code>midi</code> folder next to this script or set another base path.</div>
  <?php else: ?>
    <div class="card">
      <h3>Summary</h3>
      <div class="row">
        <div>
          <div>Base: <b><?=$h($BASE)?></b></div>
          <div>Scope: <span class="pill">.mid</span> <span class="pill">.midi</span> <span class="pill">.kar</span> (recursive)</div>
          <div>Dry‑run: <?=$DRY?'<span class="pill">ON</span>':'<span class="pill">OFF</span>'?></div>
        </div>
        <div>
          <div>Lower ext: <?=$LOWEREXT?'<span class="pill">Yes</span>':'<span class="pill">No</span>'?></div>
          <div>Strip diacritics: <?=$STRIPDIA?'<span class="pill">Yes</span>':'<span class="pill">No</span>'?></div>
          <div>Max length: <span class="pill"><?=$h((string)$MAXLEN)?></span></div>
        </div>
        <div>
          <div>Files scanned: <b><?=count($files)?></b></div>
          <div>Would rename: <span class="pill"><?=$h((string)$stats['would'])?></span></div>
          <div>Renamed: <span class="pill"><?=$h((string)$stats['renamed'])?></span></div>
          <div>Skipped: <span class="pill"><?=$h((string)$stats['skip'])?></span></div>
          <div>Bytes renamed: <?=$h(humanBytes((int)$bytes))?></div>
          <div>CSV: <?=$csv ? '<code>'.$h($csv).'</code>' : '—' ?></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Details (first <?=REPORT_LIMIT?>)</h3>
      <table>
        <thead><tr><th>Action</th><th>Rel</th><th>Old</th><th>New</th><th>New base</th><th>Ext</th><th>Size</th><th>Reason</th></tr></thead>
        <tbody>
          <?php
          $i=0;
          foreach ($rows as $r){
            if ($i++ >= REPORT_LIMIT) break;
            $cls = $r['action']==='renamed' ? 'ok' : ($r['action']==='would_rename' ? 'warn' : ($r['action']==='rename_failed'?'err':'skip'));
            echo '<tr>';
            echo '<td class="'.$cls.'">'.htmlspecialchars($r['action']).'</td>';
            echo '<td><code>'.htmlspecialchars($r['rel']).'</code></td>';
            echo '<td><code>'.htmlspecialchars($r['old']).'</code></td>';
            echo '<td><code>'.htmlspecialchars($r['new']).'</code></td>';
            echo '<td>'.htmlspecialchars($r['new_base']).'</td>';
            echo '<td>'.htmlspecialchars($r['new_ext']).'</td>';
            echo '<td>'.htmlspecialchars(humanBytes((int)$r['size'])).'</td>';
            echo '<td>'.htmlspecialchars($r['reason']).'</td>';
            echo '</tr>';
          }
          ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</div>
<script>
(function(){
  const chk   = document.querySelector('#dryChk');
  const btn   = document.querySelector('#actionBtn');
  const badge = document.querySelector('#dryBadge');
  function paint(){
    const on = chk && chk.checked;
    if (btn)   btn.textContent = on ? 'Preview' : 'Execute Rename';
    if (badge) badge.textContent = on ? 'ON' : 'OFF';
  }
  if (chk) chk.addEventListener('change', paint);
  paint();
})();
</script>
<?php
}