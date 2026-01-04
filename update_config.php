<?php
// update_config.php — tiny API to read/update config.json
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/config.json';
$base       = 'midi';  // Only allow paths under this base

// FIX: replace single backslash, not a literal "\\" sequence
function normalize_slashes(string $s): string { return str_replace('\\', '/', $s); }

/**
 * Resolve $candidate to a safe path inside $base.
 * Returns canonical "midi" or "midi/sub" style relative path (no trailing slash).
 */
function safeRoot(string $base, string $candidate): ?string {
    $baseReal = realpath($base);
    if (!$baseReal) return null;

    $candidate = trim(normalize_slashes($candidate));

    // Empty means base itself
    if ($candidate === '') {
        $candReal = $baseReal;
    } else {
        // If it's exactly the base (with or without trailing slash), accept base
        $baseNoSlash = rtrim($base, '/');
        if ($candidate === $baseNoSlash || $candidate === $baseNoSlash . '/') {
            $candReal = $baseReal;
        } else {
            // If the candidate is a bare subfolder name, prepend base
            if (strpos($candidate, $baseNoSlash . '/') !== 0) {
                $candidate = $baseNoSlash . '/' . ltrim($candidate, '/');
            }
            $candReal = realpath($candidate);
        }
    }

    if (!$candReal || !is_dir($candReal)) return null;

    // Must be inside base
    if (strpos(normalize_slashes($candReal), normalize_slashes($baseReal)) !== 0) return null;

    // Return "midi" for base itself, or "midi/sub" for subdirs (no trailing slash)
    if ($candReal === $baseReal) {
        return rtrim($base, '/');
    }

    $rel = trim(str_replace(normalize_slashes($baseReal) . '/', '', normalize_slashes($candReal)), '/');
    return rtrim($base, '/') . '/' . $rel;
}

function listSubfolders(string $base): array {
    $out = [];
    $br = realpath($base);
    if (!$br) return $out;
    foreach (scandir($br) as $n) {
        if ($n === '.' || $n === '..') continue;
        $p = $br . DIRECTORY_SEPARATOR . $n;
        if (is_dir($p)) $out[] = $n;
    }
    natcasesort($out);
    return array_values($out);
}

function readConfig(string $configFile, string $base): array {
    $cfg = ['midi_root' => rtrim($base, '/')];
    if (is_file($configFile)) {
        $json = json_decode(@file_get_contents($configFile), true);
        if (is_array($json) && isset($json['midi_root'])) {
            $cfg['midi_root'] = rtrim((string)$json['midi_root'], '/');
        }
    }
    return $cfg;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $cfg   = readConfig($configFile, $base);
    $list  = listSubfolders($base);
    echo json_encode([
        'ok'         => true,
        'midi_root'  => $cfg['midi_root'],       // e.g., "midi" or "midi/sub"
        'base'       => rtrim($base, '/'),       // "midi"
        'subfolders' => $list,                    // ["sub1","sub2",...]
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $data = [];
    if (isset($_SERVER['CONTENT_TYPE']) && stripos($_SERVER['CONTENT_TYPE'], 'application/json') !== false) {
        $data = json_decode($raw, true) ?: [];
    } else {
        $data = $_POST;
    }

    $dir = normalize_slashes(trim((string)($data['dir'] ?? $data['midi_root'] ?? '')));

    // Accept:
    //   ""         -> base ("midi")
    //   "midi"     -> base ("midi")
    //   "sub"      -> midi/sub
    //   "midi/sub" -> midi/sub
    $safe = safeRoot($base, $dir);
    if ($safe === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid folder'], JSON_UNESCAPED_SLASHES);
        exit;
    }

    $payload = ['midi_root' => $safe];
    $tmp = $configFile . '.tmp';
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    $fp = @fopen($tmp, 'wb');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Cannot write temp file'], JSON_UNESCAPED_SLASHES);
        exit;
    }
    @flock($fp, LOCK_EX);
    $written = @fwrite($fp, $json);
    @flock($fp, LOCK_UN);
    @fclose($fp);

    if ($written === false) {
        @unlink($tmp);
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Write failed'], JSON_UNESCAPED_SLASHES);
        exit;
    }

    if (!@rename($tmp, $configFile)) {
        @unlink($tmp);
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Rename failed'], JSON_UNESCAPED_SLASHES);
        exit;
    }

    echo json_encode(['ok' => true, 'midi_root' => rtrim($safe, '/')], JSON_UNESCAPED_SLASHES);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_SLASHES);