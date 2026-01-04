<?php
/**
 * KAR Lyrics Editor — v0.4 (Per-word editing)
 * Read/Edit/Export (JSON, LRC/extended LRC) + Embed lyrics into new KAR/MIDI with options
 *
 * New in v0.4:
 *  - Per-word lyric editing: maintain a separate words[] list (tick + text per word)
 *  - Auto-split lines into words; simple tick distribution; manual fine-tuning
 *  - Export Extended LRC (inline word timestamps) matching your timestamp-first preference
 *  - Embed to KAR: writes FF 05 meta per word (or per line if no words[])
 *
 * v0.3 features preserved:
 *  - Optionally STRIP existing lyric meta events (FF 05) before appending new lyrics track
 *  - Non-destructive by default; appends fresh lyrics track; writes SMF Format 1
 */

declare(strict_types=1);
mb_internal_encoding('UTF-8');

const BASE_DIR = __DIR__ . '/midi';
const OUT_DIR  = BASE_DIR . '/.lyrics';
const ALLOWED = ['mid','midi','kar'];

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function okdir(string $d): void { if (!is_dir($d)) @mkdir($d, 0775, true); }

/* -------- Binary helpers -------- */
function be16(int $v): string { return chr(($v>>8)&0xFF).chr($v&0xFF); }
function be32(int $v): string { return chr(($v>>24)&0xFF).chr(($v>>16)&0xFF).chr(($v>>8)&0xFF).chr($v&0xFF); }
function read_u32_be(string $s, int $pos): int { return (ord($s[$pos])<<24) | (ord($s[$pos+1])<<16) | (ord($s[$pos+2])<<8) | ord($s[$pos+3]); }
function read_u16_be(string $s, int $pos): int { return (ord($s[$pos])<<8) | ord($s[$pos+1]); }
function read_varlen(string $s, int &$pos, int $limit): int {
    $val = 0; $count = 0;
    while ($pos < $limit) {
        $b = ord($s[$pos++]); $count++;
        $val = ($val << 7) | ($b & 0x7F);
        if (($b & 0x80) === 0) break;
        if ($count > 5) break; // safety
    }
    return $val;
}
function write_varlen(int $val): string {
    $bytes = [$val & 0x7F];
    $val >>= 7;
    while ($val > 0) {
        $bytes[] = ($val & 0x7F) | 0x80;
        $val >>= 7;
    }
    $out = '';
    for ($i = count($bytes)-1; $i >= 0; $i--) $out .= chr($bytes[$i]);
    return $out;
}

/* -------- Text helpers -------- */
function clean_text($s): string {
    if ($s === null) return '';
    if (is_array($s)) $s = implode(' ', array_map(fn($x)=> is_string($x)?$x:(string)$x, $s));
    elseif (!is_string($s)) $s = (string)$s;
    $out = @preg_replace('/[^\P{C}\t\r\n]+/u', ' ', $s); if (!is_string($out)) $out = $s;
    $out2 = @preg_replace('/\s+/u', ' ', $out); if (!is_string($out2)) $out2 = $out;
    return trim($out2);
}
function to_kar_bytes(string $utf8): string {
    $b = @mb_convert_encoding($utf8, 'ISO-8859-1', 'UTF-8');
    if (!is_string($b)) { $ascii = preg_replace('/[^\x20-\x7E]/', '?', $utf8); return $ascii ?? ''; }
    return $b;
}

/* -------- Parse -------- */
function parse_midi_full(string $bin): array {
    $len = strlen($bin);
    if ($len < 14 || substr($bin,0,4) !== 'MThd') return ['ppq'=>480,'format'=>1,'tracks'=>0,'tempos'=>[],'lyrics'=>[], 'trackChunks'=>[], 'division'=>480];
    $hdrLen = read_u32_be($bin, 4); if ($hdrLen < 6) $hdrLen = 6;
    $format = read_u16_be($bin, 8);
    $tracks = read_u16_be($bin, 10);
    $division = read_u16_be($bin, 12);
    $ppq = ($division & 0x8000) ? 480 : $division;
    $pos = 8 + $hdrLen;

    $tempos = [[0, 500000]]; $lyrics = []; $chunks = [];

    for ($t=0; $t < $tracks && $pos+8 <= $len; $t++) {
        if (substr($bin,$pos,4) !== 'MTrk') break;
        $trkLen = read_u32_be($bin, $pos+4);
        $chunkStart = $pos; $trkStart = $pos + 8; $trkEnd = $trkStart + $trkLen; $pos = $trkEnd;
        if ($trkEnd > $len) break;
        $chunks[] = substr($bin, $chunkStart, 8 + $trkLen);

        $absTick = 0; $runningStatus = 0; $p = $trkStart;
        while ($p < $trkEnd) {
            $delta = read_varlen($bin, $p, $trkEnd); $absTick += $delta;
            if ($p >= $trkEnd) break;
            $status = ord($bin[$p]);
            if ($status === 0xFF) {
                $p++; if ($p >= $trkEnd) break; $type = ord($bin[$p++]);
                $lenField = read_varlen($bin, $p, $trkEnd);
                $data = substr($bin, $p, $lenField); $p += $lenField;
                if ($type === 0x51 && $lenField === 3) { $us = (ord($data[0])<<16) | (ord($data[1])<<8) | ord($data[2]); $tempos[] = [$absTick, $us]; }
                elseif ($type === 0x05) { $text = @mb_convert_encoding($data, 'UTF-8', 'UTF-8,ISO-8859-1'); $text = clean_text($text); if ($text !== '') $lyrics[] = [$absTick, $text]; }
            } elseif ($status === 0xF0 || $status === 0xF7) {
                $p++; $lenField = read_varlen($bin, $p, $trkEnd); $p += $lenField;
            } else {
                if ($status < 0x80) { $dataByte1 = $status; $status = $runningStatus; $typeHi = $status & 0xF0; if ($typeHi === 0xC0 || $typeHi === 0xD0) { } else { $p += 1; } }
                else { $runningStatus = $status; $typeHi = $status & 0xF0; $p++; if ($typeHi === 0xC0 || $typeHi === 0xD0) { $p += 1; } else { $p += 2; } }
            }
        }
    }
    usort($lyrics, fn($a,$b)=> $a[0] <=> $b[0]); usort($tempos, fn($a,$b)=> $a[0] <=> $b[0]);
    return ['ppq'=>$ppq,'format'=>$format,'tracks'=>count($chunks),'tempos'=>$tempos,'lyrics'=>$lyrics,'trackChunks'=>$chunks,'division'=>$division];
}

function ticks_to_ms(int $tick, int $ppq, array $tempos): float {
    $ms = 0.0; $prevTick = 0; $prevUs = $tempos[0][1] ?? 500000;
    foreach ($tempos as $seg) { [$segTick, $segUs] = $seg; if ($segTick >= $tick) break; $deltaTicks = $segTick - $prevTick; $ms += ($deltaTicks * $prevUs) / $ppq / 1000.0; $prevTick = $segTick; $prevUs = $segUs; }
    $deltaTicks = $tick - $prevTick; $ms += ($deltaTicks * $prevUs) / $ppq / 1000.0; return $ms;
}
function ms_to_tag(float $ms): string { $total = (int)round($ms); $min = intdiv($total, 60000); $sec = intdiv($total % 60000, 1000); $hund = intdiv($total % 1000, 10); return sprintf('[%02d:%02d.%02d]', $min, $sec, $hund); }

/* -------- Rebuild original track (optional strip FF05) -------- */
function rebuild_track_strip_lyrics(string $chunk, bool $strip): string {
    if (substr($chunk,0,4) !== 'MTrk') return $chunk;
    $len = read_u32_be($chunk, 4);
    $data = substr($chunk, 8, $len);
    $p = 0; $limit = strlen($data);
    $outData = '';
    $carryDelta = 0; $runningStatus = 0;
    while ($p < $limit) {
        $delta = read_varlen($data, $p, $limit);
        if ($p >= $limit) break;
        $status = ord($data[$p]);
        if ($status === 0xFF) {
            $p++; if ($p >= $limit) break; $type = ord($data[$p++]);
            $lenField = read_varlen($data, $p, $limit);
            $evtData = substr($data, $p, $lenField); $p += $lenField;
            $newDelta = $carryDelta + $delta; $carryDelta = 0;
            if ($strip && $type === 0x05) { $carryDelta = $newDelta; continue; }
            $outData .= write_varlen($newDelta) . "\xFF" . chr($type) . write_varlen(strlen($evtData)) . $evtData;
        } elseif ($status === 0xF0 || $status === 0xF7) {
            $p++; $lenField = read_varlen($data, $p, $limit); $evtData = substr($data, $p, $lenField); $p += $lenField;
            $newDelta = $carryDelta + $delta; $carryDelta = 0;
            $outData .= write_varlen($newDelta) . chr($status) . write_varlen(strlen($evtData)) . $evtData;
        } else {
            if ($status < 0x80) { $dataByte1 = $status; $status = $runningStatus; $typeHi = $status & 0xF0; if ($typeHi === 0xC0 || $typeHi === 0xD0) { $bytes = chr($status) . chr($dataByte1); } else { $dataByte2 = ord($data[$p++]); $bytes = chr($status) . chr($dataByte1) . chr($dataByte2); } }
            else { $runningStatus = $status; $typeHi = $status & 0xF0; $p++; if ($typeHi === 0xC0 || $typeHi === 0xD0) { $d1 = ord($data[$p++]); $bytes = chr($status) . chr($d1); } else { $d1 = ord($data[$p++]); $d2 = ord($data[$p++]); $bytes = chr($status) . chr($d1) . chr($d2); } }
            $newDelta = $carryDelta + $delta; $carryDelta = 0;
            $outData .= write_varlen($newDelta) . $bytes;
        }
    }
    $outData .= write_varlen($carryDelta) . "\xFF\x2F\x00";
    return 'MTrk' . be32(strlen($outData)) . $outData;
}

/* -------- Build lyrics track from lines or words -------- */
function build_lyrics_track(array $lines, ?array $words): string {
    $trk = write_varlen(0) . "\xFF\x03" . write_varlen(6) . 'Lyrics';
    $prev = 0;
    if (is_array($words) && count($words)>0) {
        foreach ($words as $w) {
            $tick = max(0, (int)($w['tick'] ?? 0));
            $txt  = clean_text((string)($w['text'] ?? ''));
            if ($txt === '') continue;
            $delta = $tick - $prev; if ($delta < 0) $delta = 0; $prev = $tick;
            $raw = to_kar_bytes($txt);
            $trk .= write_varlen($delta) . "\xFF\x05" . write_varlen(strlen($raw)) . $raw;
        }
    } else {
        foreach ($lines as $ev) {
            $tick = max(0, (int)($ev['tick'] ?? $ev[0] ?? 0));
            $txt  = clean_text((string)($ev['text'] ?? $ev[1] ?? ''));
            if ($txt === '') continue;
            $delta = $tick - $prev; if ($delta < 0) $delta = 0; $prev = $tick;
            $raw = to_kar_bytes($txt);
            $trk .= write_varlen($delta) . "\xFF\x05" . write_varlen(strlen($raw)) . $raw;
        }
    }
    $trk .= write_varlen(0) . "\xFF\x2F\x00";
    return 'MTrk' . be32(strlen($trk)) . $trk;
}

/* -------- Controller -------- */
$files = [];
if (is_dir(BASE_DIR)) {
    foreach (scandir(BASE_DIR) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue;
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        if (in_array($ext, ALLOWED, true) && is_file(BASE_DIR.'/'.$f)) $files[] = $f;
    }
}
natcasesort($files); $files = array_values($files);

$sel = isset($_GET['file']) ? basename((string)$_GET['file']) : '';
$abs = ($sel !== '' ? BASE_DIR . '/' . $sel : '');
$loaded = null; $ppq = 480; $tempos = [[0,500000]]; $format=1; $ntracks=0; $division=480; $trackChunks=[];
$lines = []; // [ ['tick'=>int,'text'=>string], ... ] (line-level)
$words = []; // [ ['tick'=>int,'text'=>string], ... ] (word-level)

if ($sel !== '' && is_file($abs)) {
    $bin = @file_get_contents($abs);
    if ($bin !== false) {
        $parsed = parse_midi_full($bin);
        $ppq = (int)($parsed['ppq'] ?? 480);
        $format = (int)($parsed['format'] ?? 1);
        $ntracks = (int)($parsed['tracks'] ?? 0);
        $division = (int)($parsed['division'] ?? $ppq);
        $tempos = $parsed['tempos'] ?? [[0,500000]];
        $lyrics = $parsed['lyrics'] ?? [];
        foreach ($lyrics as $ev) { $lines[] = ['tick'=>$ev[0], 'text'=>$ev[1]]; }
        $trackChunks = $parsed['trackChunks'] ?? [];
        $loaded = true;
    }
}

// Try to load sidecar JSON if present to rehydrate edits including words[]
if ($sel !== '' && is_file(OUT_DIR . '/' . $sel . '.json')) {
    $j = @file_get_contents(OUT_DIR . '/' . $sel . '.json');
    if ($j !== false) {
        $arr = json_decode($j, true);
        if (is_array($arr)) {
            $ppq = (int)($arr['ppq'] ?? $ppq);
            $evs = $arr['events'] ?? [];
            $ws  = $arr['words'] ?? [];
            $lines = [];
            if (is_array($evs)) { foreach ($evs as $e) { $lines[] = ['tick'=>(int)($e['tick'] ?? 0), 'text'=> (string)($e['text'] ?? '')]; } }
            if (is_array($ws)) { $words = []; foreach ($ws as $w) { $words[] = ['tick'=>(int)($w['tick'] ?? 0), 'text'=> (string)($w['text'] ?? '')]; } }
        }
    }
}

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $sel !== '' && is_file($abs)) {
    $action = $_POST['action'] ?? '';

    // Capture posted line edits
    $lineTicks = $_POST['tick'] ?? [];
    $lineTexts = $_POST['text'] ?? [];
    $newLines = [];
    if (is_array($lineTicks) && is_array($lineTexts)) {
        $n = min(count($lineTicks), count($lineTexts));
        for ($i=0; $i<$n; $i++) {
            $t = (int)$lineTicks[$i]; $x = clean_text($lineTexts[$i] ?? '');
            if ($t >= 0 && $x !== '') $newLines[] = ['tick'=>$t, 'text'=>$x];
        }
    }
    usort($newLines, fn($a,$b)=> ($a['tick'] <=> $b['tick']));
    if (!empty($newLines)) $lines = $newLines;

    // Capture posted words edits
    $wordTicks = $_POST['wtick'] ?? [];
    $wordTexts = $_POST['wtext'] ?? [];
    $newWords = [];
    if (is_array($wordTicks) && is_array($wordTexts)) {
        $m = min(count($wordTicks), count($wordTexts));
        for ($i=0; $i<$m; $i++) {
            $t = (int)$wordTicks[$i]; $x = (string)($wordTexts[$i] ?? ''); // don't over-trim per-user pref
            $x = trim($x); // minimal trim to avoid empty words
            if ($t >= 0 && $x !== '') $newWords[] = ['tick'=>$t, 'text'=>$x];
        }
    }
    usort($newWords, fn($a,$b)=> ($a['tick'] <=> $b['tick']));
    if ($action !== 'clear_words' && !empty($newWords)) $words = $newWords;

    if ($action === 'save_json') {
        okdir(OUT_DIR);
        $jsonPath = OUT_DIR . '/' . $sel . '.json';
        @file_put_contents($jsonPath, json_encode(['ppq'=>$ppq,'events'=>$lines,'words'=>$words], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
        $msg = 'Saved JSON: ' . h($jsonPath);

    } elseif ($action === 'export_lrc') {
        okdir(OUT_DIR);
        $linesOut = [];
        foreach ($lines as $ev) { $ms = ticks_to_ms((int)$ev['tick'], $ppq, $tempos); $linesOut[] = ms_to_tag($ms) . ' ' . $ev['text']; }
        $lrc = implode("\n", $linesOut) . "\n";
        $lrcPath = OUT_DIR . '/' . pathinfo($sel, PATHINFO_FILENAME) . '.lrc';
        @file_put_contents($lrcPath, $lrc);
        $msg = 'Exported LRC: ' . h($lrcPath);

    } elseif ($action === 'export_lrc_ext') {
        okdir(OUT_DIR);
        // Extended LRC: word-level tags inline, per user's timestamp-first preference
        $extended = [];
        if (!empty($words)) {
            // Build by grouping words by nearest preceding line tick
            // Simple approach: just concatenate words with their own tags in a single line block
            $buf = [];
            foreach ($words as $w) {
                $ms = ticks_to_ms((int)$w['tick'], $ppq, $tempos);
                $buf[] = '<' . substr(ms_to_tag($ms), 1, -1) . '>' . $w['text']; // tag without brackets
            }
            $extended[] = implode(' ', $buf);
        } else {
            // fallback: per-line tag only
            foreach ($lines as $ev) { $ms = ticks_to_ms((int)$ev['tick'], $ppq, $tempos); $extended[] = ms_to_tag($ms) . ' ' . $ev['text']; }
        }
        $lrcPath = OUT_DIR . '/' . pathinfo($sel, PATHINFO_FILENAME) . '.ext.lrc';
        @file_put_contents($lrcPath, implode("\n", $extended) . "\n");
        $msg = 'Exported Extended LRC: ' . h($lrcPath);

    } elseif ($action === 'split_words') {
        // Auto-split: break each line's text by spaces into words, assign ticks
        $words = [];
        $defaultGap = max(1, (int)($_POST['gap_ticks'] ?? 15)); // simple gap per word
        foreach ($lines as $ev) {
            $t0 = (int)$ev['tick'];
            $parts = preg_split('/\s+/', (string)$ev['text']);
            $cur = $t0;
            foreach ($parts as $p) {
                $p = trim($p);
                if ($p === '') continue;
                $words[] = ['tick'=>$cur, 'text'=>$p];
                $cur += $defaultGap;
            }
        }
        $msg = 'Auto-split into ' . count($words) . ' word(s). Adjust ticks as needed, then Save/Export.';

    } elseif ($action === 'clear_words') {
        $words = [];
        $msg = 'Cleared per-word edits.';

    } elseif ($action === 'export_kar') {
        $strip = !empty($_POST['strip_existing']);
        $forceKar = !empty($_POST['force_kar']);
        if (!$loaded) { $msg = 'Cannot export: file not loaded.'; }
        else {
            okdir(OUT_DIR);
            $rebuilt = [];
            foreach ($trackChunks as $chunk) { $rebuilt[] = rebuild_track_strip_lyrics($chunk, $strip); }
            $hdr = 'MThd' . be32(6) . be16(1) . be16(count($rebuilt) + 1) . be16($division);
            $body = implode('', $rebuilt);
            $lyrTrk = build_lyrics_track($lines, $words);
            $out = $hdr . $body . $lyrTrk;
            $base = pathinfo($sel, PATHINFO_FILENAME);
            $extOut = $forceKar ? 'kar' : (strtolower(pathinfo($sel, PATHINFO_EXTENSION)) === 'mid' ? 'mid' : 'kar');
            $outPath = OUT_DIR . '/' . $base . '_lyrics.' . $extOut;
            $ok = @file_put_contents($outPath, $out);
            $msg = ($ok === false) ? 'Failed to write output file.' : ('Exported with embedded lyrics: ' . h($outPath) . ($strip? ' (existing lyrics stripped)':''));
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>KAR Lyrics Editor v0.4 (Per-word)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 16px; }
  .panel { border:1px solid #ccc; border-radius:8px; padding:12px; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:6px; border-bottom:1px solid #ddd; vertical-align:top; }
  input[type=text], input[type=number], select { width:100%; box-sizing:border-box; padding:6px; }
  .small { font-size:12px; color:#666; }
  .actions button { margin-right:6px; }
  .opts { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:8px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  @media (max-width:700px){ .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h2>KAR Lyrics Editor v0.4 — Per-word editing</h2>
<div class="panel">
  <form method="get" action="">
    <label>Select MIDI/KAR:</label>
    <select name="file" onchange="this.form.submit()">
      <option value="">-- choose --</option>
      <?php foreach ($files as $f): $selAttr = ($f===$sel?' selected':''); ?>
        <option value="<?=h($f)?>"<?=$selAttr?>><?=h($f)?></option>
      <?php endforeach; ?>
    </select>
  </form>
  <?php if ($sel && !$loaded): ?>
    <div class="small">Failed to load or parse file.</div>
  <?php endif; ?>
</div>

<?php if ($loaded): ?>
<div class="panel">
  <div><strong>Info</strong></div>
  <div class="small">File: <?=h($sel)?> · Format: <?=h((string)$format)?> · Tracks: <?=h((string)$ntracks)?> · PPQ: <?=h((string)$ppq)?> · Tempo changes: <?=count($tempos)?> · Lines: <?=count($lines)?> · Words: <?=count($words)?></div>
  <div class="small">Tip: Use "Auto-split" to create words quickly, then adjust their ticks. Export Extended LRC for inline word tags; KAR embed writes per-word FF 05.</div>
</div>

<div class="grid">
  <!-- Line-level editor -->
  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="save_json">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div><strong>Line-level Lyrics</strong></div>
      <div class="actions">
        <button type="submit">Save JSON</button>
        <button type="submit" formaction="" formmethod="post" name="action" value="export_lrc">Export LRC</button>
      </div>
    </div>
    <table>
      <thead><tr><th style="width:140px;">Tick</th><th>Text</th></tr></thead>
      <tbody>
        <?php if (empty($lines)): ?>
          <tr><td colspan="2" class="small">No line lyrics found. Add rows below and Save.</td></tr>
        <?php endif; ?>
        <?php foreach ($lines as $ev): ?>
          <tr>
            <td><input type="number" name="tick[]" value="<?=h((string)$ev['tick'])?>" min="0"></td>
            <td><input type="text" name="text[]" value="<?=h($ev['text'])?>"></td>
          </tr>
        <?php endforeach; ?>
        <tr>
          <td><input type="number" name="tick[]" value="" min="0" placeholder="tick"></td>
          <td><input type="text" name="text[]" value="" placeholder="Type lyric line"></td>
        </tr>
      </tbody>
    </table>
    <div class="opts">
      <label>Auto-split gap (ticks): <input type="number" name="gap_ticks" value="15" min="1" style="width:120px"></label>
      <button type="submit" name="action" value="split_words">Auto-split into words</button>
    </div>
  </form>

  <!-- Word-level editor -->
  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="save_json">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div><strong>Per-word Lyrics</strong></div>
      <div class="actions">
        <button type="submit">Save JSON</button>
        <button type="submit" formaction="" formmethod="post" name="action" value="export_lrc_ext">Export Extended LRC</button>
        <button type="submit" formaction="" formmethod="post" name="action" value="clear_words">Clear Words</button>
      </div>
    </div>
    <table>
      <thead><tr><th style="width:140px;">Word Tick</th><th>Word Text</th></tr></thead>
      <tbody>
        <?php if (empty($words)): ?>
          <tr><td colspan="2" class="small">No per-word entries yet. Use Auto-split or add words below.</td></tr>
        <?php endif; ?>
        <?php foreach ($words as $w): ?>
          <tr>
            <td><input type="number" name="wtick[]" value="<?=h((string)$w['tick'])?>" min="0"></td>
            <td><input type="text" name="wtext[]" value="<?=h($w['text'])?>"></td>
          </tr>
        <?php endforeach; ?>
        <tr>
          <td><input type="number" name="wtick[]" value="" min="0" placeholder="tick"></td>
          <td><input type="text" name="wtext[]" value="" placeholder="Type word"></td>
        </tr>
      </tbody>
    </table>
  </form>
</div>

<!-- Export KAR/MID panel -->
<form method="post" action="" class="panel">
  <input type="hidden" name="action" value="export_kar">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div><strong>Embed to KAR/MID</strong></div>
    <div class="actions">
      <button type="submit">Export KAR/MID</button>
    </div>
  </div>
  <div class="opts">
    <label><input type="checkbox" name="strip_existing" value="1"> Strip existing lyrics (FF 05) from original tracks</label>
    <label><input type="checkbox" name="force_kar" value="1"> Force .kar extension for output</label>
  </div>
  <div class="small">When words[] exist, embed per-word FF 05 events. Otherwise, embed line-level events.</div>
</form>

<?php endif; ?>

<?php if ($msg): ?>
<div class="panel" style="background:#f8fff8;border-color:#bcd6bc;">✅ <?=h($msg)?></div>
<?php endif; ?>

</body>
</html>
