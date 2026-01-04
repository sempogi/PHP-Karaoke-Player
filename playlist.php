<?php
// playlist.php — QUEUE-ONLY partial output, ROOT-AWARE (legacy-safe)
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

// --- Config-driven MIDI root ---
$configFile = __DIR__ . '/config.json';
$midiRoot   = 'midi'; // fallback relative folder
if (is_file($configFile)) {
    $json = file_get_contents($configFile);
    $cfg  = json_decode($json, true);
    if (is_array($cfg) && isset($cfg['midi_root']) && is_dir($cfg['midi_root'])) {
        $midiRoot = $cfg['midi_root'];
    }
}
$MIDI_DIR = $midiRoot; // now configurable
$BASE_CANON = realpath($MIDI_DIR);
$BASE_B64   = $BASE_CANON ? base64_encode($BASE_CANON) : '';
// --- End config ---

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function list_files($b, $exts){
    $o = array();
    if (!is_dir($b)) return $o;
    $br = realpath($b);
    if ($br === false) return $o;
    $st = array($b);
    while (!empty($st)){
        $d = array_pop($st);
        $it = @scandir($d);
        if ($it === false) continue;
        foreach ($it as $n){
            if ($n === '.' || $n === '..') continue;
            $p = $d . DIRECTORY_SEPARATOR . $n;
            if (is_dir($p)) { $st[] = $p; continue; }
            $e = strtolower(pathinfo($n, PATHINFO_EXTENSION));
            if (!in_array($e, $exts)) continue;
            $r = realpath($p);
            if ($r === false) continue;
            $rel = str_replace('\\', '/', substr($r, strlen($br) + 1));
            $o[] = array(
                'name' => $n,
                'rel'  => $rel,                        // relative (may be just filename at root)
                'path' => rtrim($b, '/') . '/' . $rel, // absolute-ish string
                'size' => @filesize($r)
            );
        }
    }
    usort($o, 'cmp_name');
    return $o;
}
function cmp_name($a, $b){
    $an = isset($a['name']) ? $a['name'] : '';
    $bn = isset($b['name']) ? $b['name'] : '';
    return strcasecmp($an, $bn);
}

$midiList = list_files($MIDI_DIR, array('mid','midi','kar'));

// PARTIAL mode: queue-only anchors (no navigation), include data-root
if (isset($_GET['partial']) && $_GET['partial'] === '1') {
    foreach ($midiList as $it) {
        $rel       = h(isset($it['rel'])  ? $it['rel']  : '');
        $nameField = isset($it['name']) ? $it['name'] : '';
        $nameNoExt = h(pathinfo($nameField, PATHINFO_FILENAME));
        $size      = isset($it['size']) ? (int)$it['size'] : 0;
        $sizeText  = ($size > 0) ? number_format($size / 1024, 0) . ' KB' : '';

        echo '<div class="row" data-path="' . $rel . '">' 
           .   '<a class="song" href="#" role="button" data-path="' . $rel . '" data-root="' . h($BASE_B64) . '" title="' . $nameNoExt . '">' . $nameNoExt . '</a>'
           .   ($sizeText ? ' <span class="size">' . $sizeText . '</span>' : '')
           .   ' <span class="small">' . h($MIDI_DIR) . '</span>'
           .   '<a href="#" class="btn small songinfo-mini" title="Song Info (Online)" style="margin-left: 6px;">ⓘ</a>'
           . '</div>' . "\n";
    }
    if (empty($midiList)) {
        echo '<div class="row"><span class="small">Put files under /' . h(basename($MIDI_DIR)) . '/</span></div>' . "\n";
    }
    exit;
}
?>
