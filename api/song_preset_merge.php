<?php
/**
 * song_preset_merge.php — Per-SONG preset API (MERGE mode, no duplicate channels)
 * Storage: ./song_presets/<slug(id)>.json
 * Methods:
 *   - GET  ?id=SongID         → { ok:true, data:{ type:'song', id, channels:{...}, updatedAt } }
 *   - POST JSON { id, channels }  → { ok:true, data:{ saved, file, channelsCount } }
 * Notes:
 *   - Simple writer: no atomic rename; just file_put_contents.
 *   - Validates keys strictly (channels 1..16, each has msb/lsb/pg in 0..127).
 */

header('Content-Type: application/json; charset=utf-8');

$DATA_DIR = __DIR__ . '/song_presets';
if (!is_dir($DATA_DIR)) { @mkdir($DATA_DIR, 0777, true); }

function respond($ok, $data=null, $error=null, $code=200){
  http_response_code($code);
  echo json_encode(['ok'=>$ok,'data'=>$data,'error'=>$error], JSON_UNESCAPED_SLASHES);
  exit;
}

function slug($s){
  $s=(string)$s;
  $s=preg_replace('~[^A-Za-z0-9_.-]+~','-', $s);
  $s=trim($s,'-');
  return $s ?: 'unknown';
}

// Strict checker: channels must be 1..16; each has msb, lsb, pg (0..127)
function channels_valid($ch, &$why=null){
  if(!is_array($ch)){ $why='channels_not_array'; return false; }
  foreach($ch as $k=>$v){
    $c=(int)$k;
    if($c<1||$c>16){ $why="bad_channel_key_$k"; return false; }
    if(!is_array($v)){ $why="channel_$k_not_obj"; return false; }
    foreach(['msb','lsb','pg'] as $f){
      if(!isset($v[$f])){ $why="channel_$k_missing_$f"; return false; }
      $x=(int)$v[$f];
      if($x<0||$x>127){ $why="channel_$k_$f_out_of_range"; return false; }
    }
  }
  return true;
}

function read_song($file){
  if(!is_file($file)) return null;
  $j=@file_get_contents($file); if($j===false) return null;
  $d=json_decode($j,true);
  return is_array($d)?$d:null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method==='GET'){
  $id = $_GET['id'] ?? '';
  if($id==='') respond(false,null,'Missing id',400);
  $file = $DATA_DIR.'/'.slug($id).'.json';
  $obj = read_song($file);
  if(!$obj){ respond(false, null, 'Not found', 404); }
  respond(true, $obj);
}

if ($method==='POST'){
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if(!is_array($body)) respond(false,null,'Invalid JSON body',400);

  $id = (string)($body['id'] ?? '');
  if($id==='') respond(false,null,'Missing id',400);

  $inc = $body['channels'] ?? null;
  $why = null;
  if(!channels_valid($inc, $why)) respond(false, ['why'=>$why], 'Invalid channels',400);

  $file = $DATA_DIR.'/'.slug($id).'.json';
  $obj  = read_song($file);
  if(!$obj) $obj = ['type'=>'song','id'=>$id,'channels'=>[],'updatedAt'=>gmdate('c')];
  if(!isset($obj['channels']) || !is_array($obj['channels'])) $obj['channels']=[];

  // MERGE (upsert, no duplicates)
  foreach($inc as $k=>$v){
    $obj['channels'][(string)((int)$k)] = [
      'msb'=>(int)$v['msb'],
      'lsb'=>(int)$v['lsb'],
      'pg' =>(int)$v['pg']
    ];
  }
  $obj['updatedAt'] = gmdate('c');

  // Simple write (no atomic rename)
  $json = json_encode($obj, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
  $ok = @file_put_contents($file, $json);
  if($ok === false){
    respond(false, ['file'=>$file], 'Write failed', 500);
  }

  respond(true, ['saved'=>$id, 'file'=>basename($file), 'channelsCount'=>count($obj['channels'])]);
}

respond(false,null,'Use GET?id=... to load or POST JSON to merge-save',400);
