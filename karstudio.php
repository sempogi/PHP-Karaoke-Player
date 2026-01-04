<?php
/**
 * KAR Studio — FRESH BUILD v2.0 (Karakan-Only)
 * Date: 2025-10-24
 *
 * Clean, minimal, from-scratch build (no reused code):
 *  - Load MIDI/KAR from ./midi
 *  - Parse lyrics (FF 05 Lyric + FF 01 Text) and tempos
 *  - Karakan-style editing: STF input ([mm:ss.xx] or [tick]) + per-syllable tokens
 *  - Auto-detect & load (prefers FF05, falls back to FF01)
 *  - Embed edited lyrics back to MIDI/KAR (adds one Lyrics track; optional strip FF05)
 *
 * Notes:
 *  - Karakan-style = using hyphen '-' inside words for syllables; last syllable ends with space
 *    so players join syllables and keep word boundaries.
 *  - Soft Karaoke often stores lyrics in FF 01 Text meta events; Lyric meta is FF 05.
 */

declare(strict_types=1);
mb_internal_encoding('UTF-8');

/* ======================== CONFIG ======================== */
const MIDI_DIR   = __DIR__ . '/midi';       // input folder
const OUT_DIR    = MIDI_DIR . '/.lyrics';   // outputs
const ALLOWEDEXT = ['mid','midi','kar'];

/* ======================== HELPERS ======================== */
function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function okdir(string $d): void { if (!is_dir($d)) @mkdir($d, 0775, true); }

// Big endian helpers
function be16(int $v): string { return chr(($v>>8)&0xFF).chr($v&0xFF); }
function be32(int $v): string { return chr(($v>>24)&0xFF).chr(($v>>16)&0xFF).chr(($v>>8)&0xFF).chr($v&0xFF); }
function ru16(string $s, int $p): int { return (ord($s[$p])<<8)|ord($s[$p+1]); }
function ru32(string $s, int $p): int { return (ord($s[$p])<<24)|(ord($s[$p+1])<<16)|(ord($s[$p+2])<<8)|ord($s[$p+3]); }

// Variable length quantity
function read_varlen(string $s, int &$p, int $limit): int {
    $v=0; $c=0; while($p<$limit){ $b=ord($s[$p++]); $c++; $v=($v<<7)|($b&0x7F); if(($b&0x80)===0) break; if($c>5) break; } return $v;
}
function write_varlen(int $v): string { $a=[ $v & 0x7F ]; $v >>=7; while($v>0){ $a[] = ($v & 0x7F) | 0x80; $v >>=7; } $out=''; for($i=count($a)-1;$i>=0;$i--) $out .= chr($a[$i]); return $out; }

// Text cleaning: keep whitespace, remove control chars except tab/CR/LF
function clean_text(string $s): string { return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]+/u', ' ', $s) ?? $s; }
function to_iso8859(string $utf8): string { $b=@mb_convert_encoding($utf8,'ISO-8859-1','UTF-8'); return is_string($b)?$b:preg_replace('/[^\x20-\x7E]/','?',$utf8); }

/* ======================== MIDI SCAN ======================== */
function scan_midi_headers(string $bin): array {
    if (strlen($bin) < 14 || substr($bin,0,4)!=='MThd') return ['ok'=>false];
    $hdrLen = ru32($bin,4); if ($hdrLen < 6) $hdrLen = 6;
    $format = ru16($bin,8); $tracks = ru16($bin,10); $division = ru16($bin,12);
    $ppq = ($division & 0x8000) ? 480 : $division; // nominal PPQ for UI only
    $pos = 8 + $hdrLen; $idx=[]; $len=strlen($bin);
    for ($t=0;$t<$tracks && $pos+8<=$len;$t++){
        if (substr($bin,$pos,4)!=='MTrk') break; $tl = ru32($bin,$pos+4);
        $idx[] = ['chunk'=>$pos, 'start'=>$pos+8, 'end'=>$pos+8+$tl, 'len'=>$tl];
        $pos += 8 + $tl;
    }
    return ['ok'=>true,'format'=>$format,'tracks'=>count($idx),'division'=>$division,'ppq'=>$ppq,'tracksIndex'=>$idx];
}

function parse_tempos_and_events(string $bin, array $tracksIndex, bool $needEvents, array $eventTypes, bool $keepKarTags): array {
    $tempos = [[0,500000]]; // [tick, microseconds per quarter]
    $events = [];
    foreach ($tracksIndex as $ti){
        $p=$ti['start']; $limit=$ti['end']; $abs=0; $running=0;
        while ($p<$limit){
            $delta = read_varlen($bin,$p,$limit); $abs += $delta; if($p>=$limit) break;
            $status = ord($bin[$p]);
            if ($status===0xFF){
                $p++; if($p>=$limit) break; $type=ord($bin[$p++]); $l = read_varlen($bin,$p,$limit); $data = substr($bin,$p,$l); $p+=$l;
                if ($type===0x51 && $l===3){ $us=(ord($data[0])<<16)|(ord($data[1])<<8)|ord($data[2]); $tempos[] = [$abs,$us]; continue; }
                if ($needEvents && in_array($type,$eventTypes,true)){
                    $txt = clean_text(@mb_convert_encoding($data,'UTF-8','UTF-8,ISO-8859-1'));
                    if ($type===0x01 && !$keepKarTags && isset($txt[0]) && $txt[0]==='@') continue; // drop @ tags if requested
                    $events[] = ['tick'=>$abs,'type'=>$type,'text'=>$txt];
                }
            } elseif ($status===0xF0 || $status===0xF7){
                $p++; $l = read_varlen($bin,$p,$limit); $p += $l;
            } else {
                // MIDI event with running status support
                if ($status < 0x80){
                    $d1 = $status; $status=$running; $hi=$status & 0xF0; if ($hi===0xC0 || $hi===0xD0){ /* one data */ } else { $p += 1; }
                } else { $running=$status; $hi=$status & 0xF0; $p++; if ($hi===0xC0 || $hi===0xD0){ $p+=1; } else { $p+=2; } }
            }
        }
    }
    usort($tempos, fn($a,$b)=> $a[0] <=> $b[0]);
    if (empty($tempos) || $tempos[0][0]!==0) array_unshift($tempos,[0,500000]);
    if ($needEvents) usort($events, fn($a,$b)=> $a['tick'] <=> $b['tick']);
    return ['tempos'=>$tempos,'events'=>$events];
}

function is_smpte(int $division): bool { return ($division & 0x8000)!==0; }
function ticks_to_ms(int $tick, int $ppq, array $tempos, int $division): int {
    if (is_smpte($division)){
        $fpsb=($division>>8)&0xFF; $fps=256-$fpsb; $tpf=$division & 0xFF; if($fps<=0||$tpf<=0) return 0; return (int)round(($tick*1000.0)/($fps*$tpf));
    }
    $ms=0.0; $pt=0; $pus=$tempos[0][1]; foreach($tempos as [$t,$us]){ if($t>=$tick) break; $ms += (($t-$pt)*$pus)/$ppq/1000.0; $pt=$t; $pus=$us; } $ms += (($tick-$pt)*$pus)/$ppq/1000.0; return (int)round($ms);
}
function ms_to_ticks(int $ms, int $ppq, array $tempos, int $division): int {
    if (is_smpte($division)){ $fpsb=($division>>8)&0xFF; $fps=256-$fpsb; $tpf=$division&0xFF; if($fps<=0||$tpf<=0) return 0; return (int)round(($ms*$fps*$tpf)/1000.0); }
    $msd=0.0; $pt=0; $pus=$tempos[0][1]; $n=count($tempos); for($i=1;$i<$n;$i++){ $t=$tempos[$i][0]; $segms=(($t-$pt)*$pus)/$ppq/1000.0; if($msd+$segms >= $ms){ $off=$ms-$msd; $ticks=(int)round(($off*1000.0*$ppq)/$pus); return $pt+$ticks; } $msd+=$segms; $pt=$t; $pus=$tempos[$i][1]; } $ticks=(int)round((($ms-$msd)*1000.0*$ppq)/$pus); return $pt+$ticks;
}

/* ======================== KARAKAN HELPERS ======================== */
function karakan_split_word(string $word): array { // 'wa-n-na' => ['wa-','n-','na ']
    $parts = preg_split('/-+/', $word); $out=[]; $n=count($parts);
    for($i=0;$i<$n;$i++){ $seg=$parts[$i]; if($seg==='') continue; $out[] = ($i<$n-1) ? ($seg.'-') : ($seg.' '); }
    return $out;
}

function stf_to_tokens(string $stf, int $ppq, array $tempos, int $division, int $gap, bool $isMs): array {
    $stf=str_replace("\r","",$stf); $rows=explode("\n",$stf); $tokens=[];
    foreach($rows as $row){ $row=trim($row); if($row==='') continue; $tick=null; $text='';
        if($isMs){ if(preg_match('/^\[(\d{1,2}):(\d{2})[.:](\d{2})\]\s*(.+)$/',$row,$m)){ $ms=((int)$m[1])*60000 + ((int)$m[2])*1000 + ((int)$m[3])*10; $text=$m[4]; $tick=ms_to_ticks($ms,$ppq,$tempos,$division); } }
        else { if(preg_match('/^\[(\d+)\]\s*(.+)$/',$row,$m)){ $tick=(int)$m[1]; $text=$m[2]; } }
        if($tick===null) continue;
        $cur=$tick; foreach(preg_split('/\s+/', $text) as $tok){ if($tok==='') continue; if(strpos($tok,'-')!==false){ foreach(karakan_split_word($tok) as $seg){ $tokens[]=['tick'=>$cur,'text'=>$seg]; $cur+=$gap; } } else { $tokens[]=['tick'=>$cur,'text'=>$tok.' ']; $cur+=$gap; } }
    }
    return $tokens;
}

/* ======================== BUILD LYRICS TRACK ======================== */
function build_lyrics_track(array $tokens): string {
    $prev=0; $body='';
    // Track name "Lyrics"
    $body .= write_varlen(0)."\xFF\x03".write_varlen(6).'Lyrics';
    foreach($tokens as $t){ $tick=max(0,(int)($t['tick']??0)); $txt=(string)($t['text']??''); if($txt==='') continue; $delta=$tick-$prev; if($delta<0) $delta=0; $prev=$tick; $raw=to_iso8859($txt); $body .= write_varlen($delta)."\xFF\x05".write_varlen(strlen($raw)).$raw; }
    $body .= write_varlen(0)."\xFF\x2F\x00"; return 'MTrk'.be32(strlen($body)).$body;
}

function strip_ff05_from_track(string $chunk): string {
    if(substr($chunk,0,4)!=='MTrk') return $chunk; $len=ru32($chunk,4); $data=substr($chunk,8,$len);
    $p=0; $limit=strlen($data); $out=''; $carry=0; $run=0;
    while($p<$limit){ $delta=read_varlen($data,$p,$limit); if($p>=$limit) break; $status=ord($data[$p]);
        if($status===0xFF){ $p++; $type=ord($data[$p++]); $l=read_varlen($data,$p,$limit); $evt=substr($data,$p,$l); $p+=$l; $new=$carry+$delta; $carry=0; if($type===0x2F){ $carry += $new; continue; } if($type===0x05){ $carry = $new; continue; } $out .= write_varlen($new)."\xFF".chr($type).write_varlen(strlen($evt)).$evt; }
        elseif($status===0xF0 || $status===0xF7){ $p++; $l=read_varlen($data,$p,$limit); $evt=substr($data,$p,$l); $p+=$l; $new=$carry+$delta; $carry=0; $out .= write_varlen($new).chr($status).write_varlen(strlen($evt)).$evt; }
        else { if($status<0x80){ $d1=$status; $status=$run; $hi=$status&0xF0; if($hi===0xC0 || $hi===0xD0){ $bytes=chr($status).chr($d1); } else { $d2=ord($data[$p++]); $bytes=chr($status).chr($d1).chr($d2); } } else { $run=$status; $hi=$status&0xF0; $p++; if($hi===0xC0 || $hi===0xD0){ $d1=ord($data[$p++]); $bytes=chr($status).chr($d1); } else { $d1=ord($data[$p++]); $d2=ord($data[$p++]); $bytes=chr($status).chr($d1).chr($d2); } } $new=$carry+$delta; $carry=0; $out .= write_varlen($new).$bytes; }
    }
    $out .= write_varlen($carry)."\xFF\x2F\x00"; return 'MTrk'.be32(strlen($out)).$out;
}

/* ======================== FILE LIST ======================== */
okdir(OUT_DIR);
$files=[]; if(is_dir(MIDI_DIR)){ foreach(scandir(MIDI_DIR)?:[] as $f){ if($f==='.'||$f==='..') continue; $ext=strtolower(pathinfo($f,PATHINFO_EXTENSION)); if(in_array($ext,ALLOWEDEXT,true) && is_file(MIDI_DIR.'/'.$f)) $files[]=$f; } }
sort($files, SORT_NATURAL|SORT_FLAG_CASE);

/* ======================== STATE ======================== */
$sel = isset($_GET['file']) ? basename((string)$_GET['file']) : '';
$abs = ($sel!=='')? MIDI_DIR.'/'.$sel : '';
$includeFF05 = isset($_GET['lyr']) ? (bool)$_GET['lyr'] : true;  // FF05: default ON
$includeFF01 = isset($_GET['txt']) ? (bool)$_GET['txt'] : true;  // FF01: default ON
$keepAtTags  = isset($_GET['keep'])? (bool)$_GET['keep']: false; // keep @K tags
$useMs       = isset($_GET['ms'])  ? (bool)$_GET['ms']  : true;  // show ms

$ppq=480; $division=480; $parsed=false; $tempos=[[0,500000]]; $events=[]; $msg='';
$tokens=[]; // our Karakan tokens

if ($sel!=='' && is_file($abs)){
    $bin=@file_get_contents($abs); if($bin!==false){ $hdr=scan_midi_headers($bin); if(!empty($hdr['ok'])){ $ppq=$hdr['ppq']; $division=$hdr['division']; $parsed=true; $types=[]; if($includeFF05)$types[] = 0x05; if($includeFF01)$types[]=0x01; $res = parse_tempos_and_events($bin,$hdr['tracksIndex'], true, $types, $keepAtTags); $tempos=$res['tempos']; $events=$res['events']; } }
}

/* ======================== POST HANDLERS ======================== */
if($_SERVER['REQUEST_METHOD']==='POST' && $abs!==''){
    $action = $_POST['action'] ?? '';

    // capture tokens table
    if(isset($_POST['wtick'],$_POST['wtext'])){
        $nt=[]; $n=min(count($_POST['wtick']), count($_POST['wtext']));
        for($i=0;$i<$n;$i++){ $tt=(int)$_POST['wtick'][$i]; $tx=(string)$_POST['wtext'][$i]; if($tx!=='') $nt[]=['tick'=>$tt,'text'=>$tx]; }
        usort($nt, fn($a,$b)=>$a['tick']<=>$b['tick']); if($action!=='clear_tokens') $tokens=$nt;
    }

    if($action==='auto_load'){
        // prefer FF05 then FF01
        $bin=@file_get_contents($abs); $hdr=scan_midi_headers($bin); $scan=parse_tempos_and_events($bin,$hdr['tracksIndex'], true, [0x05,0x01], true);
        $ff05 = array_values(array_filter($scan['events'], fn($e)=>$e['type']===0x05));
        $ff01 = array_values(array_filter($scan['events'], fn($e)=>$e['type']===0x01));
        $pick = !empty($ff05)? $ff05 : $ff01;
        $gap = max(1,(int)($_POST['gap']??15)); $tokens=[]; $c05=count($ff05); $c01=count($ff01);
        foreach($pick as $e){ $cur=$e['tick']; foreach(preg_split('/\s+/', $e['text']) as $w){ if($w==='') continue; if(strpos($w,'-')!==false){ foreach(karakan_split_word($w) as $seg){ $tokens[]=['tick'=>$cur,'text'=>$seg]; $cur+=$gap; } } else { $tokens[]=['tick'=>$cur,'text'=>$w.' ']; $cur+=$gap; } } }
        $msg = 'Auto-load ok. Chosen='.(!empty($ff05)?'FF05':'FF01').', tokens='.count($tokens).', FF05='.$c05.', FF01='.$c01.'.';
    }
    elseif($action==='stf_load'){
        $gap=max(1,(int)($_POST['gap']??15)); $isMs = !empty($_POST['is_ms']); $stf=(string)($_POST['stf']??'');
        $tokens = stf_to_tokens($stf,$ppq,$tempos,$division,$gap,$isMs);
        $msg = 'Loaded from STF: '.count($tokens).' tokens.';
    }
    elseif($action==='clear_tokens'){ $tokens=[]; $msg='Tokens cleared.'; }
    elseif($action==='save_json'){
        $path=OUT_DIR.'/'.$sel.'.json'; @file_put_contents($path, json_encode(['ppq'=>$ppq,'tokens'=>$tokens], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)); $msg='Saved: '.$path;
    }
    elseif($action==='export_lrc'){
        $lines=[]; foreach($tokens as $t){ $ms= $useMs? ticks_to_ms((int)$t['tick'],$ppq,$tempos,$division) : 0; $tag = $useMs? sprintf('[%02d:%02d.%02d]', intdiv($ms,60000), intdiv($ms%60000,1000), intdiv($ms%1000,10)) : '[00:00.00]'; $lines[] = $tag.' '.$t['text']; }
        $path=OUT_DIR.'/'.pathinfo($sel,PATHINFO_FILENAME).'.ext.lrc'; @file_put_contents($path, implode("\n",$lines)."\n"); $msg='Exported LRC: '.$path;
    }
    elseif($action==='embed'){
        $strip = !empty($_POST['strip']); $forceKar = !empty($_POST['force_kar']);
        $bin=@file_get_contents($abs); $hdr=scan_midi_headers($bin); $chunks='';
        foreach($hdr['tracksIndex'] as $ti){ $chunk=substr($bin,$ti['chunk'], 8 + $ti['len']); $chunks .= ($strip? strip_ff05_from_track($chunk) : $chunk); }
        $hdrOut = 'MThd'.be32(6).be16(1).be16(count($hdr['tracksIndex'])+1).be16($hdr['division']);
        $lyrTrk = build_lyrics_track($tokens);
        $out = $hdrOut.$chunks.$lyrTrk; $base=pathinfo($sel,PATHINFO_FILENAME); $ext=$forceKar?'kar':(strtolower(pathinfo($sel,PATHINFO_EXTENSION))==='mid'?'mid':'kar'); $outPath=OUT_DIR.'/'.$base.'_lyrics.'.$ext; $ok=@file_put_contents($outPath,$out); $msg = ($ok===false)?'Failed to write.':'Embedded: '.$outPath.($strip?' (stripped existing FF05)':'');
    }
}

/* ======================== UI ======================== */
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>KAR Studio — FRESH BUILD v2.0 (Karakan-Only)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{ --bg:#101216; --panel:#171b21; --border:#2a2f39; --text:#e7eaf0; --muted:#98a2b3; --accent:#54a8ff; }
body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:var(--bg); color:var(--text); }
header{ position:sticky; top:0; background:linear-gradient(0deg, #151922, #1c2230); border-bottom:1px solid var(--border); padding:12px 16px; z-index:10; }
.h{ margin:0 0 6px 0; font-size:18px; }
.wrap{ padding:16px; }
.panel{ background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin:0 0 12px 0; }
.row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
input, select, textarea, button{ background:#0f1217; color:var(--text); border:1px solid var(--border); border-radius:8px; padding:8px 10px; font-size:15px; }
select{ min-width:200px; }
textarea{ width:100%; min-height:120px; resize:vertical; }
button.primary{ background:var(--accent); color:#041527; border:0; }
.small{ color:var(--muted); font-size:12px; }
table{ width:100%; border-collapse:separate; border-spacing:0; }
th,td{ border-bottom:1px solid var(--border); padding:6px; }
</style>
</head>
<body>
<header>
  <div class="row" style="justify-content:space-between">
    <div>
      <div class="h">KAR Studio — FRESH BUILD v2.0 (Karakan-Only)</div>
      <div class="small">Karakan STF input · Auto-detect (FF05/FF01) · Clean embed</div>
    </div>
    <form method="get" action="" class="row">
      <label>File
        <select name="file" onchange="this.form.submit()">
          <option value="">-- choose --</option>
          <?php foreach($files as $f): $selAttr=($f===$sel?' selected':''); ?>
            <option value="<?=e($f)?>"<?=$selAttr?>><?=e($f)?></option>
          <?php endforeach; ?>
        </select>
      </label>
      <label><input type="checkbox" name="lyr" value="1" <?= $includeFF05?'checked':''; ?>> FF05</label>
      <label><input type="checkbox" name="txt" value="1" <?= $includeFF01?'checked':''; ?>> FF01</label>
      <label><input type="checkbox" name="keep" value="1" <?= $keepAtTags?'checked':''; ?>> Keep @K tags</label>
      <label><input type="checkbox" name="ms" value="1" <?= $useMs?'checked':''; ?>> ms</label>
      <button type="submit" class="primary">Apply</button>
    </form>
  </div>
</header>
<div class="wrap">

<?php if($sel!=='' && !$parsed): ?>
  <div class="panel small">Could not parse MIDI/KAR.</div>
<?php endif; ?>

<?php if($parsed): ?>
  <div class="panel">
    <div><strong>Info</strong></div>
    <div class="small">File: <?=e($sel)?> · Tracks: <?=e((string)($hdr['tracks']??'?'))?> · PPQ (nominal): <?=e((string)$ppq)?> · Division: <?=e((string)$division)?></div>
  </div>

  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="auto_load">
    <div class="row" style="justify-content:space-between">
      <div><strong>Auto-detect & Load (FF05 → FF01)</strong></div>
      <div class="row">
        <label>Gap (ticks): <input type="number" name="gap" value="15" min="1" style="width:120px"></label>
        <button type="submit">Auto-load</button>
      </div>
    </div>
    <div class="small">Scans both lyric meta (FF05) and text meta (FF01). Picks FF05 if available, else FF01. Hyphen (<code>-</code>) splits syllables; last syllable gains a space.</div>
  </form>

  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="stf_load">
    <div class="row" style="justify-content:space-between">
      <div><strong>Karakan Text Editor (STF)</strong></div>
      <div class="row">
        <label><input type="checkbox" name="is_ms" value="1" checked> [mm:ss.xx]</label>
        <label>Gap (ticks): <input type="number" name="gap" value="15" min="1" style="width:120px"></label>
        <button type="submit" class="primary">Load STF → Tokens</button>
      </div>
    </div>
    <div class="small">Examples:<br>[00:12.34] I wa-n-na love i-s.<br>[960] You are beau-ti-ful</div>
    <textarea name="stf" placeholder="One line per entry"></textarea>
  </form>

  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="save_json">
    <div class="row" style="justify-content:space-between">
      <div><strong>Tokens (per syllable/word)</strong></div>
      <div class="row">
        <button type="submit">Save JSON</button>
        <button type="submit" formaction="" formmethod="post" name="action" value="export_lrc">Export Extended LRC</button>
        <button type="submit" formaction="" formmethod="post" name="action" value="clear_tokens">Clear</button>
      </div>
    </div>
    <table>
      <thead><tr><th style="width:160px">Tick</th><th>Text</th></tr></thead>
      <tbody>
        <?php if(empty($tokens)): ?>
          <tr><td colspan="2" class="small">No tokens yet. Use Auto-load or STF above.</td></tr>
        <?php endif; ?>
        <?php foreach($tokens as $t): ?>
          <tr>
            <td><input type="number" name="wtick[]" value="<?=e((string)$t['tick'])?>" min="0"></td>
            <td><input type="text" name="wtext[]" value="<?=e($t['text'])?>"></td>
          </tr>
        <?php endforeach; ?>
        <tr>
          <td><input type="number" name="wtick[]" value="" min="0" placeholder="tick"></td>
          <td><input type="text" name="wtext[]" value="" placeholder="Type token"></td>
        </tr>
      </tbody>
    </table>
  </form>

  <form method="post" action="" class="panel">
    <input type="hidden" name="action" value="embed">
    <div class="row" style="justify-content:space-between">
      <div><strong>Embed to KAR/MID</strong></div>
      <div class="row">
        <label><input type="checkbox" name="strip" value="1"> Strip existing FF05 from original tracks</label>
        <label><input type="checkbox" name="force_kar" value="1"> Force .kar</label>
        <button type="submit" class="primary">Export</button>
      </div>
    </div>
  </form>
<?php endif; ?>

<?php if($msg!==''): ?>
  <div class="panel" style="background:#0f1a12; border-color:#194d30;">✅ <?=e($msg)?></div>
<?php endif; ?>

</div>
</body>
</html>
