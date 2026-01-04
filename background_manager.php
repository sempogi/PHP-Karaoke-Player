<?php
// --- Basic hardening & setup ---
// (Turn on display_errors during local debugging if needed)
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Large uploads (adjust to taste)
ini_set('upload_max_filesize', '1000M');
ini_set('post_max_size', '1000M');
ini_set('max_execution_time', '300');
ini_set('memory_limit', '512M');

// Directories (absolute paths for filesystem ops; relative for URLs)
$imgDirFs = __DIR__ . '/background/';
$vidDirFs = __DIR__ . '/background_video/';
$imgDirUrl = 'background/';
$vidDirUrl = 'background_video/';

// Ensure folders exist
if (!is_dir($imgDirFs)) mkdir($imgDirFs, 0755, true);
if (!is_dir($vidDirFs)) mkdir($vidDirFs, 0755, true);

// Whitelists
$allowedImageExt = ['jpg','jpeg','png','gif','webp','bmp'];
$allowedVideoExt = ['mp4','webm','mov','avi','mkv'];
$allowedImageMime = ['image/jpeg','image/png','image/gif','image/webp','image/bmp'];
$allowedVideoMime = ['video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska'];

// Helpers
function json_out(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}
function sanitizeFileName(string $name): string {
    $name = basename($name);
    $name = str_replace(' ', '_', $name);
    $name = preg_replace('/[^A-Za-z0-9._-]/', '', $name) ?? '';
    $name = preg_replace('/\.+/', '.', $name) ?? '';
    $name = ltrim($name, '.');
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'file_' . bin2hex(random_bytes(4));
    }
    return $name;
}
function extOf(string $name): string {
    return strtolower(pathinfo($name, PATHINFO_EXTENSION) ?? '');
}
function ensureWithin(string $fullPath, string $baseDir): bool {
    $realBase = realpath($baseDir);
    $realPath = realpath($fullPath);
    return $realBase !== false && $realPath !== false && strpos($realPath, $realBase) === 0;
}
function uniquePath(string $dir, string $name): string {
    $base = pathinfo($name, PATHINFO_FILENAME);
    $ext  = extOf($name);
    $candidate = $dir . $name;
    $i = 1;
    while (file_exists($candidate)) {
        $candidate = $dir . $base . '-' . $i . ($ext ? ('.' . $ext) : '');
        $i++;
    }
    return $candidate;
}
function finfoMime(string $tmp): string {
    if (class_exists('finfo')) {
        $f = new finfo(FILEINFO_MIME_TYPE);
        $m = $f->file($tmp);
        if ($m) return $m;
    }
    if (function_exists('mime_content_type')) {
        $m = mime_content_type($tmp);
        if ($m) return $m;
    }
    return 'application/octet-stream';
}
function listFilesByExt(string $dir, array $exts): array {
    if (!is_dir($dir)) return [];
    $files = [];
    $it = scandir($dir);
    if (!$it) return [];
    foreach ($it as $f) {
        if ($f === '.' || $f === '..') continue;
        $full = $dir . $f;
        if (!is_file($full)) continue;
        if (in_array(extOf($f), $exts, true)) {
            $files[] = $f; // return basename only
        }
    }
    return $files;
}

// --- API: Upload ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_GET['action'] ?? '') === 'upload') {
    if (!isset($_FILES['files'])) json_out(['ok'=>false,'message'=>'No files'], 400);

    $results = [];
    foreach ($_FILES['files']['name'] as $idx => $origName) {
        $tmp  = $_FILES['files']['tmp_name'][$idx];
        $err  = $_FILES['files']['error'][$idx];
        $size = (int)$_FILES['files']['size'][$idx];

        if ($err !== UPLOAD_ERR_OK) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>"Upload error code $err"]; continue; }
        if (!is_uploaded_file($tmp)) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>"Not an uploaded file"]; continue; }

        $safe = sanitizeFileName($origName);
        $ext  = extOf($safe);
        $mime = finfoMime($tmp);

        $isImage = in_array($ext, $allowedImageExt, true);
        $isVideo = in_array($ext, $allowedVideoExt, true);

        if (!$isImage && !$isVideo) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>'Disallowed extension']; continue; }
        if ($isImage && !in_array($mime, $allowedImageMime, true)) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>"Invalid image MIME ($mime)"]; continue; }
        if ($isVideo && !in_array($mime, $allowedVideoMime, true)) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>"Invalid video MIME ($mime)"]; continue; }

        $targetDir = $isVideo ? $vidDirFs : $imgDirFs;
        $finalPath = uniquePath($targetDir, $safe);
        $finalName = basename($finalPath);

        if (!move_uploaded_file($tmp, $finalPath)) { $results[] = ['ok'=>false,'name'=>$origName, 'message'=>'Move failed']; continue; }

        $results[] = [ 'ok'=>true, 'original'=>$origName, 'saved_as'=>$finalName, 'kind'=>$isVideo ? 'video' : 'image', 'size'=>$size ];
    }
    json_out(['ok'=>true,'results'=>$results]);
}

// --- API: Delete ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_GET['action'] ?? '') === 'delete') {
    $name = sanitizeFileName($_POST['name'] ?? '');
    $kind = $_POST['kind'] ?? '';
    if ($name === '' || !in_array($kind, ['image','video'], true)) { json_out(['ok'=>false, 'message'=>'Bad parameters'], 400); }
    $baseDir = $kind === 'image' ? $imgDirFs : $vidDirFs;
    $full = $baseDir . $name;

    if (!file_exists($full)) json_out(['ok'=>false,'message'=>'File not found'], 404);
    if (!ensureWithin($full, $baseDir)) json_out(['ok'=>false,'message'=>'Out of bounds'], 400);

    if (!unlink($full)) json_out(['ok'=>false,'message'=>'Delete failed'], 500);
    json_out(['ok'=>true,'message'=>"Deleted $name"]);
}

// --- API: Crop (overwrite image) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_GET['action'] ?? '') === 'crop') {
    $name = sanitizeFileName($_GET['name'] ?? '');
    if ($name === '') json_out(['ok'=>false,'message'=>'Missing name'], 400);
    $ext = extOf($name);
    if (!in_array($ext, $allowedImageExt, true)) json_out(['ok'=>false,'message'=>'Not an image file'], 400);

    $full = $imgDirFs . $name;
    if (!file_exists($full)) json_out(['ok'=>false,'message'=>'File not found'], 404);
    if (!ensureWithin($full, $imgDirFs)) json_out(['ok'=>false,'message'=>'Out of bounds'], 400);

    if (!isset($_FILES['blob']) || $_FILES['blob']['error'] !== UPLOAD_ERR_OK) { json_out(['ok'=>false,'message'=>'No crop data'], 400); }

    $tmp = $_FILES['blob']['tmp_name'];
    $mime = finfoMime($tmp);
    if (!in_array($mime, $allowedImageMime, true)) { json_out(['ok'=>false,'message'=>"Invalid MIME $mime"], 400); }

    if (!move_uploaded_file($tmp, $full)) { json_out(['ok'=>false,'message'=>'Write failed'], 500); }
    json_out(['ok'=>true,'message'=>'Saved','name'=>$name, 'url_version'=>time()]);
}

// ---- HTML below (no action) ----
$images = listFilesByExt($imgDirFs, $allowedImageExt);
$videos = listFilesByExt($vidDirFs, $allowedVideoExt);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Background Manager</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="cropper.min.css" rel="stylesheet">
<style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: auto; }
    h1 { margin-bottom: 10px; }
    h2 { margin-top: 30px; }
    .preview { display: flex; flex-wrap: wrap; gap: 12px; }
    .item { width: 160px; word-wrap: break-word; border: 1px solid #eee; padding: 8px; border-radius: 6px; }
    .item img, .item video { width: 100%; height: auto; border-radius: 4px; }
    .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; }
    .btn-primary { background: #007BFF; color: #fff; }
    .btn-secondary { background: #6c757d; color: #fff; }
    .btn-danger { background: #dc3545; color: #fff; }
    .btn-light { background: #f1f3f5; color: #333; }
    #progressContainer { display:none; width:100%; background:#ddd; margin-top:10px; border-radius:5px; overflow:hidden; }
    #progressBar { width:0%; height:20px; background:#4caf50; transition: width 0.3s ease; }
    #progressText { margin-top:5px; }
    #note { display:none; margin:10px 0; padding:10px; border-radius:5px; }
    @media (max-width: 600px) { .item { width: 100%; } }
    #cropModal { display:none; position: fixed; inset:0; background: rgba(0,0,0,0.7); align-items: center; justify-content: center; padding: 16px; z-index: 9999; }
    #cropBox { background: #fff; padding: 12px; border-radius: 8px; max-width: 95vw; max-height: 90vh; display:flex; flex-direction: column; gap: 8px; }
    #cropImage { max-width: 85vw; max-height: 60vh; }
    .toolbar { display:flex; gap:8px; flex-wrap: wrap; justify-content:center; }
</style>
</head>
<body>

<h1>Background Manager</h1>
<div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
  <a href="index.php" class="btn btn-primary">🏠 Home</a>
  <button onclick="history.back()" class="btn btn-secondary">🔙 Back</button>
</div>

<form id="uploadForm" enctype="multipart/form-data" style="margin-top: 12px;">
    <input type="file" name="files[]" multiple accept="image/*,video/*">
    <button type="submit" class="btn btn-primary">Upload</button>
</form>

<div id="progressContainer">
    <div id="progressBar"></div>
    <p id="progressText">0%</p>
</div>
<div id="note"></div>

<div style="margin-top: 20px;">
    <button class="btn btn-light" onclick="showTab('images')">🖼️ Images</button>
    <button class="btn btn-light" onclick="showTab('videos')">🎥 Videos</button>
</div>

<div id="imageTab">
    <h2>Uploaded Images</h2>
    <div class="preview" id="imageList">
        <?php foreach ($images as $name):
            $full = $imgDirFs . $name;
            $url  = $imgDirUrl . rawurlencode($name);
            $size = @filesize($full) ?: 0;
            $kb   = round($size/1024, 2);
            $dim  = @getimagesize($full);
            $res  = $dim ? ($dim[0] . '×' . $dim[1] . ' px') : 'Unknown';
        ?>
        <div class="item" data-name="<?= htmlspecialchars($name) ?>" data-kind="image">
            <img src="<?= htmlspecialchars($url) ?>" alt="Image">
            <div style="font-size:12px;color:#555;">
                <?= htmlspecialchars($name) ?><br>
                Size: <?= $kb ?> KB<br>
                Resolution: <?= htmlspecialchars($res) ?>
            </div>
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                <button class="btn btn-danger" onclick="deleteFile('<?= htmlspecialchars($name) ?>','image')">🗑️ Remove</button>
                <button class="btn btn-secondary" onclick="openCropper('<?= htmlspecialchars($name) ?>')">✂️ Crop</button>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<div id="videoTab" style="display:none;">
    <h2>Uploaded Videos</h2>
    <div class="preview" id="videoList">
        <?php foreach ($videos as $name):
            $full = $vidDirFs . $name;
            $url  = $vidDirUrl . rawurlencode($name);
            $size = @filesize($full) ?: 0;
            $mb   = round($size/(1024*1024), 2);
        ?>
        <div class="item" data-name="<?= htmlspecialchars($name) ?>" data-kind="video">
            <video controls preload="metadata">
                <source src="<?= htmlspecialchars($url) ?>">
            </video>
            <div style="font-size:12px;color:#555;">
                <?= htmlspecialchars($name) ?><br>
                Size: <?= $mb ?> MB
            </div>
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                <button class="btn btn-danger" onclick="deleteFile('<?= htmlspecialchars($name) ?>','video')">🗑️ Remove</button>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<!-- Crop Modal -->
<div id="cropModal">
  <div id="cropBox">
    <img id="cropImage" alt="Crop">
    <div class="toolbar">
        <button class="btn btn-light" onclick="rotateLeft()">⟲ Rotate Left</button>
        <button class="btn btn-light" onclick="rotateRight()">⟳ Rotate Right</button>
        <button class="btn btn-light" onclick="zoomIn()">➕ Zoom In</button>
        <button class="btn btn-light" onclick="zoomOut()">➖ Zoom Out</button>
        <button class="btn btn-light" onclick="toggleAspectRatio()">🔁 Toggle Aspect Ratio</button>
    </div>
    <div class="toolbar">
        <button class="btn btn-primary" onclick="saveCroppedImage()">💾 Save</button>
        <button class="btn btn-secondary" onclick="closeCropper()">❌ Cancel</button>
    </div>
  </div>
</div>

<script src="cropper.min.js"></script>
<script>
const note = document.getElementById('note');
function showNote(msg, ok=true) {
    note.textContent = msg;
    note.style.display = 'block';
    note.style.background = ok ? '#d4edda' : '#f8d7da';
    note.style.color = ok ? '#155724' : '#721c24';
    setTimeout(() => { note.style.opacity = '0'; setTimeout(()=>{ note.style.display='none'; note.style.opacity='1'; }, 400); }, 3500);
}

document.getElementById('uploadForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '?action=upload', true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            document.getElementById('progressContainer').style.display = 'block';
            document.getElementById('progressBar').style.width = percent + '%';
            document.getElementById('progressText').textContent = percent + '%';
        }
    };
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.ok) {
                    const okCount = res.results.filter(r=>r.ok).length;
                    const fail = res.results.filter(r=>!r.ok);
                    showNote(`Uploaded: ${okCount}, Failed: ${fail.length}` , fail.length===0);
                    setTimeout(()=> location.reload(), 900);
                } else {
                    showNote(res.message || 'Upload failed', false);
                }
            } catch {
                showNote('Bad server response', false);
            }
        } else {
            showNote('Upload failed', false);
        }
    };
    xhr.send(formData);
});

function showTab(tab) {
    localStorage.setItem('bgTab', tab);
    document.getElementById('imageTab').style.display = tab === 'images' ? 'block' : 'none';
    document.getElementById('videoTab').style.display = tab === 'videos' ? 'block' : 'none';
}
window.addEventListener('DOMContentLoaded', () => {
    const savedTab = localStorage.getItem('bgTab') || 'images';
    showTab(savedTab);
});

function cssEscape(s){ return s.replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|\/@])/g,'\\$1'); }

function deleteFile(name, kind) {
    if (!confirm(`Delete ${name}?`)) return;
    fetch('?action=delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({name, kind}).toString()
    })
    .then(r=>r.json())
    .then(res=>{
        if (res.ok) {
            const sel = `.item[data-name="${cssEscape(name)}"][data-kind="${kind}"]`;
            const el = document.querySelector(sel);
            if (el) el.remove();
            showNote('File deleted');
        } else {
            showNote(res.message || 'Delete failed', false);
        }
    })
    .catch(()=> showNote('Delete failed', false));
}

// ---- Cropper integration ----
let cropper = null;
let cropName = null;
const cropModal = document.getElementById('cropModal');
const cropImage = document.getElementById('cropImage');
let lockAspect = false;

function openCropper(name) {
    cropName = name;
    cropImage.src = '<?= htmlspecialchars($imgDirUrl, ENT_QUOTES) ?>' + encodeURIComponent(name) + '?' + Date.now();
    cropModal.style.display = 'flex';

    if (cropper) { cropper.destroy(); cropper = null; }

    cropImage.onload = () => {
        cropper = new Cropper(cropImage, {
            viewMode: 1,
            autoCropArea: 1,
            responsive: true,
            movable: true,
            zoomable: true,
            scalable: true,
            aspectRatio: lockAspect ? 16/9 : NaN
        });
    };
}
function closeCropper() {
    if (cropper) { cropper.destroy(); cropper = null; }
    cropModal.style.display = 'none';
    cropName = null;
}
function rotateLeft(){ if (cropper) cropper.rotate(-90); }
function rotateRight(){ if (cropper) cropper.rotate(90); }
function zoomIn(){ if (cropper) cropper.zoom(0.1); }
function zoomOut(){ if (cropper) cropper.zoom(-0.1); }
function toggleAspectRatio(){ lockAspect = !lockAspect; if (cropper) cropper.setAspectRatio(lockAspect ? 16/9 : NaN); }
function saveCroppedImage() {
    if (!cropper || !cropName) return;
    const canvas = cropper.getCroppedCanvas({maxWidth: 4096, maxHeight: 4096});
    if (!canvas) { showNote('Cannot crop this image', false); return; }

    const ext = cropName.split('.').pop().toLowerCase();
    let mime = 'image/jpeg';
    let quality = 0.95;
    if (ext === 'png') { mime = 'image/png'; quality = 0.92; }
    else if (ext === 'webp') { mime = 'image/webp'; quality = 0.92; }
    else if (ext === 'gif' || ext === 'bmp') { mime = 'image/png'; quality = 0.92; }

    canvas.toBlob((blob)=>{
        const fd = new FormData();
        fd.append('blob', blob, cropName);
        fetch('?action=crop&name=' + encodeURIComponent(cropName), { method:'POST', body: fd })
        .then(r=>r.json())
        .then(res=>{
            if (res.ok) {
                showNote('Cropped image saved');
                const thumb = document.querySelector(`.item[data-name="${cssEscape(cropName)}"][data-kind="image"] img`);
                if (thumb) thumb.src = '<?= htmlspecialchars($imgDirUrl, ENT_QUOTES) ?>' + encodeURIComponent(cropName) + '?' + (res.url_version || Date.now());
                closeCropper();
            } else {
                showNote(res.message || 'Save failed', false);
            }
        })
        .catch(()=> showNote('Save failed', false));
    }, mime, quality);
}
</script>
</body>
</html>
