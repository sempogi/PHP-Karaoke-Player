<?php
/**
 * sf2_batch_extract.php
 * Purpose: Scan all .sf2 in /soundfonts, extract preset list, save <Font>.sf2.json next to the .sf2
 *
 * Usage:
 *   - Place this file next to your index.php
 *   - Put your SF2 files under ./soundfonts/
 *   - Open in browser or run via PHP: it outputs a summary JSON of what it created/updated.
 *
 * Output per SF2:
 *   - soundfonts/YourFont.sf2.json
 *   - JSON array: [ { "bankMSB":<int>, "bankLSB":0, "program":<int>, "name":"<string>" }, ... ]
 *
 * Notes:
 *   - Memory safe (streams the file; reads only the pdta/phdr block).
 *   - PHP 7+ compatible (no PHP 8-only functions).
 *   - If a font has no phdr found, it’s reported with "count":0 and "status":"no_phdr".
 *
 * References:
 *   - SoundFont 2.0 Spec (pdta/phdr preset headers): http://www.synthfont.com/sfspec24.pdf
 *   - FluidSynth API (preset iteration concept): https://www.fluidsynth.org/api/group__soundfont__loader.html
 */

header('Content-Type: application/json; charset=utf-8');

// Change if your SF2s live elsewhere:
$SF_DIR = __DIR__ . '/soundfonts';

// ---- MAIN ----
try {
    if (!is_dir($SF_DIR)) {
        out(array('ok'=>false, 'error'=>'SoundFonts directory not found', 'dir'=>$SF_DIR), 500);
    }

    $files = @scandir($SF_DIR);
    if ($files === false) {
        out(array('ok'=>false, 'error'=>'Cannot read directory', 'dir'=>$SF_DIR), 500);
    }

    $results = array();
    foreach ($files as $f) {
        if (substr($f, -4) !== '.sf2') continue;
        $sf2Path = $SF_DIR . '/' . $f;
        $jsonPath = $sf2Path . '.json';

        $status = 'ok';
        $count  = 0;

        // Build/refresh if JSON missing or older than SF2
        if (!is_file($jsonPath) || filemtime($jsonPath) < filemtime($sf2Path)) {
            list($pos, $size) = find_phdr($sf2Path);
            if ($pos < 0 || $size <= 0) {
                $status = 'no_phdr';
                $count  = 0;
            } else {
                $list = read_phdr_records($sf2Path, $pos, $size);
                $count = count($list);
                file_put_contents($jsonPath, json_encode($list, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
                @touch($jsonPath, time());
            }
        } else {
            $arr = json_decode(@file_get_contents($jsonPath), true);
            $count = is_array($arr) ? count($arr) : 0;
        }

        $results[] = array(
            'sf2'   => $f,
            'size'  => @filesize($sf2Path),
            'json'  => rel_path($jsonPath),
            'count' => $count,
            'status'=> $status
        );
    }

    out(array('ok'=>true, 'dir'=>rel_path($SF_DIR), 'items'=>$results));
} catch (Throwable $e) {
    out(array('ok'=>false, 'error'=>$e->getMessage()), 500);
}

// ---- FUNCTIONS ----

/**
 * find_phdr: scan file in small windows to find 'phdr' signature;
 * read its size (LE32) then return [data_offset, data_size]
 */
function find_phdr($path) {
    $fh = @fopen($path, 'rb');
    if (!$fh) return array(-1, 0);

    $chunk = 524288; // 512KB
    $pos = 0; $carry = '';
    $phdrPos = -1; $phdrSize = 0;

    while (!feof($fh)) {
        $buf = fread($fh, $chunk);
        if ($buf === '') break;
        $scan = $carry . $buf;
        $i = strpos($scan, 'phdr');
        if ($i !== false) {
            $abs = $pos - strlen($carry) + $i;
            $st = fopen($path,'rb');
            fseek($st, $abs+4, SEEK_SET);
            $raw = fread($st, 4);
            fclose($st);
            if (strlen($raw) === 4) {
                $phdrSize = unpack('V', $raw)[1]; // little-endian 32-bit
                $phdrPos  = $abs + 8;             // data starts after id+size
                fclose($fh);
                return array($phdrPos, $phdrSize);
            }
        }
        // keep small overlap so 'phdr' split across chunks is found
        $carry = substr($scan, -7);
        $pos  += strlen($buf);
    }
    fclose($fh);
    return array(-1, 0);
}

/**
 * read_phdr_records: parse 38-byte records into JSON-friendly rows
 * Spec: name[20], preset(WORD), bank(WORD), bag(WORD), lib(DWORD), genre(DWORD), morph(DWORD)
 * Last record is EOP terminator → ignore.
 */
function read_phdr_records($path, $dataOffset, $dataSize) {
    $fh = fopen($path, 'rb');
    fseek($fh, $dataOffset, SEEK_SET);
    $blob = fread($fh, $dataSize);
    fclose($fh);

    $recSize = 38;
    $total   = intdiv(strlen($blob), $recSize);
    $out     = array();

    for ($i=0; $i<$total; $i++) {
        $rec = substr($blob, $i*$recSize, $recSize);
        if (strlen($rec) < $recSize) break;

        $name   = rtrim(substr($rec, 0, 20), "\0");
        $preset = unpack('v', substr($rec, 20, 2))[1]; // WORD (LE)
        $bank   = unpack('v', substr($rec, 22, 2))[1]; // WORD (LE)

        // The last phdr entry is EOP (terminator) → ignore
        if ($i === $total-1 && (strcasecmp($name, 'EOP')===0 || $preset===0xFFFF || $bank===0xFFFF)) continue;

        $out[] = array(
            'bankMSB' => $bank, // SF2 exposes one 16-bit bank; we map to MSB and default LSB to 0
            'bankLSB' => 0,
            'program' => $preset,
            'name'    => $name
        );
    }
    return $out;
}

/** Helper: relative path for summary JSON */
function rel_path($abs) {
    $a = str_replace('\\','/',$abs);
    $b = str_replace('\\','/',__DIR__);
    return (strpos($a, $b) === 0) ? ltrim(substr($a, strlen($b)), '/') : $a;
}

/** Output and end */
function out($arr, $code=200) {
    http_response_code($code);
    echo json_encode($arr, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE);
    exit;
}
