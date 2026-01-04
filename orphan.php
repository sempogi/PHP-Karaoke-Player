<?php
/**
 * orphan_v4_1_php_all.php — Root-only JS orphan sweeper (PHP-aware) — FIXED regex
 *
 * - Scans ALL *.php in ROOT; collects JS refs from <script src> and inline loaders.
 * - FIX: regex now correctly stops at the matching quote (uses [^"'] instead of [^\1]).
 * - Excludes any root JS referenced by ANY PHP; moves others to ./jstest/.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$ROOT = __DIR__;
$DEST = $ROOT . DIRECTORY_SEPARATOR . 'jstest';
$SELF = basename(__FILE__);

$action = 'preview';
if (PHP_SAPI === 'cli') {
  if (!empty($argv[1]) && stripos($argv[1], 'action=move') !== false) $action = 'move';
} else {
  if (isset($_GET['action']) && $_GET['action'] === 'move') $action = 'move';
}

// Whitelist (case-insensitive) — always keep these root JS files
$WHITELIST = array_change_key_case(array_flip([
  // 'libfluidsynth-2.4.6-with-libsndfile.js',
  // 'js-synthesizer.min.js',
  // 'MIDIFile.js',
  // 'cropper.min.js',
]), CASE_LOWER);

function list_root_php($root){ return array_map('basename', glob($root . DIRECTORY_SEPARATOR . '*.php') ?: []); }
function list_root_js($root){ return array_map('basename', glob($root . DIRECTORY_SEPARATOR . '*.js') ?: []); }
function read_file_safely($path){ $s=@file_get_contents($path); if($s===false) throw new RuntimeException("Cannot read file: $path"); return $s; }
function normalize_src($src){ $s=html_entity_decode(trim($src), ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); $s=preg_replace('/[?#].*$/','',$s); $s=preg_replace('#^(?:\./|/)+#','',$s); return $s; }

function collect_js_refs_from_php_source($src){
  $refs = [];
  // <script src="...">
  if (preg_match_all('~<script\b[^>]*\bsrc\s*=\s*([\'\"])([^\'\"]+)\1~i', $src, $m)) {
    foreach ($m[2] as $raw) { $refs[ normalize_src($raw) ] = true; }
  }
  // Inline loader patterns — FIXED: use [^"'] to stop at either quote
  $patterns = [
    // load('file.js')
    '~\bload\s*\(\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
    // elem.src = 'file.js'
    '~\.src\s*=\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
    // importScripts('file.js')
    '~\bimportScripts\s*\(\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
    // fetch('file.js')
    '~\bfetch\s*\(\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
    // import('file.js')
    '~\bimport\s*\(\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
    // $.getScript('file.js')
    '~\$\s*\.getScript\s*\(\s*([\'\"])\s*([^\"\']*?\.js[^\"\']*)\s*\1~i',
  ];
  foreach ($patterns as $re) {
    if (preg_match_all($re, $src, $mm)) {
      foreach ($mm[2] as $raw) { $refs[ normalize_src($raw) ] = true; }
    }
  }
  return array_keys($refs);
}

function move_orphans($root, $orphans, $dest){
  $out = ['created'=>false, 'moved'=>[], 'failed'=>[]];
  if (!is_dir($dest)) { if (!@mkdir($dest,0755,true)) throw new RuntimeException("Cannot create jstest: $dest"); $out['created']=true; }
  foreach ($orphans as $bn) {
    $from=$root.DIRECTORY_SEPARATOR.$bn; $to=$dest.DIRECTORY_SEPARATOR.$bn;
    if (file_exists($to)) $to=preg_replace('/\.js$/i','_'.date('Ymd_His').'.js',$to);
    if (@rename($from,$to)) $out['moved'][]=[$bn,basename($to)]; else $out['failed'][]=$bn;
  }
  @file_put_contents($dest.DIRECTORY_SEPARATOR.'jstest_move_log.json', json_encode([
    'timestamp'=>date('c'),'root'=>$root,'dest'=>$dest,'moved'=>$out['moved'],'failed'=>$out['failed']
  ], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
  return $out;
}

$phpFiles = list_root_php($ROOT);
$phpFiles = array_values(array_filter($phpFiles, fn($bn)=>$bn!==$SELF)); // exclude me if copied to root

$refsAllNormalized=[]; $rootRefBasenames=[]; $errors=[];
foreach ($phpFiles as $php) {
  try {
    $src = read_file_safely($ROOT.DIRECTORY_SEPARATOR.$php);
    $refs = collect_js_refs_from_php_source($src);
    foreach ($refs as $r) {
      $refsAllNormalized[$r]=true;
      if (strpos($r,'/')===false && preg_match('/\.js$/i',$r)) $rootRefBasenames[strtolower(basename($r))]=true;
    }
  } catch (Exception $e) { $errors[]=$e->getMessage(); }
}

$rootJs = list_root_js($ROOT);
$used=[]; $orphans=[];
foreach ($rootJs as $bn) {
  $low=strtolower($bn);
  if (isset($WHITELIST[$low])) { $used[]=$bn; continue; }
  if (isset($rootRefBasenames[$low])) $used[]=$bn; else $orphans[]=$bn;
}

$moved=[]; $failed=[]; $created=false; $moveError='';
if ($action==='move' && !empty($orphans)) {
  try {
    $res = move_orphans($ROOT,$orphans,$DEST);
    $created=$res['created']; $moved=$res['moved']; $failed=$res['failed'];
    $rootJs=list_root_js($ROOT);
    $used=array_values(array_intersect($used,$rootJs));
    $orphans=array_values(array_intersect($orphans,$rootJs));
  } catch (Exception $e) { $moveError=$e->getMessage(); }
}

if (PHP_SAPI==='cli') {
  echo "JS Orphan Sweeper v4.1 (PHP-aware, fixed regex)\n";
  echo "Root:  $ROOT\nMode:  ".($action==='move'?'EXECUTION':'PREVIEW')."\n\n";
  echo "PHP files:\n".($phpFiles?" - ".implode("\n - ",$phpFiles)."\n\n":" (none)\n\n");
  $refsList=array_keys($refsAllNormalized);
  echo "JS refs (normalized):\n".($refsList?" - ".implode("\n - ",$refsList)."\n\n":" (none)\n\n");
  echo "Root *.js:\n".($rootJs?" - ".implode("\n - ",$rootJs)."\n\n":" (none)\n\n");
  echo "USED:\n".($used?" - ".implode("\n - ",$used)."\n\n":" (none)\n\n");
  echo "ORPHANS:\n".($orphans?" - ".implode("\n - ",$orphans)."\n\n":" (none)\n\n");
  if ($action==='move') {
    echo ($created?"Created: jstest/\n":"");
    echo "MOVED:\n".($moved?implode("\n",array_map(fn($t)=>" - {$t[0]} → {$t[1]}",$moved))."\n":" (none)\n");
    echo "FAILED:\n".($failed?" - ".implode("\n - ",$failed)."\n":" (none)\n");
  } else { echo "To move orphans: php $SELF action=move\n"; }
  exit;
}

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>JS Orphan Sweeper v4.1 (PHP-aware, fixed regex)</title>
  <style>
    body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;background:#0b0b0b;color:#e7e7e7;padding:20px}
    h1,h2{margin:.4em 0}
    .box{border:1px solid #2a2f3a;border-radius:8px;padding:12px;margin:12px 0;background:#14181c}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .btn{background:#1b2633;border:1px solid #3a5166;color:#dfe8f3;border-radius:8px;padding:6px 10px;text-decoration:none}
    .btn:hover{filter:brightness(1.1)}
    .muted{opacity:.85}
    ul{margin:.3em 0 .8em 1.2em}
    li{margin:.15em 0}
    code{background:#0f1419;color:#dfe8f3;border:1px solid #2a2f3a;border-radius:6px;padding:2px 6px}
  </style>
</head>
<body>
  <h1>JS Orphan Sweeper v4.1</h1>
  <div class="muted">Root: <code><?=htmlspecialchars($ROOT)?></code></div>

  <div class="box">
    <div class="row">
      <a class="btn" href="?">Preview (Dry‑run)</a>
      <a class="btn" href="?action=move" onclick="return confirm('Move orphan JS files into ./jstest/?');">Move Orphans</a>
    </div>
    <div class="muted">Mode: <strong><?= $action==='move' ? 'EXECUTION (moving orphans)' : 'PREVIEW (no changes)' ?></strong></div>
  </div>

  <?php if (!empty($moveError)): ?>
    <div class="box" style="border-color:#a33;background:#2a1515">
      <strong>Move ERROR:</strong> <?=htmlspecialchars($moveError)?></div>
  <?php endif; ?>

  <h2>PHP files scanned (root)</h2>
  <div class="box">
    <?php if (empty($phpFiles)): ?>
      <div class="muted">(none)</div>
    <?php else: ?>
      <ul><?php foreach ($phpFiles as $pf): ?><li><?=htmlspecialchars($pf)?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </div>

  <h2>JS references found in PHP (normalized)</h2>
  <div class="box">
    <?php $refsList=array_keys($refsAllNormalized); if (empty($refsList)): ?>
      <div class="muted">(none)</div>
    <?php else: ?>
      <ul><?php foreach ($refsList as $p): ?><li><code><?=htmlspecialchars($p)?></code></li><?php endforeach; ?></ul>
    <?php endif; ?>
    <div class="muted">Includes: <code>&lt;script src="..."&gt;</code> and inline loaders (load/.src/importScripts/fetch/import/$.getScript).</div>
  </div>

  <h2>Root-level *.js files</h2>
  <div class="box">
    <?php if (empty($rootJs)): ?>
      <div class="muted">(none)</div>
    <?php else: ?>
      <ul><?php foreach ($rootJs as $f): ?><li><?=htmlspecialchars($f)?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </div>

  <h2>USED (referenced by any PHP in root)</h2>
  <div class="box">
    <?php if (empty($used)): ?>
      <div class="muted">(none)</div>
    <?php else: ?>
      <ul><?php foreach ($used as $f): ?><li><?=htmlspecialchars($f)?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </div>

  <h2>ORPHANS (NOT referenced by any PHP in root)</h2>
  <div class="box">
    <?php if (empty($orphans) && $action!=='move'): ?>
      <div class="muted">(none)</div>
    <?php elseif ($action==='move' && empty($orphans)): ?>
      <div class="muted">(none — after move)</div>
    <?php else: ?>
      <ul><?php foreach ($orphans as $f): ?><li><?=htmlspecialchars($f)?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </div>

  <div class="muted">
    Notes:
    <ul>
      <li>Scans <em>only</em> the root folder (no subfolders).</li>
      <li>Regex fix: prevents echoing long JS/PHP concatenations by stopping at quotes.</li>
      <li>To always keep a root JS file, add it to the whitelist at the top.</li>
      <li>Dynamic paths built at runtime may not be detectable; add those to whitelist.</li>
    </ul>
  </div>
</body>
</html>
