<?php
// uploader_standalone.php — Mixed Multi-Upload (single file)
// Generated: 2025-09-26 07:52

declare(strict_types=1);
session_start();

// === CONFIG: target folders (relative to this script) ===
$SF_DIR        = 'soundfonts';
$MIDI_DIR      = 'midi';
$BG_IMG_DIR    = 'background';
$BG_VID_DIR    = 'background_video';
$FONT_DIR      = 'fonts';

$ALLOW = [
  'midi'        => ['mid','midi','kar'],
  'soundfonts'  => ['sf2','sf3'],
  'images'      => ['jpg','jpeg','png','gif','webp','bmp'],
  'videos'      => ['mp4','webm','ogv'],
  'fonts'       => ['ttf','otf','woff','woff2'],
];

$MAP = [
  'midi'       => $MIDI_DIR,
  'soundfonts' => $SF_DIR,
  'images'     => $BG_IMG_DIR,
  'videos'     => $BG_VID_DIR,
  'fonts'      => $FONT_DIR,
];

// === Helpers ===
function json_out(int $code, array $data): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  exit;
}

function classify_ext(string $ext, array $allow): ?string {
  $e = strtolower($ext);
  foreach ($allow as $cat => $exts) {
    if (in_array($e, $exts, true)) return $cat;
  }
  return null;
}

function safe_name(string $name): string {
  // Keep base/ext, but remove risky chars; allow letters, numbers, dash, dot, underscore, space, (), []
  $name = preg_replace('/[^\pL\pN\-\._\s\(\)\[\]]+/u', '_', $name) ?? 'file';
  $name = preg_replace('/\s{2,}/', ' ', $name) ?? $name;
  $name = trim($name);
  return $name !== '' ? $name : ('file_'.date('Ymd_His'));
}

function unique_name(string $dir, string $name): string {
  $dir = rtrim($dir, "\/\\");
  $base = pathinfo($name, PATHINFO_FILENAME);
  $ext  = pathinfo($name, PATHINFO_EXTENSION);
  $extPart = $ext !== '' ? '.'.$ext : '';
  $try = $base.$extPart;
  $i = 1;
  while (file_exists($dir.DIRECTORY_SEPARATOR.$try)) {
    $try = $base.' ('.$i.')'.$extPart;
    $i++;
  }
  return $try;
}

function ensure_dir(string $dir): bool {
  if (is_dir($dir)) return is_writable($dir);
  if (@mkdir($dir, 0775, true)) { @chmod($dir, 0775); return is_writable($dir); }
  return false;
}

@set_time_limit(0);

// === Endpoint: Handle uploads (XHR POST with files[]) ===
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!isset($_FILES['files'])) {
    json_out(400, ['ok'=>false, 'error'=>'No files uploaded (use field name "files[]")']);
  }

  global $ALLOW, $MAP;
  $files = $_FILES['files'];
  $count = is_array($files['name']) ? count($files['name']) : 0;

  $results = [];
  for ($i=0; $i<$count; $i++) {
    $origName = $files['name'][$i] ?? '';
    $tmpPath  = $files['tmp_name'][$i] ?? '';
    $err      = (int)($files['error'][$i] ?? UPLOAD_ERR_NO_FILE);
    $size     = (int)($files['size'][$i] ?? 0);

    $res = [
      'ok' => false,
      'original' => $origName,
      'size' => $size,
      'category' => null,
      'target_dir' => null,
      'saved_as' => null,
      'path' => null,
      'url' => null,
      'error' => null,
    ];

    if ($err !== UPLOAD_ERR_OK) {
      $res['error'] = 'Upload error code '.$err;
      $results[] = $res;
      continue;
    }
    if (!is_uploaded_file($tmpPath)) {
      $res['error'] = 'Invalid temp upload';
      $results[] = $res;
      continue;
    }

    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    $category = classify_ext($ext, $ALLOW);
    if ($category === null) {
      $res['error'] = 'File type not allowed: .'.$ext;
      $results[] = $res;
      continue;
    }

    $destDir = $MAP[$category] ?? null;
    if (!$destDir) {
      $res['error'] = 'No target directory for category: '.$category;
      $results[] = $res;
      continue;
    }
    if (!ensure_dir($destDir)) {
      $res['error'] = 'Cannot create target directory: '.$destDir;
      $results[] = $res;
      continue;
    }

    $clean = safe_name($origName);
    $final = unique_name($destDir, $clean);
    $toPath = rtrim($destDir, "\/\\").DIRECTORY_SEPARATOR.$final;

    if (!@move_uploaded_file($tmpPath, $toPath)) {
      $errLast = error_get_last();
      $res['error'] = 'Failed to save file' . ($errLast && isset($errLast['message']) ? (': '.$errLast['message']) : '');
      $results[] = $res;
      continue;
    }

    $webPath = rtrim($destDir,'/').'/'.$final; // relative path for web use

    $res['ok'] = true;
    $res['category'] = $category;
    $res['target_dir'] = $destDir;
    $res['saved_as'] = $final;
    $res['path'] = $webPath;
    $res['url']  = $webPath;
    $res['size'] = $size;
    $results[] = $res;
  }

  json_out(200, ['ok'=>true, 'files'=>$results]);
}

// === UI (GET) ===
?>
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Standalone Uploader</title>
<style>
  :root{--bg:#0b0b0b;--fg:#e7e7e7;--panel:#151515;--line:#1e1e1e;--hl:#7ef9a7}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif}
  .wrap{max-width:980px;margin:0 auto;padding:16px}
  .panel{background:rgba(21,21,21,.55);border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35)}
  .panel h3{margin:0;padding:10px 12px;background:rgba(17,17,17,.65);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between}
  .panel .body{padding:12px}
  .note{color:#a9b5c2;font:12px/1.2 system-ui}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0}

  #drop{border:1px dashed rgba(255,255,255,.25);border-radius:10px;padding:16px;text-align:center;color:#bcd;background:transparent}
  /* Scrollable list */
  #list{display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:min(48vh, 420px);overflow:auto;padding-right:4px;overscroll-behavior:contain}
  #list:focus{ outline:1px solid rgba(255,255,255,.12) }
  .item{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px}
  .name{flex:1 1 auto}
  .barHost{flex:1 1 240px;height:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:999px;overflow:hidden}
  .bar{height:100%;width:0;background:var(--hl);transition:width .12s linear}
  .status{min-width:90px;text-align:right}
  button, .btn{background:#1b2633;color:#dfe8f3;border:1px solid #3a5166;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  button:hover, .btn:hover{filter:brightness(1.08)}
  input[type=file]{background:transparent;color:var(--fg)}
  code{background:#111;padding:2px 6px;border-radius:6px;border:1px solid #222}
</style>
</head>
<body>
<div class="wrap">
  <div class="panel">
    <h3>
      <span>Standalone Uploader</span>
      <span>
        <a href="index.php" class="btn" title="Back to Home">Home</a>
      </span>
            <span>
        <a href="background_manager.php" class="btn" title="Uploader with Editor">Image Cropper</a>
      </span>
    </h3>
    <div class="body">
      <div id="drop">Drag & Drop files here (MIDI/KAR, SF2/SF3, JPG/PNG/GIF/WEBP/BMP, MP4/WEBM/OGV, TTF/OTF/WOFF/WOFF2)<br>
        <span class="note">Files are routed automatically to: <code>midi/</code> <code>soundfonts/</code> <code>background/</code> <code>background_video/</code> <code>fonts/</code></span>
      </div>
      <div class="row">
        <input type="file" id="pick" multiple>
        <button id="start">Start Upload</button>
        <button id="clear">Clear</button>
        <span id="hint" class="note"></span>
      </div>
      <div id="list"></div>
      <div class="row">
        <span class="note">PHP limits → upload_max_filesize: <strong><?php echo htmlspecialchars(ini_get('upload_max_filesize')?:''); ?></strong>, post_max_size: <strong><?php echo htmlspecialchars(ini_get('post_max_size')?:''); ?></strong></span>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  function $(id){return document.getElementById(id);} 
  function escapeHtml(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
  function fmtBytes(n){ if(!(n>=0)) return ''; var u=['B','KB','MB','GB','TB']; var i=0,x=n; while(x>=1024 && i<u.length-1){x/=1024;i++;} return (x>=100?x.toFixed(0):x.toFixed(1))+' '+u[i]; }

  var queue=[]; // {file, row, bar, status}

  function makeRow(f){
    var row=document.createElement('div'); row.className='item';
    var name=document.createElement('div'); name.className='name'; name.innerHTML='<div>'+escapeHtml(f.name||'')+'</div><div class="note" style="opacity:.85">'+fmtBytes(f.size||0)+'</div>';
    var bh=document.createElement('div'); bh.className='barHost';
    var bar=document.createElement('div'); bar.className='bar'; bh.appendChild(bar);
    var st=document.createElement('div'); st.className='status note'; st.textContent='Queued';
    row.appendChild(name); row.appendChild(bh); row.appendChild(st);
    $('list').appendChild(row);
    return {row:row, bar:bar, status:st};
  }

  function addFiles(files){
    var allow={'mid':1,'midi':1,'kar':1,'sf2':1,'sf3':1,'jpg':1,'jpeg':1,'png':1,'gif':1,'webp':1,'bmp':1,'mp4':1,'webm':1,'ogv':1,'ttf':1,'otf':1,'woff':1,'woff2':1};
    var added=0;
    for(var i=0;i<files.length;i++){
      var f=files[i]; if(!f||!f.name) continue; var ext=(f.name.split('.').pop()||'').toLowerCase();
      if(!allow[ext]) continue; var r=makeRow(f); queue.push({file:f,row:r.row,bar:r.bar,status:r.status}); added++;
    }
    $('hint').textContent = queue.length + ' file(s) in queue';
    return added;
  }

  function clearQueue(){ queue.length=0; $('list').innerHTML=''; $('hint').textContent=''; }

  function sendOne(item){
    return new Promise(function(resolve){
      var fd=new FormData(); fd.append('files[]', item.file, item.file.name);
      var xhr=new XMLHttpRequest(); xhr.open('POST', location.href, true);
      xhr.upload.onprogress=function(ev){ if(ev.lengthComputable){ var p=(ev.loaded/ev.total)*100; item.bar.style.width=p.toFixed(0)+'%'; item.status.textContent='Uploading… '+p.toFixed(0)+'%'; } };
      xhr.onreadystatechange=function(){ if(xhr.readyState===4){
        if(xhr.status>=200 && xhr.status<300){
          try{
            var js=JSON.parse(xhr.responseText||'{}');
            var ok=false, err='';
            if(js && js.files && js.files.length){ ok=!!js.files[0].ok; err=js.files[0].error||''; }
            else if(js.ok===true){ ok=true; }
            if(ok){ item.bar.style.width='100%'; item.status.textContent='Done'; item.row.style.borderColor='rgba(126,249,167,.35)'; }
            else { item.status.textContent=err||'Failed'; item.row.style.borderColor='rgba(255,120,120,.35)'; }
          }catch(e){ item.status.textContent='Bad JSON'; item.row.style.borderColor='rgba(255,120,120,.35)'; }
        } else {
          item.status.textContent='HTTP '+xhr.status; item.row.style.borderColor='rgba(255,120,120,.35)';
        }
        resolve();
      } };
      xhr.send(fd);
    });
  }

  async function startUpload(){
    if(!queue.length) return; $('start').disabled=true;
    for(var i=0;i<queue.length;i++){ try{ await sendOne(queue[i]); }catch(e){} }
    $('start').disabled=false; $('hint').textContent='Finished.';
  }

  // Bindings
  (function(){
    var drop=$('drop'); var pick=$('pick'); var start=$('start'); var clear=$('clear');
    if(drop){
      var over=function(e){e.preventDefault();e.stopPropagation(); drop.style.background='rgba(255,255,255,.04)';};
      var leave=function(e){e.preventDefault();e.stopPropagation(); drop.style.background='transparent';};
      var ondrop=function(e){e.preventDefault();e.stopPropagation(); drop.style.background='transparent'; var fs=(e.dataTransfer&&e.dataTransfer.files)||[]; addFiles(fs);};
      ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, over); });
      ['dragleave','dragend'].forEach(function(ev){ drop.addEventListener(ev, leave); });
      drop.addEventListener('drop', ondrop);
    }
    pick && pick.addEventListener('change', function(){ addFiles(pick.files||[]); });
    start && start.addEventListener('click', startUpload);
    clear && clear.addEventListener('click', clearQueue);
  })();
})();
</script>
</body>
</html>
