
<?php
// record_upload.php
// Generated: 2025-09-27 00:28 GMT+08
// Accepts uploaded audio from record_audio_server_patch.js and saves under /recordings mirroring /midi path.
// POST form-data: rel = "sub/Track.mp4" (relative to recordings/), file = audio blob

header('Content-Type: application/json; charset=utf-8');
$BASE_DIR = __DIR__;
$TARGET_ROOT = $BASE_DIR . DIRECTORY_SEPARATOR . 'recordings';

function bad($code,$msg,$http=400){ http_response_code($http); echo json_encode(['ok'=>false,'code'=>$code,'message'=>$msg], JSON_UNESCAPED_SLASHES); exit; }
function ok($data){ echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); exit; }
function ensure_dir($p){ if(!is_dir($p)) @mkdir($p, 0775, true); }

if ($_SERVER['REQUEST_METHOD']!=='POST') bad('METHOD','POST required',405);

$rel = isset($_POST['rel']) ? $_POST['rel'] : '';
if ($rel==='') bad('NO_REL','Missing rel');
$rel = str_replace(['\\'], '/', $rel);
$rel = ltrim($rel, '/');
if (strpos($rel, '..') !== false) bad('BAD_REL','Bad rel');

if (!isset($_FILES['file'])) bad('NO_FILE','Missing file');
$upl = $_FILES['file'];
if (!is_uploaded_file($upl['tmp_name'])) bad('BAD_FILE','Upload failed');

$dstPath = $TARGET_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
$dstDir  = dirname($dstPath);
ensure_dir($dstDir);

if (!@move_uploaded_file($upl['tmp_name'], $dstPath)){
  // fallback to copy
  if (!@copy($upl['tmp_name'], $dstPath)) bad('IO_ERR','Cannot save',500);
}

ok(['ok'=>true,'path'=> str_replace($BASE_DIR.DIRECTORY_SEPARATOR, '', $dstPath)]);
