<?php
// get_midi.php — serve a single midi file by relative path under ./midi
declare(strict_types=1);

$base = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'midi');
$rel  = $_GET['f'] ?? '';
if ($rel === '' || $base === false) {
  http_response_code(400);
  echo "Bad request";
  exit;
}

// Normalize and prevent traversal
$target = realpath($base . DIRECTORY_SEPARATOR . $rel);
if ($target === false || strpos($target, $base) !== 0 || !is_file($target)) {
  http_response_code(404);
  echo "Not found";
  exit;
}

$size = filesize($target);
$mtime = filemtime($target);

header('Content-Type: audio/midi');
header('Content-Length: ' . $size);
header('Cache-Control: public, max-age=3600');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

readfile($target);
