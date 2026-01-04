<?php
// scan_midi.php — returns JSON list of .mid/.kar under ./midi (recursive)
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$base = __DIR__ . DIRECTORY_SEPARATOR . 'midi';
if (!is_dir($base)) {
  http_response_code(200);
  echo json_encode(['ok'=>true, 'items'=>[], 'message'=>'midi/ folder not found (empty list).']);
  exit;
}

$items = [];
$rii = new RecursiveIteratorIterator(
  new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS)
);

foreach ($rii as $file) {
  /** @var SplFileInfo $file */
  if (!$file->isFile()) continue;
  $ext = strtolower($file->getExtension());
  if (!in_array($ext, ['mid','midi','kar'], true)) continue;

  $full = $file->getRealPath();
  $rel  = ltrim(str_replace(realpath($base), '', realpath($full)), DIRECTORY_SEPARATOR);

  // Normalize to forward slashes for URLs
  $relUrl = str_replace(DIRECTORY_SEPARATOR, '/', $rel);

  $items[] = [
    'name' => $file->getBasename(),
    'rel'  => $relUrl,
    'size' => $file->getSize(),
    'mtime'=> $file->getMTime(),
    'url'  => 'get_midi.php?f=' . rawurlencode($relUrl)
  ];
}

usort($items, function($a,$b){ return strcmp($a['rel'], $b['rel']); });

echo json_encode(['ok'=>true, 'items'=>$items, 'count'=>count($items)]);
