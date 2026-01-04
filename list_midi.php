<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=UTF-8');
$base = __DIR__ . '/midi';
$q = isset($_GET['q']) ? strtolower(trim((string)$_GET['q'])) : '';
$max = isset($_GET['max']) ? max(1, (int)$_GET['max']) : 2000;
$exts = ['mid','midi','kar'];
$results = [];
if (!is_dir($base)) {
  echo json_encode(['count'=>0,'files'=>[]]);
  exit;
}
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
  if (!$file->isFile()) continue;
  $ext = strtolower($file->getExtension());
  if (!in_array($ext,$exts,true)) continue;
  $rel = substr($file->getPathname(), strlen($base)+1);
  $rel = str_replace(DIRECTORY_SEPARATOR, '/', $rel);
  if ($q !== '' && strpos(strtolower($rel), $q) === false) continue;
  $results[] = 'midi/' . $rel;
  if (count($results) >= $max) break;
}
echo json_encode(['count'=>count($results),'files'=>$results], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
