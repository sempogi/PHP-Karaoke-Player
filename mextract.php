<?php
/**
 * MIDI Tick & Lyric Extractor — v1.1 (PHP, single-file)
 *
 * Purpose:
 *   Extract absolute ticks and texts from Lyric (FF 05), Text (FF 01), Marker (FF 06), Cue (FF 07)
 *   Optionally detect basic KAR tags (e.g., @KMIDI KARAOKE FILE, @T, @I) and include them.
 *
 * Usage:
 *   - Place beside your app; it scans ./midi and writes outputs to ./midi/.lyrics
 *   - Choose which meta types to include (Lyric/Text/Marker/Cue)
 *   - Toggle "Detect KAR tags" to keep @-prefixed entries
 *   - Download JSON/CSV or save files
 */

declare(strict_types=1);
mb_internal_encoding('UTF-8');

const BASE_DIR = __DIR__ . '/midi';
const OUT_DIR  = BASE_DIR . '/.lyrics';
const ALLOWED  = ['mid','midi','kar'];

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function okdir(string $d): void { if (!is_dir($d)) @mkdir($d, 0775, true); }

/* ---------- Binary helpers ---------- */
function read_u32_be(string $s, int $pos): int { return (ord($s[$pos])<<24) | (ord($s[$pos+1])<<16) | (ord($s[$pos+2])<<8) | ord($s[$pos+3]); }
function read_u16_be(string $s, int $pos): int { return (ord($s[$pos])<<8) | ord($s[$pos+1]); }
function read_varlen(string $s, int &$p, int $limit): int {
    $val = 0; $cnt = 0;
    while ($p < $limit) { $b = ord($s[$p++]); $cnt++; $val = ($val<<7) | ($b & 0x7F); if (($b & 0x80) === 0) break; if ($cnt>5) break; }
    return $val;
}

/* ---------- Text helpers ---------- */
function clean_text($s): string {
    if ($s === null) return '';
    if (is_array($s)) $s = implode(' ', array_map(fn($x)=> is_string($x)?$x:(string)$x, $s));
    elseif (!is_string($s)) $s = (string)$s;
    $out = @preg_replace('/[^\P{C}\t\r\n]+/u', ' ', $s); if (!is_string($out)) $out = $s;
    $out2 = @preg_replace('/\s+/u', ' ', $out); if (!is_string($out2)) $out2 = $out;
    return trim($out2);
}

/* ---------- Parse ---------- */
function parse_midi_meta(string $bin, array $types, bool $keepKarTags): array {
    $len = strlen($bin);
    $ppq = 480; $tempos = [[0,500000]]; $events = []; $isKAR = false;
    if ($len < 14 || substr($bin,0,4) !== 'MThd') return [$ppq, $tempos, $events, $isKAR];
    $hdrLen = read_u32_be($bin, 4); if ($hdrLen < 6) $hdrLen = 6;
    $tracks = read_u16_be($bin, 10);
    $division = read_u16_be($bin, 12);
    $ppq = ($division & 0x8000) ? 480 : $division;
    $pos = 8 + $hdrLen;

    for ($t=0; $t<$tracks && $pos+8 <= $len; $t++) {
        if (substr($bin,$pos,4) !== 'MTrk') break;
        $trkLen = read_u32_be($bin, $pos+4);
        $trkStart = $pos + 8; $trkEnd = $trkStart + $trkLen; $pos = $trkEnd; if ($trkEnd > $len) break;
        $abs = 0; $p = $trkStart; $running = 0;
        while ($p < $trkEnd) {
            $delta = read_varlen($bin, $p, $trkEnd); $abs += $delta; if ($p >= $trkEnd) break;
            $status = ord($bin[$p]);
            if ($status === 0xFF) {
                $p++; if ($p >= $trkEnd) break; $type = ord($bin[$p++]);
                $l = read_varlen($bin, $p, $trkEnd); $data = substr($bin, $p, $l); $p += $l;
                if ($type === 0x51 && $l === 3) { $us = (ord($data[0])<<16)|(ord($data[1])<<8)|ord($data[2]); $tempos[] = [$abs, $us]; continue; }
                if (!in_array($type, $types, true)) continue;
                $text = @mb_convert_encoding($data, 'UTF-8', 'UTF-8,ISO-8859-1'); $text = clean_text($text);
                if ($text === '') continue;
                if ($type === 0x01 && !$keepKarTags && str_starts_with($text, '@')) continue; // drop @-tags unless kept
                if ($type === 0x01 && stripos($text, 'KMIDI KARAOKE FILE') !== false) $isKAR = true;
                $events[] = ['tick'=>$abs, 'type'=>$type, 'text'=>$text];
            } elseif ($status === 0xF0 || $status === 0xF7) {
                $p++; $l = read_varlen($bin, $p, $trkEnd); $p += $l; // skip SysEx
            } else {
                if ($status < 0x80) { // running status
                    $data1 = $status; $status = $running; $hi = $status & 0xF0; if ($hi === 0xC0 || $hi === 0xD0) { /* no extra */ } else { $p += 1; }
                } else { $running = $status; $hi = $status & 0xF0; $p++; if ($hi === 0xC0 || $hi === 0xD0) { $p += 1; } else { $p += 2; } }
            }
        }
    }
    usort($events, fn($a,$b)=> $a['tick'] <=> $b['tick']);
    usort($tempos, fn($a,$b)=> $a[0] <=> $b[0]);
    return [$ppq, $tempos, $events, $isKAR];
}

function ticks_to_ms(int $tick, int $ppq, array $tempos): int {
    $ms = 0.0; $prevTick = 0; $prevUs = $tempos[0][1] ?? 500000;
    foreach ($tempos as $seg) { [$segTick,$segUs] = $seg; if ($segTick >= $tick) break; $ms += (($segTick-$prevTick)*$prevUs)/$ppq/1000.0; $prevTick=$segTick; $prevUs=$segUs; }
    $ms += (($tick-$prevTick)*$prevUs)/$ppq/1000.0; return (int)round($ms);
}

/* ---------- Controller ---------- */
$files = [];
if (is_dir(BASE_DIR)) { foreach (scandir(BASE_DIR) ?: [] as $f) { if ($f==='.'||$f==='..') continue; $ext=strtolower(pathinfo($f, PATHINFO_EXTENSION)); if (in_array($ext, ALLOWED, true) && is_file(BASE_DIR.'/'.$f)) $files[]=$f; } }
natcasesort($files); $files = array_values($files);

$sel = isset($_GET['file']) ? basename((string)$_GET['file']) : '';
$abs = ($sel!=='' ? BASE_DIR.'/'.$sel : '');
$incLyric = isset($_GET['lyr']) ? (bool)$_GET['lyr'] : true;   // FF05
$incText  = isset($_GET['txt']) ? (bool)$_GET['txt'] : true;   // FF01
$incMark  = isset($_GET['mrk']) ? (bool)$_GET['mrk'] : false;  // FF06
$incCue   = isset($_GET['cue']) ? (bool)$_GET['cue'] : false;  // FF07
$keepTags = isset($_GET['kar']) ? (bool)$_GET['kar'] : false;  // keep @-tags
$incMs    = isset($_GET['ms'])  ? (bool)$_GET['ms']  : false;  // include ms output
$format   = isset($_GET['format']) ? strtolower((string)$_GET['format']) : '';

$parsed = null; $rows=[]; $ppq=480; $isKAR=false; $tempos=[[0,500000]];
if ($sel!=='' && is_file($abs)) {
    $bin = @file_get_contents($abs);
    if ($bin!==false) {
        $types = [];
        if ($incLyric) $types[] = 0x05; if ($incText) $types[] = 0x01; if ($incMark) $types[] = 0x06; if ($incCue) $types[] = 0x07;
        [$ppq,$tempos,$events,$isKAR] = parse_midi_meta($bin, $types, $keepTags);
        foreach ($events as $ev) {
            $row = ['tick'=>$ev['tick'], 'type'=>sprintf('0x%02X', $ev['type']), 'text'=>$ev['text']];
            if ($incMs) $row['ms'] = ticks_to_ms((int)$ev['tick'], $ppq, $tempos);
            $rows[] = $row;
        }
        $parsed = true;
    }
}

okdir(OUT_DIR);
if ($format==='json' && $parsed && $sel!=='') { header('Content-Type: application/json'); echo json_encode(['file'=>$sel,'ppq'=>$ppq,'isKAR'=>$isKAR,'events'=>$rows], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT); exit; }
if ($format==='csv' && $parsed && $sel!=='') {
    header('Content-Type: text/csv'); header('Content-Disposition: attachment; filename="'.basename(pathinfo($sel, PATHINFO_FILENAME)).'_meta.csv"');
    $out=fopen('php://output','w'); $head=['tick']; if ($incMs) $head[]='ms'; $head[]='type'; $head[]='text'; fputcsv($out,$head);
    foreach ($rows as $r) { $line=[$r['tick']]; if ($incMs) $line[]=$r['ms'] ?? 0; $line[]=$r['type']; $line[]=$r['text']; fputcsv($out,$line); }
    fclose($out); exit;
}

$msg='';
if ($_SERVER['REQUEST_METHOD']==='POST' && $parsed && $sel!=='') {
    $action=$_POST['action'] ?? '';
    if ($action==='save_json') { $path=OUT_DIR.'/'.pathinfo($sel, PATHINFO_FILENAME).'_meta.json'; $ok=@file_put_contents($path, json_encode(['file'=>$sel,'ppq'=>$ppq,'isKAR'=>$isKAR,'events'=>$rows], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)); $msg=$ok===false?'Failed to save JSON.':'Saved: '.h($path); }
    elseif ($action==='save_csv') { $path=OUT_DIR.'/'.pathinfo($sel, PATHINFO_FILENAME).'_meta.csv'; $fh=@fopen($path,'w'); if($fh){ $head=['tick']; if($incMs)$head[]='ms'; $head[]='type'; $head[]='text'; fputcsv($fh,$head); foreach($rows as $r){ $line=[$r['tick']]; if($incMs)$line[]=$r['ms']??0; $line[]=$r['type']; $line[]=$r['text']; fputcsv($fh,$line);} fclose($fh); $msg='Saved: '.h($path);} else { $msg='Failed to save CSV.'; } }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MIDI Tick & Lyric/Text Extractor v1.1</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin:0; padding:16px; }
  .panel { border:1px solid #ccc; border-radius:8px; padding:12px; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:6px; border-bottom:1px solid #ddd; }
  .rowform { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .small { font-size:12px; color:#666; }
</style>
</head>
<body>
<h2>MIDI Tick & Lyric/Text Extractor v1.1</h2>
<div class="panel">
  <form method="get" action="" class="rowform">
    <label>File:</label>
    <select name="file" onchange="this.form.submit()">
      <option value="">-- choose --</option>
      <?php foreach ($files as $f): $selAttr=($f===$sel?' selected':''); ?>
        <option value="<?=h($f)?>"<?=$selAttr?>><?=h($f)?></option>
      <?php endforeach; ?>
    </select>
    <label><input type="checkbox" name="lyr" value="1" <?= $incLyric?'checked':''; ?>> FF 05 Lyric</label>
    <label><input type="checkbox" name="txt" value="1" <?= $incText?'checked':''; ?>> FF 01 Text</label>
    <label><input type="checkbox" name="mrk" value="1" <?= $incMark?'checked':''; ?>> FF 06 Marker</label>
    <label><input type="checkbox" name="cue" value="1" <?= $incCue?'checked':''; ?>> FF 07 Cue</label>
    <label><input type="checkbox" name="kar" value="1" <?= $keepTags?'checked':''; ?>> Keep @KAR tags</label>
    <label><input type="checkbox" name="ms"  value="1" <?= $incMs?'checked':''; ?>> Include ms</label>
    <button type="submit">Apply</button>
    <?php if ($sel!==''): ?>
      <a class="small" href="<?=h($_SERVER['PHP_SELF'].'?file='.rawurlencode($sel).'&lyr='.(int)$incLyric.'&txt='.(int)$incText.'&mrk='.(int)$incMark.'&cue='.(int)$incCue.'&kar='.(int)$keepTags.'&ms='.(int)$incMs.'&format=json')?>">Download JSON</a>
      <a class="small" href="<?=h($_SERVER['PHP_SELF'].'?file='.rawurlencode($sel).'&lyr='.(int)$incLyric.'&txt='.(int)$incText.'&mrk='.(int)$incMark.'&cue='.(int)$incCue.'&kar='.(int)$keepTags.'&ms='.(int)$incMs.'&format=csv')?>">Download CSV</a>
    <?php endif; ?>
  </form>
  <?php if ($sel!=='' && !$parsed): ?>
    <div class="small">Failed to load or parse file.</div>
  <?php endif; ?>
</div>

<?php if ($parsed): ?>
<div class="panel">
  <div><strong>Info</strong></div>
  <div class="small">File: <?=h($sel)?> · PPQ: <?=h((string)$ppq)?> · Tempo changes: <?=count($tempos)?> · Events: <?=count($rows)?> · Detected KAR header: <?= $isKAR?'Yes':'No' ?></div>
</div>

<div class="panel">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div><strong>Events (tick<?= $incMs? ' / ms':''; ?>, type, text)</strong></div>
    <div class="rowform">
      <form method="post" action="" class="rowform">
        <input type="hidden" name="action" value="save_json"><button type="submit">Save JSON</button>
      </form>
      <form method="post" action="" class="rowform">
        <input type="hidden" name="action" value="save_csv"><button type="submit">Save CSV</button>
      </form>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:120px;">Tick</th>
        <?php if ($incMs): ?><th style="width:120px;">ms</th><?php endif; ?>
        <th style="width:100px;">Type</th>
        <th>Text</th>
      </tr>
    </thead>
    <tbody>
      <?php if (empty($rows)): ?>
        <tr><td colspan="<?= $incMs? '4':'3' ?>" class="small">No events found for the selected meta types. Try enabling FF 01 Text (and Keep @KAR tags).</td></tr>
      <?php else: foreach ($rows as $r): ?>
        <tr>
          <td><?=h((string)$r['tick'])?></td>
          <?php if ($incMs): ?><td><?=h((string)($r['ms'] ?? 0))?></td><?php endif; ?>
          <td><?=h($r['type'])?></td>
          <td><?=h($r['text'])?></td>
        </tr>
      <?php endforeach; endif; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>

<?php if ($msg!==''): ?>
<div class="panel" style="background:#f8fff8;border-color:#bcd6bc;">✅ <?=h($msg)?></div>
<?php endif; ?>

</body>
</html>
