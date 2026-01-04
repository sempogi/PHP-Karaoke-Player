<?php
/**
 * presets_api.php — SimpleMapper Presets PHP API (file-based JSON)
 *
 * Endpoints (all return application/json):
 *  - OPTIONS: CORS preflight
 *  - GET    ?action=load&type=song&id=SONG_ID
 *  - GET    ?action=load&type=sf&sig=SF_SIGNATURE
 *  - POST   ?action=save            (body: JSON {type:'song', id, sfSig?, sfName?, channels} or {type:'sf', sig, sfName?, channels})
 *  - POST   ?action=delete&type=song&id=SONG_ID
 *  - POST   ?action=delete&type=sf&sig=SF_SIGNATURE
 *  - GET    ?action=exists&type=song&id=SONG_ID | type=sf&sig=SF_SIGNATURE
 *  - GET    ?action=list&type=song | type=sf
 *
 * Files are stored under presets_data/{song|sf}/<safe-key>.json
 *  - Song key: slug of id (alnum + _ - .) or sha1 if nothing remains
 *  - SF key: sha1(sig) (to avoid unsafe chars); file includes original sig in JSON
 *
 * Security: Optional token for write/delete. Set in config.php (token or header X-Api-Token or ?token=)
 */

header('Content-Type: application/json; charset=utf-8');

// Load config
$config = (function(){
  $cfgFile = __DIR__ . '/config.php';
  if (!file_exists($cfgFile)) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Missing config.php']); exit; }
  $cfg = require $cfgFile; return $cfg;
})();

// CORS
if (!headers_sent()) {
  header('Access-Control-Allow-Origin: ' . ($config['cors'] ?? '*'));
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-Api-Token');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Helpers
function respond($data, $code=200){ http_response_code($code); echo json_encode($data, JSON_UNESCAPED_SLASHES); exit; }
function bad($msg,$code=400){ respond(['ok'=>false,'error'=>$msg], $code); }
function ensure_dirs($root){
  foreach(['song','sf'] as $d){ $p = $root . '/' . $d; if (!is_dir($p)) { @mkdir($p, 0775, true); } }
}
function slug($s){ $s = (string)$s; $s = preg_replace('~[^A-Za-z0-9_.-]+~','-', $s); $s = trim($s, '-'); if($s==='') $s = substr(sha1((string)$s),0,16); return $s; }
function sf_key($sig){ return substr(sha1((string)$sig),0,40); }
function song_path($root,$id){ return rtrim($root,'/').'/song/'.slug($id).'.json'; }
function sf_path($root,$sig){ return rtrim($root,'/').'/sf/'.sf_key($sig).'.json'; }
function read_json($file){ if(!is_file($file)) return null; $j=@file_get_contents($file); if($j===false) return null; $d=json_decode($j,true); return is_array($d)?$d:null; }
function write_json_atomic($file,$arr){ $tmp=$file.'.tmp'; $j=json_encode($arr, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES); $ok = @file_put_contents($tmp,$j,LOCK_EX)!==false && @rename($tmp,$file); if(!$ok){ @unlink($tmp); } return $ok; }
function channels_valid($ch){ if(!is_array($ch)) return false; foreach($ch as $k=>$v){ $c = (int)$k; if($c<1||$c>16) return false; if(!is_array($v)) return false; foreach(['msb','lsb','pg'] as $f){ if(!isset($v[$f])) return false; $x=(int)$v[$f]; if($x<0||$x>127) return false; } } return true; }
function need_token_for_write($config){ return isset($config['token']) && $config['token']!==null && $config['token']!==''; }
function check_token($config){ if(!need_token_for_write($config)) return true; $tok = $_GET['token'] ?? ($_SERVER['HTTP_X_API_TOKEN'] ?? ''); return hash_equals((string)$config['token'], (string)$tok); }

$action = $_GET['action'] ?? '';
$type   = $_GET['type']   ?? '';
$root   = $config['storage_root'];
ensure_dirs($root);

// Routing
switch ($action) {
  case 'load': {
    if ($type==='song'){
      $id = $_GET['id'] ?? ''; if($id==='') bad('Missing id');
      $file = song_path($root,$id); $data = read_json($file); if(!$data) bad('Not found',404);
      respond(['ok'=>true,'type'=>'song','data'=>$data]);
    } elseif ($type==='sf'){
      $sig = $_GET['sig'] ?? ''; if($sig==='') bad('Missing sig');
      $file = sf_path($root,$sig); $data = read_json($file); if(!$data) bad('Not found',404);
      respond(['ok'=>true,'type'=>'sf','data'=>$data]);
    } else bad('Invalid type');
  } break;

  case 'exists': {
    if ($type==='song'){
      $id = $_GET['id'] ?? ''; if($id==='') bad('Missing id');
      $file = song_path($root,$id); respond(['ok'=>true,'exists'=>is_file($file)]);
    } elseif ($type==='sf'){
      $sig = $_GET['sig'] ?? ''; if($sig==='') bad('Missing sig');
      $file = sf_path($root,$sig); respond(['ok'=>true,'exists'=>is_file($file)]);
    } else bad('Invalid type');
  } break;

  case 'list': {
    if ($type!=='song' && $type!=='sf') bad('Invalid type');
    $dir = rtrim($root,'/').'/'.$type;
    $out=[]; if(is_dir($dir)){
      foreach(glob($dir.'/*.json') as $f){
        $j = read_json($f); if(!$j) continue;
        $item = [ 'file'=>basename($f), 'updatedAt'=>$j['updatedAt'] ?? null, 'size'=>@filesize($f) ];
        if($type==='song'){ $item['id'] = $j['id'] ?? null; $item['sfName'] = $j['sfName'] ?? null; }
        else { $item['sig'] = $j['sig'] ?? null; $item['sfName'] = $j['sfName'] ?? null; }
        $out[]=$item;
      }
    }
    respond(['ok'=>true,'type'=>$type,'items'=>$out]);
  } break;

  case 'save': {
    if ($_SERVER['REQUEST_METHOD']!=='POST') bad('POST required',405);
    if (!check_token($config)) bad('Unauthorized',401);
    $raw = file_get_contents('php://input'); $obj = json_decode($raw,true);
    if(!is_array($obj)) bad('Invalid JSON body');
    $now = gmdate('c');
    if (($obj['type'] ?? '')==='song'){
      $id = (string)($obj['id'] ?? ''); if($id==='') bad('Missing id');
      $ch = $obj['channels'] ?? null; if(!channels_valid($ch)) bad('Invalid channels');
      $rec = [ 'type'=>'song', 'id'=>$id, 'sfSig'=>$obj['sfSig'] ?? null, 'sfName'=>$obj['sfName'] ?? null, 'channels'=>$ch, 'updatedAt'=>$now ];
      $file = song_path($root,$id); if(!write_json_atomic($file,$rec)) bad('Write failed',500);
      respond(['ok'=>true,'saved'=>'song','id'=>$id,'file'=>basename($file)]);
    } elseif (($obj['type'] ?? '')==='sf'){
      $sig = (string)($obj['sig'] ?? ''); if($sig==='') bad('Missing sig');
      $ch = $obj['channels'] ?? null; if(!channels_valid($ch)) bad('Invalid channels');
      $rec = [ 'type'=>'sf', 'sig'=>$sig, 'sfName'=>$obj['sfName'] ?? null, 'channels'=>$ch, 'updatedAt'=>$now ];
      $file = sf_path($root,$sig); if(!write_json_atomic($file,$rec)) bad('Write failed',500);
      respond(['ok'=>true,'saved'=>'sf','sig'=>$sig,'file'=>basename($file)]);
    } else bad('Invalid type');
  } break;

  case 'delete': {
    if ($_SERVER['REQUEST_METHOD']!=='POST') bad('POST required',405);
    if (!check_token($config)) bad('Unauthorized',401);
    if ($type==='song'){
      $id = $_GET['id'] ?? ''; if($id==='') bad('Missing id');
      $file = song_path($root,$id); if(!is_file($file)) bad('Not found',404);
      @unlink($file); respond(['ok'=>true,'deleted'=>'song','id'=>$id]);
    } elseif ($type==='sf'){
      $sig = $_GET['sig'] ?? ''; if($sig==='') bad('Missing sig');
      $file = sf_path($root,$sig); if(!is_file($file)) bad('Not found',404);
      @unlink($file); respond(['ok'=>true,'deleted'=>'sf','sig'=>$sig]);
    } else bad('Invalid type');
  } break;

  default:
    bad('Unknown action',400);
}
