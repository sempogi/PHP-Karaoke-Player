
<?php
// preset_api.php
// Generated: 2025-09-27 00:11 GMT+08
// Simple JSON preset loader/saver for MIX16. Stores files under /midi_presets mirroring /midi paths.
// Actions:
//   GET  ?action=load&rel=REL          -> returns JSON for that song preset (404 if missing)
//   GET  ?action=loadDefault           -> returns __default.json (404 if missing)
//   POST ?action=save                  -> body { rel:'__default'|REL, data: {..} }
//   POST ?action=delete&rel=REL        -> deletes per-song preset (404 if missing)
// Notes: This is a lightweight internal tool; no auth. Keep this directory non-public internet.

header('Content-Type: application/json; charset=utf-8');
$MIDI_DIR = 'midi';
$PRESET_DIR = 'midi_presets';
$DEFAULT_FILE = '__default.json';

function ensure_dir($path){ if(!is_dir($path)){ @mkdir($path, 0775, true); } }
function bad($code,$msg,$http=400){ http_response_code($http); echo json_encode(['ok'=>false,'code'=>$code,'message'=>$msg], JSON_UNESCAPED_SLASHES); exit; }
function ok($data){ echo json_encode($data, JSON_UNESCAPED_SLASHES); exit; }

$action = isset($_GET['action']) ? $_GET['action'] : '';
ensure_dir($PRESET_DIR);

// Map rel (e.g., "sub/track.mid") -> preset path under PRESET_DIR (create subfolders)
function preset_path_for_rel($rel, $PRESET_DIR){
  $rel = str_replace(['\\'], '/', $rel);
  $rel = ltrim($rel, '/');
  // prevent traversal
  if (strpos($rel, '..') !== false) return false;
  $path = $PRESET_DIR . '/' . $rel . '.json';
  $dir  = dirname($path);
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  return $path;
}

if ($action === 'load'){
  $rel = isset($_GET['rel']) ? $_GET['rel'] : '';
  if ($rel==='') bad('NO_REL','Missing rel');
  $full = preset_path_for_rel($rel, $PRESET_DIR);
  if (!$full) bad('BAD_REL','Bad rel');
  if (!is_file($full)) bad('NOT_FOUND','No preset for rel',404);
  $json = @file_get_contents($full);
  if ($json===false) bad('IO_ERR','Cannot read',500);
  ok(json_decode($json, true));
}

if ($action === 'loadDefault'){
  $full = $PRESET_DIR . '/' . $DEFAULT_FILE;
  if (!is_file($full)) bad('NOT_FOUND','No default preset',404);
  $json = @file_get_contents($full);
  if ($json===false) bad('IO_ERR','Cannot read',500);
  ok(json_decode($json, true));
}

if ($action === 'save'){
  $raw = file_get_contents('php://input');
  $j = json_decode($raw, true);
  if (!$j || !isset($j['data'])) bad('BAD_BODY','JSON body with data required');
  $rel = isset($j['rel']) ? $j['rel'] : '__default';
  $data = $j['data'];

  if ($rel === '__default'){
    $full = $PRESET_DIR . '/' . $DEFAULT_FILE;
  } else {
    $full = preset_path_for_rel($rel, $PRESET_DIR);
    if (!$full) bad('BAD_REL','Bad rel');
  }

  // normalize minimal schema
  $out = [
    'version' => isset($data['version']) ? $data['version'] : '1.0',
    'timestamp' => date('c'),
    'muteMode' => isset($data['muteMode']) ? $data['muteMode'] : 'cc7',
    'ccPanLink' => !empty($data['ccPanLink']),
    'channels' => isset($data['channels']) && is_array($data['channels']) ? $data['channels'] : []
  ];

  if (@file_put_contents($full, json_encode($out, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT))===false){
    bad('IO_ERR','Cannot write',500);
  }
  ok(['ok'=>true,'path'=>$full]);
}

if ($action === 'delete'){
  $rel = isset($_GET['rel']) ? $_GET['rel'] : '';
  if ($rel==='') bad('NO_REL','Missing rel');
  $full = preset_path_for_rel($rel, $PRESET_DIR);
  if (!$full) bad('BAD_REL','Bad rel');
  if (!is_file($full)) bad('NOT_FOUND','Missing',404);
  if (!@unlink($full)) bad('IO_ERR','Cannot delete',500);
  ok(['ok'=>true]);
}

bad('BAD_ACTION','Unknown action');
