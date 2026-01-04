<?php
session_start();
// --- BEGIN: Config-driven MIDI root ---
$configFile = __DIR__ . '/config.json';

$midiRoot   = 'midi'; // fallback
if (is_file($configFile)) {
    $cfg = json_decode(file_get_contents($configFile), true);
    if (isset($cfg['midi_root']) && is_dir($cfg['midi_root'])) {
        $midiRoot = $cfg['midi_root'];
    }
}

$SF_DIR     = 'soundfonts';
$MIDI_DIR   = $midiRoot; // now configurable
$BG_IMG_DIR = 'background';
$BG_VID_DIR = 'background_video';
$FONT_DIR   = 'fonts';
// --- END: Config-driven MIDI root ---



// --- Program version (sync your <title> if you change this) ---
$APP_VERSION = '6.7.6g+';

// --- Server info for Info window ---
$SERVER_INFO = [
  'php_version'        => PHP_VERSION,
  'server_software'    => $_SERVER['SERVER_SOFTWARE'] ?? '',
  'document_root'      => $_SERVER['DOCUMENT_ROOT'] ?? '',
  'script'             => $_SERVER['SCRIPT_NAME'] ?? '',
  'upload_max_filesize'=> ini_get('upload_max_filesize'),
  'post_max_size'      => ini_get('post_max_size'),
  'memory_limit'       => ini_get('memory_limit'),
  'max_execution_time' => ini_get('max_execution_time'),
  'os'                 => PHP_OS,
  'timezone'           => @date_default_timezone_get(),
];



function list_sf($b){$o=[];if(!is_dir($b))return $o;$br=realpath($b);if($br===false)return $o;$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($b,FilesystemIterator::SKIP_DOTS));foreach($it as $f){if($f->isDir())continue;$e=strtolower(pathinfo($f->getFilename(),PATHINFO_EXTENSION));if(!in_array($e,['sf2','sf3']))continue;$r=realpath($f->getPathname());if($r===false)continue;$rel=str_replace('\\','/',substr($r,strlen($br)+1));$o[]=['name'=>$f->getFilename(),'rel'=>$rel,'path'=>rtrim($b,'/').'/'.$rel,'size'=>@filesize($r)];}usort($o,function($a,$b){return strcasecmp($a['name'],$b['name']);});return $o;}
function list_files($b,$ext){$o=[];if(!is_dir($b))return $o;$br=realpath($b);if($br===false)return $o;$st=[$b];while(!empty($st)){$d=array_pop($st);$it=@scandir($d);if($it===false)continue;foreach($it as $n){if($n==='.'||$n==='..')continue;$p=$d.DIRECTORY_SEPARATOR.$n;if(is_dir($p)){$st[]=$p;continue;}$e=strtolower(pathinfo($n,PATHINFO_EXTENSION));if(!in_array($e,$ext))continue;$r=realpath($p);if($r===false)continue;$rel=str_replace('\\','/',substr($r,strlen($br)+1));$o[]=['name'=>$n,'rel'=>$rel,'path'=>rtrim($b,'/').'/'.$rel,'size'=>@filesize($r)];}}usort($o,function($a,$b){return strcasecmp($a['name'],$b['name']);});return $o;}

$sfList=list_sf($SF_DIR); 
$midiList=list_files($MIDI_DIR,['mid','midi','kar']);
$bgImages=list_files($BG_IMG_DIR,['jpg','jpeg','png','gif','webp','bmp']);
$bgVideos=list_files($BG_VID_DIR,['mp4','webm','ogv']);
$fontList=list_files($FONT_DIR,['ttf','otf','woff','woff2']); // NEW: scan fonts
?>
<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>KaraokeHD Player v6.7.6g+</title>

<style>
:root{--bg:#0b0b0b;--fg:#e7e7e7;--muted:#9aa0a6;--panel:#151515;--line:#1e1e1e;--accent:#4fd1ff;--hl:#7ef9a7;--tickH:30px;--vizH:160px;--gapH:2px}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;padding-bottom:calc(var(--tickH) + var(--vizH) + var(--gapH) + 8px)}

/* Background stage */
.bg-stage{position:fixed;inset:0;z-index:0;overflow:hidden;background:#000}
.bg-stage .layer{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .6s ease}
.bg-stage video,.bg-stage img{object-fit:cover;width:100%;height:100%}
.bg-stage .on{opacity:1}

/* App layer */
header, main { position: relative; z-index: 2; }

header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;background:transparent;border-bottom:1px solid rgba(255,255,255,.08)}
header h3{margin:0 8px 0 0;font-weight:650}

button{background:transparent;color:var(--fg);border:1px solid transparent;padding:6px 10px;border-radius:8px}
/* Anchor button to match existing <button> style */
a.btn {
  background: transparent;
  color: var(--fg);
  border: 1px solid rgba(255,255,255,.15);
  padding: 6px 10px;
  border-radius: 8px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
a.btn:hover { background: rgba(255,255,255,.06); }
a.btn.small { padding: 4px 8px; font-size: 12px; } /* optional small variant */


button.small{padding:4px 8px;font-size:12px}
button:disabled{opacity:.55}
select{background:transparent;color:var(--fg);border:1px solid rgba(255,255,255,.15);padding:6px 10px;border-radius:8px}
button:hover{background:rgba(255,255,255,.06)}

/* Optional compact header cleanup */
body.compact-header header .small,
body.compact-header header label,
body.compact-header header #time,
body.compact-header header #status,
body.compact-header header #nowPlaying,
body.compact-header header #showBrowser,
body.compact-header header #showQueue,
body.compact-header header #showLyrics,
body.compact-header header #showBG,
body.compact-header header #fsToggle,
body.compact-header header #startBtn,
body.compact-header header #stopBtn,
body.compact-header header #resumeBtn{ display:none !important; }

main{padding:10px;display:grid;gap:10px}
.panel{background:rgba(21,21,21,.55);border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.panel h4{margin:0;padding:10px 12px;background:rgba(17,17,17,.65);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between}
.list{flex:1;overflow:auto}
.row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
.row a{color:#bcd;text-decoration:none;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row a:hover{text-decoration:underline}
.small{font:12px/1.3 monospace;color:var(--muted)}
.note{color:#9aa0a6;font:12px/1.2 system-ui}
.label{min-width:84px;color:#b7c3cf}

/* Visualizer fixed above ticker */
.visual{position:fixed;left:0;right:0;bottom:calc(var(--tickH) + var(--gapH));height:var(--vizH);background:transparent;border:none;border-radius:0;overflow:hidden}
.visual canvas{display:block;width:100%;height:100%;background:transparent}

/* Ticker */
.ticker{position:fixed;left:0;right:0;bottom:0;z-index:3;border-top:1px solid #222;background:#0f151a;height:var(--tickH);display:flex;align-items:center;overflow:hidden;padding:0 6px}
.ticker-track{display:inline-block;white-space:nowrap;will-change:transform}
.ticker-item{display:inline-flex;align-items:center;gap:6px;padding:0 12px;color:#cbd}
.ticker-item.playing{ color:var(--hl); background:color-mix(in srgb, var(--hl) 14%, transparent); border:1px solid color-mix(in srgb, var(--hl) 45%, transparent); border-radius:999px; padding:2px 12px }
.ticker-item.next{ color:#bfe5ff; background:rgba(79,209,255,.14); border:1px solid rgba(79,209,255,.4); border-radius:999px; padding:2px 12px }
.separator{opacity:.4;margin:0 8px}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* Windows */
.win{position:fixed;z-index:300;width:420px;max-width:92vw;max-height:60vh;display:none}
.win.visible{display:block}
.win .list{max-height:calc(60vh - 48px)}
#browserPanel.win{left:16px;top:120px}
#queuePanel.win{right:16px;top:120px}
#bgPanel.win{left:16px;top:16px}
#ccPanel.win{right:16px;top:16px}
.drag{cursor:move}
.win .close{background:#222;color:#ccc;border:1px solid #333;padding:2px 8px;border-radius:6px}

/* Floating Lyrics */
.fly{position:fixed;z-index:50;left:10vw;top:12vh;width:min(860px,92vw);max-width:92vw;max-height:70vh;background:rgba(0,0,0,.78);border:0;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.5);backdrop-filter:blur(var(--blur,8px));display:none;flex-direction:column;overflow:hidden;min-width:280px;min-height:160px}
.fly.visible{display:flex}
.fly-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #333;cursor:move;font-weight:600;transition:opacity .25s ease,transform .25s ease}
.fly-title{display:flex;align-items:center;gap:8px}
.fly-tools{display:flex;align-items:center;gap:6px}
.fly-tools button{background:#222;border:1px solid #444;color:#ddd;border-radius:6px;padding:2px 8px}
.fly-tools button.active{background:#26313b;border-color:#4a6a86}
.fly-close{background:#2a2a2a;border:1px solid #444;color:#ddd;border-radius:8px;padding:2px 8px}
.fly-body{padding:10px 12px;overflow:auto;flex:1 1 auto}
.fly-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-top:1px solid #333;background:#0f1011;transition:opacity .25s ease,transform .25s ease}
.foot-left,.foot-right{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.fly-foot .small{opacity:.85}
.fly-foot button{background:#222;border:1px solid #444;color:#ddd;border-radius:6px;padding:2px 8px}
.fly-foot input[type=range]{width:120px}
.fly.chrome-hidden .fly-head{opacity:0;transform:translateY(-8px);pointer-events:none}
.fly.chrome-hidden .fly-foot{opacity:0;transform:translateY(8px);pointer-events:none}

/* Preset chips for highlight color */
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid #444;border-radius:999px;padding:3px 8px;font-size:12px;background:#1f1f1f;color:#cfd3d8;cursor:pointer}
.chip.active{outline:2px solid var(--hl)}

/* Karaoke text */
.lv{display:flex;flex-direction:column;gap:6px}
.lv .line{white-space:pre-wrap}
.lv .prev{opacity:.1;font-size:calc(var(--fs,1)*0.95em)}
.lv .act{font-size:calc(var(--fs,1)*1.18em);font-weight:700}
.lv .next{opacity:.95;font-size:calc(var(--fs,1)*1.00em)}
.lv .w{white-space:pre-wrap;padding:0}
.lv .w.on{color:var(--hl)}

#playlist a.song.now{color:var(--hl);font-weight:700;text-decoration:underline}
#lyFull .line{padding:2px 0}
#lyFull .line.active{color:var(--hl);font-weight:700}


/* === Highlight Pulse (minimal, crisp, no fades) === */

/* Tunables (optional) */
#lyWin {
  --hlPulseScale: 1.08;  /* how big the "pop" gets (1.00–1.12 is safe) */
  --hlPulseMs: 240ms;    /* pulse duration */
}

/* Keep transforms anchored near the baseline to avoid jitter */
.lv .w {
  transform-origin: 50% 80%;
  backface-visibility: hidden;
}

/* Pulse keyframes: quick pop and settle back to 1 */
@keyframes lyPulseHL {
  0%   { transform: scale(1); }
  55%  { transform: scale(var(--hlPulseScale)); }
  100% { transform: scale(1); }
}

/* Fire the pulse when a word becomes active.
   We scope it to .glow so your Glow toggle controls the effect too. */
#lyBody.glow .w.on {
  animation: lyPulseHL var(--hlPulseMs) ease-out;
  /* Keep your existing glow */
  /* text-shadow from your current CSS remains active */
}

/* Accessibility: respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  #lyBody.glow .w.on { animation: none !important; }
}
/* SF Toast */
.toast{position:fixed;right:12px;top:12px;z-index:60;display:none;max-width:min(92vw,420px);background:rgba(14,17,22,.92);border:1px solid #2a3a4a;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.5);color:#dfe8f3}
.toast.visible{display:flex}
.toast .t-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.toast .t-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.toast .t-title{font-weight:700;color:#bfe5ff}
.toast .btn{background:#1b2633;border:1px solid #3a5166;color:#dfe8f3;border-radius:8px;padding:4px 10px}
.toast .btn:hover{filter:brightness(1.1)}
.toast .t-muted{color:#a7bacb;font:12px/1.2 system-ui}
.toast .t-actions{display:flex;gap:8px;flex-wrap:wrap}
.toast .t-check{display:flex;align-items:center;gap:6px}

/* Spinner overlay */
#spinner{position:fixed;inset:0;display:none;z-index:100;align-items:center;justify-content:center;background:rgba(0,0,0,.35);backdrop-filter:blur(1px)}
#spinner .ring{width:32px;height:32px;border:3px solid rgba(255,255,255,.25);border-top-color:var(--hl);border-radius:50%;animation:spin .9s linear infinite}
#spinner .txt{margin-left:10px;color:#cfe7ff;font-weight:600}
@keyframes spin{to{transform:rotate(360deg)}}

@media (max-width:700px){
  .win{left:0!important;right:0!important;width:auto;max-width:100vw;border-radius:12px 12px 0 0;bottom:0;top:auto;max-height:70vh}
  .drag{cursor:default}
  .fly{left:0!important;right:0!important;top:auto;bottom:0;width:auto;max-width:100vw;border-radius:12px 12px 0 0;max-height:70vh}
}

/* Allow free-floating/resizable lyrics on small screens once the user resizes it */
@media (max-width:700px){
  .fly.free{
    left:auto!important; right:auto!important; top:auto!important; bottom:auto!important;
    width:auto!important; max-width:92vw!important; border-radius:12px!important;
  }
}

.win,.fly{box-shadow:0 16px 40px rgba(0,0,0,.45)}
.win .drag,.fly .fly-head{user-select:none}
.win.maximized,.fly.maximized{left:0!important;top:0!important;width:100vw!important;height:100vh!important;right:auto!important;bottom:auto!important;border-radius:0!important}
.win.minimized,.fly.minimized{height:auto!important;max-height:none!important;overflow:visible!important}
.wm-grip{position:absolute;right:4px;bottom:4px;width:14px;height:14px;cursor:nwse-resize;opacity:.7;background:linear-gradient(135deg,rgba(255,255,255,.0) 0 50%,rgba(255,255,255,.25) 50 100%),linear-gradient(135deg,rgba(255,255,255,.0) 0 70%,rgba(255,255,255,.2) 70 100%);border-radius:3px}
.win .drag:hover,.fly .fly-head:hover{background:rgba(255,255,255,.03)}
.wm-chrome{display:flex;gap:6px;align-items:center}
.wm-btn{background:#232323;color:#ddd;border:1px solid #3a3a3a;padding:2px 8px;border-radius:6px;font-size:12px}
.wm-btn:hover{filter:brightness(1.15)}


/* Lyrics outline */
#lyTri .line, #lyTri .w,
#lyFull .line, #lyFull .w{
  -webkit-text-stroke: 0.02px #000;
  text-shadow: 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
}

/* Browser searchbar styles */
#browserPanel .searchbar{position: sticky; top: 0; z-index: 3; background: rgba(17,17,17,.85); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,.06)}
#browserPanel input.search{flex: 1; background: #101417; color: var(--fg); border: 1px solid rgba(255,255,255,.15); padding: 6px 10px; border-radius: 8px; outline: none}
#browserPanel input.search::placeholder{ color: #8ea0b3 }
#browserPanel mark.match{ background: color-mix(in srgb, var(--hl) 35%, transparent); color: var(--fg); border-radius: 3px; padding: 0 2px }

/* === MICRO DOCK === */
.mdock{ position:fixed; right:12px; bottom: calc(var(--tickH) + var(--gapH) + 10px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:8px; z-index:999 }
.md-btn{ width:36px; height:36px; border-radius:999px; background:#1b2633; color:#dfe8f3; border:1px solid #3a5166; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.35) }
.md-btn:hover{ filter:brightness(1.1) }
.md-btn.active{ outline:2px solid var(--hl); outline-offset:2px }
.md-main{ background:#26313b }
.md-split{ position:relative }
.md-menu{ position:absolute; right:44px; bottom:0; display:none; padding:6px; min-width:160px; background:rgba(14,17,22,.95); border:1px solid #2a3a4a; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.45) }
.md-menu.open{ display:block }
.md-item{ display:block; width:100%; padding:6px 10px; text-align:left; background:#1b2633; color:#dfe8f3; border:1px solid #3a5166; border-radius:6px; margin:4px 0 }
.md-item:hover{ filter:brightness(1.1) }
@media (max-width:700px){ .md-btn{ width:44px; height:44px } .md-menu{ right:52px } }
:root{
  --z-bg: 0;
  --z-viz: 50;
  --z-ticker: 100;
  --z-win-base: 300;   /* panels */
  --z-lyrics: 200;     /* lyrics default */
  --z-toast: 600;
  --z-spinner: 1000;
}

.bg-stage{ z-index: var(--z-bg); }
.visual{ z-index: var(--z-viz); }
.ticker{ z-index: var(--z-ticker); }
.win{ z-index: var(--z-win-base); }
.fly{ z-index: var(--z-lyrics); }
#sfToast{ z-index: var(--z-toast); }
#spinner{ z-index: var(--z-spinner); }
#ch16Panel { display: none; }
#ch16Panel.visible { display: block; }

/* Base word style (optional, keep your existing styles) */
#lyAct .w {
  /* fallback text color for unhighlighted words */
  color: var(--fg, #fff);
}

/* Fully highlighted past words */
#lyAct .w.on {
  color: var(--hl);
  text-shadow: 0 0 8px var(--hl);
}

/* Current word with smooth 0–100% fill using --p */
#lyAct .w.cur {
  /* We render color by gradient so set text color transparent */
  color: transparent;

  /* Smooth fill from left → right */
  background-image: linear-gradient(
    to right,
    var(--hl) 0%,
    var(--hl) var(--p, 0%),
    currentColor var(--p, 0%)
  );
  -webkit-background-clip: text;
  background-clip: text;

  /* optional glow emphasis */
  text-shadow: 0 0 10px var(--hl);
}
</style>

<!-- === THEME PRESETS (Quick Color Theme Switch) === -->
<style id="theme-presets-css">
/* We override only variables your UI already consumes.
   We intentionally DO NOT modify --hl (your lyrics highlight color). */

/* Default / compatibility */
:root { --accent: #4fd1ff; } /* keep your current accent as base */

/* Dark = your existing palette (as a baseline) */
html[data-theme="dark"] {
  --bg:    #0b0b0b;
  --fg:    #e7e7e7;
  --muted: #9aa0a6;
  --panel: #151515;
  --line:  #1e1e1e;
  --accent:#4fd1ff;
}

/* Neon = deep space w/ cyan-magenta vibe */
html[data-theme="neon"] {
  --bg:    #05060b;
  --fg:    #eaf6ff;
  --muted: #9db6c7;
  --panel: #0c1117;
  --line:  #141b22;
  --accent:#7ef9a7; /* fresh vibe for UI chrome (not lyrics HL) */
}

/* Warm = cozy amber/orange */
html[data-theme="warm"] {
  --bg:    #12100e;
  --fg:    #f3eadd;
  --muted: #c5b9a7;
  --panel: #191612;
  --line:  #251f1a;
  --accent:#ffb86b;
}

/* Mono = minimalist grayscale */
html[data-theme="mono"] {
  --bg:    #0c0c0c;
  --fg:    #f2f2f2;
  --muted: #bdbdbd;
  --panel: #161616;
  --line:  #222222;
  --accent:#d0d0d0;
}

/* Optional tiny polish so existing elements respect --accent */
a.btn, button, select, .wm-btn, .chip {
  border-color: color-mix(in srgb, var(--accent) 30%, #ffffff20);
}
button:hover, a.btn:hover, .wm-btn:hover, .chip:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
</style>
<!-- Place this near the end of the document (after WM.init and other CSS) -->
<style id="lyrics-zorder-patch">
  /* Panels stay above; lyrics stays below panels but above visualizer */
  :root { --z-lyrics: 150; }             /* lower than panel baseline (200+) */
  #lyWin { z-index: var(--z-lyrics) !important; }
  #playlist .row.__hide { display: none !important; }
 
  /* Hide the background canvas completely when "off" */
#fx-bgfx.fxbg-off {
  display: none !important;
  opacity: 0 !important;
  filter: none !important;     /* neutralize brightness filter */
}

</style>
</head>
<body>

<!-- Background Stage -->
<div class="bg-stage" id="bgStage">
  <video id="bgVideo" class="layer" muted playsinline></video>
  <img id="bgImage" class="layer" alt="">
  <div id="bgGrad" class="layer"></div>
  <div id="bgColor" class="layer"></div>
</div>

<header>
  <a class="brand"><img class="logo"> <span class="title">KaraokeHD Player</span></a>
  
  <button id="startBtn" disabled>Start</button>
  <button id="stopBtn" disabled title="Skip to next">Skip</button>
  <button id="resumeBtn" disabled title="Resume last track">Resume</button>


  <label>SoundFont:
    <select id="sfSelect"><option value="" selected disabled>— Select a SoundFont —</option>
      <?php foreach ($sfList as $sf) { $v = htmlspecialchars($sf['rel'], ENT_QUOTES, 'UTF-8'); $sz = (int)($sf['size'] ?? 0); ?>
      <option value="<?php echo $v; ?>" data-size="<?php echo $sz; ?>"><?php echo htmlspecialchars(pathinfo($sf['name'], PATHINFO_FILENAME), ENT_QUOTES, 'UTF-8'); ?></option>
      <?php } ?>
    </select>
  </label>
  <label class="small" title="Volume">
    Vol <input type="range" id="volRange" min="0" max="100" step="1">
  </label>
  <span class="note">We Bike And Sing!</span>
  <span id="time" class="small">00:00.000</span>
  <span id="status" class="small" style="margin-left:8px;color:#b7d3ff">READY</span>
  <span id="nowPlaying" class="small" style="margin-left:8px;color:#c7f7c7"></span>
  <button id="showBrowser" class="small" style="margin-left:auto">Browser</button>
  <button id="showQueue" class="small">Queue</button>
  <button id="showLyrics" class="small" title="Show Lyrics Window">Lyrics</button>
  <button id="showBG" class="small" title="Backgrounds">BG</button>
  <button id="fsToggle" class="small" title="Toggle Fullscreen">⛶</button>
  
</header>

<main>
    <section class="panel win" id="ch16Panel">
  <h4 class="drag">Channel Instrument Monitor</h4>
  <div id="ch16Container" class="list" style="padding:8px"></div>
</section>
  <div class="visual"><canvas id="viz"></canvas></div>

  <!-- Song Browser -->
  <section class="panel win" id="browserPanel"><h4 class="drag"><span>Song Browser</span><span><button class="close" data-close="browser">×</button></span></h4>
  <!-- Folder Selector -->
<div class="toolbar" id="folderList">
    
</div>
  
  <div class="row searchbar" id="browserSearchRow">
  <input type="search" id="browserSearch" class="search" placeholder="Search songs… (name or path)">
  <button class="small" id="browserSearchClear" title="Clear">✕</button>
  <button class="small" id="browserSearchGo"    title="Search">Search</button>
  <span   class="small" id="browserSearchCount"></span>
</div>


    <div class="list" id="playlist">
      <?php foreach ($midiList as $it) { ?>
      <div class="row" data-path="<?php echo htmlspecialchars($it['rel'], ENT_QUOTES, 'UTF-8'); ?>">
        <a class="song" href="#" data-path="<?php echo htmlspecialchars($it['rel'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo htmlspecialchars($it['path'], ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars(pathinfo($it['name'], PATHINFO_FILENAME), ENT_QUOTES, 'UTF-8'); ?></a>
        <span class="small"><?php echo ($it['size'] ? number_format($it['size']/1024, 0).' KB' : ''); ?></span>
      </div>
      <?php } ?>
      <?php if (empty($midiList)) { ?><div class="row"><span class="small">Put files under /midi/</span></div><?php } ?>
    </div>
  </section>

  <!-- Queue -->
  <section class="panel win" id="queuePanel"><h4 class="drag"><span>Queue</span><span><button class="close" data-close="queue">×</button></span></h4>
    <div class="list" id="queueList"></div>
  </section>

  <!-- Backgrounds -->
  <section class="panel win" id="bgPanel"><h4 class="drag"><span>Backgrounds</span><span><button class="close" data-close="bg">×</button></span></h4>
    <div class="list">
      <div class="row">
        <span class="label">Mode</span>
        <div class="chips">
          <button class="small" data-bgmode="video">Video</button>
          <button class="small" data-bgmode="images">Images</button>
          <button class="small" data-bgmode="gradient">Gradient</button>
          <button class="small" data-bgmode="color">Color</button>
        </div>
      </div>
      <div class="row" id="bgRowShuffle">
        <span class="label">Shuffle</span>
        <label class="small"><input type="checkbox" id="bgShuffle"> No repeat until cycle ends</label>
      </div>
      <div class="row" id="bgRowImgDur">
        <span class="label">Img Dur</span>
        <input type="range" id="bgImgDur" min="2000" max="60000" step="1000"><span class="small meter" id="bgImgDurLabel"></span>
      </div>
      <div class="row" id="bgRowGrad">
        <span class="label">Gradient</span>
        <select id="bgGradSel"></select>
      </div>
      <div class="row" id="bgRowColor">
        <span class="label">Color</span>
        <input type="color" id="bgColorPicker" value="#000000">
      </div>
      <div class="row">
        <button id="bgPrev">Prev</button>
        <button id="bgNext">Next</button>
        <button id="bgPause">Pause</button>
        <button id="bgPlay">Play</button>
      </div>
      <div class="row"><span class="small" id="bgStats"></span></div>
    </div>
  </section>

  <!-- Control Center -->
  <section class="panel win" id="ccPanel"><h4 class="drag"><span>Control Center</span><span><button class="close" data-close="cc">×</button></span></h4>
    <div class="list">
        <div class="row">
  <span class="label">Tools</span>
  
  
  <button onclick="openTool('uploader_standalone.php')">Uploader</button>
  
<button onclick="openTool('midifm.php')">Filemanager</button>
 
<button onclick="openTool('karkan.html')">Editor</button>
 
<button onclick="openTool('mono.html')">Ringtone</button>


<button onclick="openTool('background_manager.php')">B.Manager</button>

<button onclick="openTool('info.php')">Sysinfo</button>

<button onclick="openTool('cleaner.php')">Duplicate</button>
</div>
<div id="controlCenter"></div>


  <!-- Button to toggle the FX panel -->
  <button id="btnFx" type="button">Background FX</button>

    <!-- Put this inside your Control Center tools row or under Transport -->
<div id="heal-toggle"></div>
      <div class="row"><span class="label">Transport</span>
        <div class="chips">
          <button id="ccStart"  class="small">Start</button>
          <button id="ccResume" class="small">Resume</button>
          <button id="ccSkip"   class="small">Skip</button>
        </div>
      </div>

      <div class="row"><span class="label">Volume</span>
        <input type="range" id="ccVol" min="0" max="100" step="1"><span id="ccVolLabel" class="small"></span>
      </div>

      <div class="row"><span class="label">SoundFont</span>
        <select id="ccSf">
          <option value="" disabled>— Select —</option>
          <?php foreach ($sfList as $sf) { $v = htmlspecialchars($sf['rel'], ENT_QUOTES, 'UTF-8'); $sz = (int)($sf['size'] ?? 0); ?>
          <option value="<?php echo $v; ?>" data-size="<?php echo $sz; ?>"><?php echo htmlspecialchars(pathinfo($sf['name'], PATHINFO_FILENAME), ENT_QUOTES, 'UTF-8'); ?></option>
          <?php } ?>
        </select>
      </div>

      <div class="row"><span class="label">SF Policy</span>
        <div class="chips" id="ccSfPolicy">
          <button data-pol="ask" class="small">Ask</button>
          <button data-pol="now" class="small">Now</button>
          <button data-pol="next" class="small">Next</button>
        </div>
      </div>

      <div class="row"><span class="label">Lyrics</span>
        <div class="chips">
          <button id="ccShowLyrics" class="small">Show</button>
          <button id="ccPinLyrics"  class="small">Pin</button>
          <button id="ccGlow"       class="small">Glow</button>
          <button id="ccAutoHide"   class="small">AutoHide</button>
        </div>
      </div>

      <div class="row"><span class="label">Highlight</span>
        <div class="chips" id="ccHLs">
          <span class="chip" data-hl="#7ef9a7">Green</span>
          <span class="chip" data-hl="#4fd1ff">Cyan</span>
          <span class="chip" data-hl="#ffd166">Yellow</span>
          <span class="chip" data-hl="#ff8e72">Orange</span>
          <span class="chip" data-hl="#ff6bd6">Pink</span>
          <span class="chip" data-hl="#ffffff">White</span>
        </div>
        <input type="color" id="ccHLpick" value="#7ef9a7" title="Custom">
      </div>

      <div class="row"><span class="label">Header</span>
        <label class="small"><input type="checkbox" id="ccCompactHead"> Compact header</label>
      </div>
    </div>
  </section>
</main>

<!-- Ticker -->
<div class="ticker"><div class="ticker-track" id="tickerTrack"></div></div>

<!-- Lyrics Window -->
<div class="fly" id="lyWin" aria-label="Lyrics">
  <div class="fly-head" id="lyHead">
    <div class="fly-title">🎤 <span id="lyTitle">Lyrics</span></div>
    <div class="fly-tools">
      <button id="btnTri" title="Tri view">Tri</button>
      <button id="btnFull" title="Full view">Full</button>
      <button id="btnGlow" title="Toggle glow">Glow</button>
      <button id="btnSmaller" title="Font -">A-</button>
      <button id="btnBigger" title="Font +">A+</button>
      <button id="btnAutoHide" title="Auto-hide controls">AutoHide</button>
      <button class="fly-close" id="lyClose" title="Close">✖</button>
    </div>
  </div>
  <div class="fly-body" id="lyBody">
    <div class="lv" id="lyTri">
      <div class="line prev" id="lyPrev"></div>
      <div class="line act"  id="lyAct"></div>
      <div class="line next" id="lyNext"></div>
    </div>
    <div id="lyFull" style="display:none"></div>
  </div>
  <div class="fly-foot" id="lyFoot">
    <div class="foot-left">
      <span class="small">Align</span>
      <button id="alignLeft"  title="Align left">L</button>
      <button id="alignCenter" title="Align center">C</button>
      <button id="alignRight" title="Align right">R</button>
    </div>
    <div class="foot-right">
      <span class="small">Size</span>
      <input type="range" id="fsRange" min="80" max="180" step="1">
      <span id="fsLabel" class="small">100%</span>
      <span class="small" style="margin-left:8px">Opacity</span>
      <input type="range" id="opRange" min="35" max="100" step="1">
      <span class="small" style="margin-left:8px">Blur</span>
      <input type="range" id="blurRange" min="0" max="20" step="1">
      <span id="blurLabel" class="small">8px</span>
      <span class="small" style="margin-left:8px">HL</span>
      <div class="chips" id="hlChips">
        <span class="chip" data-hl="#7ef9a7">Green</span>
        <span class="chip" data-hl="#4fd1ff">Cyan</span>
        <span class="chip" data-hl="#ffd166">Yellow</span>
        <span class="chip" data-hl="#ff8e72">Orange</span>
        <span class="chip" data-hl="#ff6bd6">Pink</span>
        <span class="chip" data-hl="#ffffff">White</span>
      </div>
      <input type="color" id="hlPick" value="#7ef9a7" title="Custom highlight color" style="width:28px;height:22px;border:1px solid #444;border-radius:6px;background:transparent;cursor:pointer">
    </div>
  </div>
  <div class="wm-grip" aria-hidden="true"></div>
</div>

<!-- Spinner -->
<div id="spinner"><div class="ring"></div><div class="txt">Loading…</div></div>

<!-- SF Toast -->
<div id="sfToast" class="toast" role="dialog" aria-live="polite" aria-label="SoundFont change">
  <div class="t-body">
    <div class="t-row t-title" id="sfToastTitle">Change SoundFont?</div>
    <div class="t-row t-muted" id="sfToastMsg"></div>
    <div class="t-row t-actions">
      <button class="btn" id="sfApplyNow">Apply Now</button>
      <button class="btn" id="sfApplyNext">Next Song</button>
      <button class="btn" id="sfCancel">Cancel</button>
    </div>
    <div class="t-row t-check">
      <input type="checkbox" id="sfRemember">
      <label for="sfRemember" class="t-muted">Remember my choice</label>
    </div>
  </div>
</div>

<script>(function(){function load(u){return new Promise(function(r,j){var s=document.createElement('script');s.src=u;s.async=true;s.onload=r;s.onerror=function(){j(new Error('CDN load failed: '+u));};document.head.appendChild(s);});}
load('libfluidsynth-2.4.6-with-libsndfile.js').then(function(){return load('js-synthesizer.min.js');}).then(function(){return load('MIDIFile.js');}).then(function(){return JSSynth.waitForReady();}).then(function(){window.__SYNTH_READY__=true; document.getElementById('status').textContent='READY';}).catch(function(e){console.error(e);alert(e.message);});})();</script>


<script>
    
    
// === Globals & UI Map ===
var PATH_MIDI_BASE='<?php echo $MIDI_DIR; ?>'+'/'; var PATH_SF_BASE='<?php echo $SF_DIR; ?>'+'/';
var BG_VIDEOS = <?php echo json_encode(array_values(array_map(function($x){return $x['path'];}, $bgVideos))); ?>;
var BG_IMAGES = <?php echo json_encode(array_values(array_map(function($x){return $x['path'];}, $bgImages))); ?>;
var BG_GRADIENTS = [
  'linear-gradient(135deg,#1b2735 0%, #090a0f 100%)',
  'radial-gradient(1200px 800px at 50% 50%, #062743, #000)',
  'linear-gradient(160deg,#3a1c71,#d76d77,#ffaf7b)',
  'linear-gradient(120deg,#0f2027,#203a43,#2c5364)'
];
// NEW: expose custom font files to JS
var FONT_FILES = <?php echo json_encode(array_values(array_map(function($x){ return $x['path']; }, $fontList))); ?>;

var ui={start:document.getElementById('startBtn'),stop:document.getElementById('stopBtn'),resume:document.getElementById('resumeBtn'),sfSelect:document.getElementById('sfSelect'),volRange:document.getElementById('volRange'),time:document.getElementById('time'),status:document.getElementById('status'),now:document.getElementById('nowPlaying'),spinner:document.getElementById('spinner'),list:document.getElementById('playlist'),canvas:document.getElementById('viz'),showBrowser:document.getElementById('showBrowser'),showQueue:document.getElementById('showQueue'),browserPanel:document.getElementById('browserPanel'),queuePanel:document.getElementById('queuePanel'),queueList:document.getElementById('queueList'),tickerTrack:document.getElementById('tickerTrack'),showLyrics:document.getElementById('showLyrics'),lyWin:document.getElementById('lyWin'),lyHead:document.getElementById('lyHead'),lyBody:document.getElementById('lyBody'),lyTitle:document.getElementById('lyTitle'),lyPrev:document.getElementById('lyPrev'),lyAct:document.getElementById('lyAct'),lyNext:document.getElementById('lyNext'),lyTri:document.getElementById('lyTri'),lyFull:document.getElementById('lyFull'),lyClose:document.getElementById('lyClose'),opRange:document.getElementById('opRange'),btnTri:document.getElementById('btnTri'),btnFull:document.getElementById('btnFull'),btnGlow:document.getElementById('btnGlow'),btnSmaller:document.getElementById('btnSmaller'),btnBigger:document.getElementById('btnBigger'),alignLeft:document.getElementById('alignLeft'),alignCenter:document.getElementById('alignCenter'),alignRight:document.getElementById('alignRight'),showBG:document.getElementById('showBG'),bgPanel:document.getElementById('bgPanel'),bgShuffle:document.getElementById('bgShuffle'),bgImgDur:document.getElementById('bgImgDur'),bgImgDurLabel:document.getElementById('bgImgDurLabel'),bgGradSel:document.getElementById('bgGradSel'),bgColorPicker:document.getElementById('bgColorPicker'),bgPrev:document.getElementById('bgPrev'),bgNext:document.getElementById('bgNext'),bgPause:document.getElementById('bgPause'),bgPlay:document.getElementById('bgPlay'),bgStats:document.getElementById('bgStats'),fsToggle:document.getElementById('fsToggle'),sfToast:document.getElementById('sfToast'),sfApplyNow:document.getElementById('sfApplyNow'),sfApplyNext:document.getElementById('sfApplyNext'),sfCancel:document.getElementById('sfCancel'),sfRemember:document.getElementById('sfRemember'),sfToastMsg:document.getElementById('sfToastMsg'),fsRange:document.getElementById('fsRange'),fsLabel:document.getElementById('fsLabel'),blurRange:document.getElementById('blurRange'),blurLabel:document.getElementById('blurLabel'),btnAutoHide:document.getElementById('btnAutoHide'),hlPick:document.getElementById('hlPick'),hlChips:document.getElementById('hlChips'),browserSearch:document.getElementById('browserSearch'),browserSearchClear:document.getElementById('browserSearchClear'),browserSearchCount:document.getElementById('browserSearchCount'),
// Control Center elements
ccPanel:document.getElementById('ccPanel'), ccStart:document.getElementById('ccStart'), ccResume:document.getElementById('ccResume'), ccSkip:document.getElementById('ccSkip'), ccVol:document.getElementById('ccVol'), ccVolLabel:document.getElementById('ccVolLabel'), ccSf:document.getElementById('ccSf'), ccSfPolicy:document.getElementById('ccSfPolicy'), ccShowLyrics:document.getElementById('ccShowLyrics'), ccPinLyrics:document.getElementById('ccPinLyrics'), ccGlow:document.getElementById('ccGlow'), ccAutoHide:document.getElementById('ccAutoHide'), ccHLs:document.getElementById('ccHLs'), ccHLpick:document.getElementById('ccHLpick'), ccCompactHead:document.getElementById('ccCompactHead')};

var ac,synth,node,masterGain,comp,analyser,rafViz=0,rafTime=0,rafLyrics=0; var isPlaying=false,songStart=0,currentSong=null,token=0; var sfSelected='',sfCache={},pendingSF=null; var q=[],busy=false; var lastPlayed=null,lastMIDIBuf=null; var lastLyrics=null,lyricsState={lines:[],idxLine:-1,idxWord:-1};
var lsFS=localStorage.getItem('lyrFontScale'); var lyrFontScale=parseFloat(lsFS!=null?lsFS:(window.innerWidth>=1200?'1.28':'1.08'))||1; var lyrMode = localStorage.getItem('lyrMode')||'tri'; var lyrGlow=(localStorage.getItem('lyrGlow')||'on')==='on'; var lyrAlign=localStorage.getItem('lyrAlign')||'center';
var lyBlur = parseInt(localStorage.getItem('lyBlur')||'8',10); if(isNaN(lyBlur)) lyBlur=8; var lyAutoHide=(localStorage.getItem('lyAutoHide')||'on')==='on'; var _hideTimer=null;
var hlColor = localStorage.getItem('lyrHLColor') || '#7ef9a7';
var vizBarColor = '#4fd1ff';
var volume = parseFloat(localStorage.getItem('volume')||'0.9'); if(!(volume>=0&&volume<=1)) volume=0.9;

function setVolume(v){ volume = Math.max(0, Math.min(1, v||0)); localStorage.setItem('volume', String(volume)); if (masterGain) masterGain.gain.value = volume; if (ui.volRange){ ui.volRange.value = Math.round(volume*100); ui.volRange.setAttribute('title','Volume: '+Math.round(volume*100)+'%'); } if(ui.ccVol){ ui.ccVol.value = Math.round(volume*100); ui.ccVolLabel.textContent = Math.round(volume*100)+'%'; } }
function setStatus(t){ui.status.textContent=t;}
function setNowPlaying(r,n){ ui.now.textContent = n ? ('PLAYING: '+n) : ''; }

// Minimal, single-point ticker fix: always refresh ticker when "now playing" changes.
(function(){
  const _origSetNow = window.setNowPlaying;
  window.setNowPlaying = function(rel, name){
    // Keep existing behavior
    if (typeof _origSetNow === 'function') _origSetNow(rel, name);
    // Ensure ticker reflects the new state immediately
    try { updateTicker(); } catch(e) {}
  };
})();

function setLoading(b,t){ui.spinner.style.display=b?'flex':'none'; if(t) ui.spinner.querySelector('.txt').textContent=t;}
function fmt(s){if(s<0)s=0;var m=Math.floor(s/60),x=Math.floor(s%60),ms=Math.floor(s*1000%1000);return ('0'+m).slice(-2)+":"+('0'+x).slice(-2)+'.'+('00'+ms).slice(-3);} 
function encodePath(p){return p.split('/').map(encodeURIComponent).join('/');}
function escapeHtml(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}

function updateTicker(){ const track=ui.tickerTrack; if(!track) return; const items=[]; const stripExt=(s)=>{ if(!s) return ''; s=s.split('/').pop(); const i=s.lastIndexOf('.'); return (i>0? s.slice(0,i): s); }; const playingName=lastPlayed&&lastPlayed.name?lastPlayed.name:(currentSong?stripExt(currentSong.split('/').pop()):''); if(currentSong&&playingName){ items.push({label:playingName, role:'playing'});} for(let i=0;i<q.length;i++){ const name=q[i].name? q[i].name: stripExt(q[i].rel||q[i].path||''); items.push({label:name, role:(i===0?'next':'queue')}); } if(!items.length){ track.innerHTML='<span class="ticker-item small">Queue empty</span>'; track.style.animation='none'; return;} let html=''; for(let i=0;i<items.length;i++){ const it=items[i]; const n=(i+1)+'. '; const cls='ticker-item '+(it.role==='playing'?'playing':(it.role==='next'?'next':'')); html+='<span class="'+cls+'">'+n+escapeHtml(it.label)+'</span><span class="separator">•</span>'; } track.innerHTML=html+html; void track.offsetWidth; let copyW=track.scrollWidth/2; if(copyW<120) copyW=120; const px=80; const dur=Math.max(10, Math.round(copyW/px)); track.style.animation='marquee '+dur+'s linear infinite'; }

function syncVizSize(){ try{ const cs=getComputedStyle(document.documentElement); const vh=parseInt(cs.getPropertyValue('--vizH'))||160; const w=window.innerWidth||document.documentElement.clientWidth||ui.canvas.clientWidth||1200; ui.canvas.width=Math.max(320,Math.floor(w)); ui.canvas.height=Math.max(60,Math.floor(vh)); }catch(e){} }

async function ensureSynth(){if(!window.__SYNTH_READY__) throw new Error('Synth not loaded yet'); if(ac) return; ac=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});} 
function disconnectNode(){try{node&&node.disconnect();}catch(e){} node=null;}
function runTimers(){ cancelAnimationFrame(rafTime);(function t(){ui.time.textContent=fmt(isPlaying?(ac.currentTime-songStart):0);rafTime=requestAnimationFrame(t);})(); var ctx=ui.canvas.getContext('2d'),data=new Uint8Array(analyser?analyser.frequencyBinCount:1024); cancelAnimationFrame(rafViz);(function v(){ if(analyser){analyser.getByteFrequencyData(data);} var W=ui.canvas.width,H=ui.canvas.height; ctx.clearRect(0,0,W,H); var bars=Math.max(16, Math.min(96, Math.floor(W/18))); var step=Math.floor((data.length||1024)/bars),bw=W/bars; 
for(var i=0;i<bars;i++){var val=data[i*step]||0,h=(val/255)*H; ctx.fillStyle = vizBarColor || '#4fd1ff'; ctx.fillRect(i*bw, H-h, bw*0.8, h);} rafViz=requestAnimationFrame(v);})(); }

function applyFSUI(){ if(ui.fsRange){ var pct=Math.round(lyrFontScale*100); ui.fsRange.value=String(pct); } if(ui.fsLabel){ ui.fsLabel.textContent = Math.round(lyrFontScale*100)+'%'; } }
function applyBlur(){ var v=Math.max(0,Math.min(20,parseInt(lyBlur,10)||0)); lyBlur=v; ui.lyWin && ui.lyWin.style.setProperty('--blur', v+'px'); localStorage.setItem('lyBlur', String(v)); if(ui.blurRange) ui.blurRange.value=String(v); if(ui.blurLabel) ui.blurLabel.textContent=v+'px'; }
function applyHLColor(){ var c = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hlColor)? hlColor : '#7ef9a7';
  if(ui.hlPick) ui.hlPick.value=c; if(ui.ccHLpick) ui.ccHLpick.value=c;
  if(ui.lyWin) ui.lyWin.style.setProperty('--hl', c);
  document.documentElement.style.setProperty('--hl', c);
  localStorage.setItem('lyrHLColor', c);
  vizBarColor = c;
  if(ui.hlChips){ ui.hlChips.querySelectorAll('.chip').forEach(function(ch){ ch.classList.toggle('active', (ch.getAttribute('data-hl')||'').toLowerCase()===c.toLowerCase()); }); }
  if(ui.ccHLs){ ui.ccHLs.querySelectorAll('.chip').forEach(function(ch){ ch.classList.toggle('active', (ch.getAttribute('data-hl')||'').toLowerCase()===c.toLowerCase()); }); }
}
function applyAutoHideUI(){
  if (!ui.lyWin) return;

  // clear any pending timers
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

  if (lyAutoHide) {
    // DO NOT forcibly unhide. Keep current state.
    // If chrome is currently visible, schedule it to hide soon.
    if (!ui.lyWin.classList.contains('chrome-hidden')) {
      scheduleHide(); // will hide after your normal delay
    }
  } else {
    // AutoHide OFF → ensure chrome is visible
    ui.lyWin.classList.remove('chrome-hidden');
  }

  // Keep BOTH buttons in sync (same as your current code)
  const label = lyAutoHide ? 'AutoHide: ON' : 'AutoHide: OFF';
  if (ui.btnAutoHide) {
    ui.btnAutoHide.classList.toggle('active', lyAutoHide);
    ui.btnAutoHide.textContent = label;
    ui.btnAutoHide.setAttribute('aria-pressed', String(lyAutoHide));
  }
  if (ui.ccAutoHide) {
    ui.ccAutoHide.classList.toggle('active', lyAutoHide);
    ui.ccAutoHide.textContent = label;
    ui.ccAutoHide.setAttribute('aria-pressed', String(lyAutoHide));
  }
}

function scheduleHide(){ if(!lyAutoHide) return; clearTimeout(_hideTimer); _hideTimer=setTimeout(function(){ if(!ui.lyWin.classList.contains('visible')) return; ui.lyWin.classList.add('chrome-hidden'); }, 2500); }
function showChromeNow(){ if(!ui.lyWin) return; ui.lyWin.classList.remove('chrome-hidden'); if(lyAutoHide) scheduleHide(); }

function buildGraph(){ synth=new JSSynth.Synthesizer();synth.init(ac.sampleRate);
// Bind Simple Mapper so Apply sends CC0/32 + Program to this synth
if (window.SimpleMapper && typeof SimpleMapper.bindSynth === 'function') {
SimpleMapper.bindSynth(synth);}

masterGain=ac.createGain(); masterGain.gain.value = volume; comp=ac.createDynamicsCompressor(); comp.threshold.value=-18;comp.knee.value=20;comp.ratio.value=3;comp.attack.value=0.005;comp.release.value=0.1; analyser=ac.createAnalyser(); analyser.fftSize=1024; analyser.smoothingTimeConstant=0.0; node=synth.createAudioNode(ac,8192); node.connect(comp);comp.connect(masterGain);masterGain.connect(analyser);analyser.connect(ac.destination);} 
async function resetGraph(){await ensureSynth();try{await synth?.stopPlayer?.();}catch(e){} try{synth?.close?.();}catch(e){} disconnectNode();buildGraph();}


// === SoundFont fetch with percentage progress ===
async function fetchWithProgress(url, onProgress){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('SF2/SF3 HTTP ' + res.status);

  // Try to use streaming + Content-Length if available
  const total = +(res.headers.get('Content-Length') || 0);

  // Fallback: if streaming not supported, just read it whole
  if (!res.body || !window.ReadableStream) {
    const ab = await res.arrayBuffer();
    onProgress && onProgress(total, total); // 100%
    return ab;
    }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (onProgress) onProgress(received, total);
  }

  const blob = new Blob(chunks);
  return await blob.arrayBuffer();
}

async function loadSelectedSF(){
  await ensureSynth();
  if (ac.state !== 'running') return;
  if (!sfSelected) throw new Error('No SoundFont selected');

  // Use cache if already loaded
  if (sfCache[sfSelected]) {
    setStatus('APPLYING SF…');
    await synth.loadSFont(sfCache[sfSelected]);

    // ✅ Always rebuild catalog + repaint
    try {
      if (window.SimpleMapperCatalog && typeof SimpleMapperCatalog.refreshSF === 'function') {
        SimpleMapperCatalog.refreshSF();
      }
      if (window.__MIX16 && typeof __MIX16.refreshNames === 'function') {
        __MIX16.refreshNames({ fallback: false });
      }
    } catch(_) {}

    setStatus('IDLE');
    return;
  }

  // Show spinner with progress
  setLoading(true, 'Loading SoundFont… 0%');
  setStatus('LOADING SF…');

  try {
    const url = PATH_SF_BASE + encodePath(sfSelected);

    const buf = await fetchWithProgress(url, (got, total) => {
      const txt =
        total > 0
          ? `Loading SoundFont… ${Math.max(0, Math.min(100, Math.round(got / total * 100)))}%`
          : `Loading SoundFont… ${Math.round(got / 1024)} KB`;
      try { ui.spinner.querySelector('.txt').textContent = txt; } catch (e) {}
    });

    sfCache[sfSelected] = buf;
    await synth.loadSFont(buf);

    // ✅ Always rebuild catalog + repaint (NEW SF case)
    try {
      if (window.SimpleMapperCatalog && typeof SimpleMapperCatalog.refreshSF === 'function') {
        SimpleMapperCatalog.refreshSF();
      }
      if (window.__MIX16 && typeof __MIX16.refreshNames === 'function') {
        __MIX16.refreshNames({ fallback: false });
      }
    } catch(_) {}

  } finally {
    setLoading(false);
    setStatus('IDLE');
  }
}

async function applyCurrentSF(){setStatus('APPLYING SF…'); await resetGraph(); await loadSelectedSF(); setStatus('IDLE');}

async function quietStop(){ if(!ac||!synth){return;} token++; setStatus('STOPPING…'); try{ try{if(masterGain) masterGain.gain.setTargetAtTime(0,ac.currentTime,0.03);}catch(e){} try{await synth?.stopPlayer?.();}catch(e){} } finally{ isPlaying=false; ui.stop.disabled=true; currentSong=null; setNowPlaying(null,null); setStatus('IDLE'); runTimers(); setTimeout(()=>setVolume(volume),120); }}

function renderQueue(){
  var el=ui.queueList;
  if(!q.length){
    el.innerHTML='<div class="row"><span class="small">Queue empty</span></div>';
    updateTicker();
    return;
  }
  var html='';
  for(var i=0;i<q.length;i++){
    var it=q[i];
    html+='<div class="row" data-idx="'+i+'">'
        + '<a class="queued" href="#" data-path="'+escapeHtml(it.rel)+'" title="'+escapeHtml(it.path||it.rel)+'">'
        +   escapeHtml(it.name)
        + '</a>'
        + '<span class="actions small">'
        +   '<button class="small">Next</button>'
        +   '<button class="small">▲</button>'
        +   '<button class="small">▼</button>'
        +   '<button class="small">✕</button>'
        + '</span>'
        + '</div>';
  }
  el.innerHTML=html;
  updateTicker();
}
function highlightNow(rel){var rows=document.querySelectorAll('#playlist .row'); for(var i=0;i<rows.length;i++){var p=rows[i].getAttribute('data-path'); var a=rows[i].querySelector('a.song'); if(a){if(p===rel)a.classList.add('now'); else a.classList.remove('now'); } }}

async function feedNextIfAny(){if(q.length===0){setStatus('IDLE'); updateTicker(); return;} var next=q.shift(); renderQueue(); await playSong(next.rel,next.name);} 

var ACTIVE_SPANS=[];
function escJoin(L){var arr=(L&&L.words)?L.words.map(function(w){return w.w;}):[]; return escapeHtml(arr.join(''));}
function ensureLyWin(){var win=ui.lyWin;if(!win)return; var op=parseFloat(localStorage.getItem('lyrOpacity')||'0.78'); setLyOpacity(op); ui.opRange.value=Math.round(op*100); applyAlign(); applyFSUI(); applyBlur(); applyHLColor(); applyAutoHideUI(); }
function setLyOpacity(a){a=Math.max(.35,Math.min(1,a||.78)); ui.lyWin.style.background='rgba(0,0,0,'+a+')'; localStorage.setItem('lyrOpacity', String(a));}
function setLyrMode(m){ lyrMode=m; localStorage.setItem('lyrMode',m); ui.lyTri.style.display=(m==='tri')?'block':'none'; ui.lyFull.style.display=(m==='full')?'block':'none'; if (ui.btnTri && ui.btnFull){ ui.btnTri.classList.toggle('active', m==='tri'); ui.btnFull.classList.toggle('active', m==='full'); ui.btnTri.setAttribute('aria-pressed', String(m==='tri')); ui.btnFull.setAttribute('aria-pressed', String(m==='full')); } }
function setLyrGlow(on){lyrGlow=!!on; localStorage.setItem('lyrGlow', on?'on':'off'); ui.lyBody.classList.toggle('glow',lyrGlow); if(ui.ccGlow) ui.ccGlow.classList.toggle('active',lyrGlow);} 
function applyFontScale(){var s=Math.max(.8,Math.min(1.8,lyrFontScale)); ui.lyBody.style.setProperty('--fs',s); localStorage.setItem('lyrFontScale', String(s)); applyFSUI();}
function applyAlign(){ ui.lyTri.style.textAlign=lyrAlign; ui.lyFull.style.textAlign=lyrAlign; localStorage.setItem('lyrAlign',lyrAlign); [ui.alignLeft,ui.alignCenter,ui.alignRight].forEach(function(b){b.classList.remove('active');}); if(lyrAlign==='left') ui.alignLeft.classList.add('active'); else if(lyrAlign==='center') ui.alignCenter.classList.add('active'); else ui.alignRight.classList.add('active'); }

ui.alignLeft.addEventListener('click', function(){lyrAlign='left'; applyAlign();}); ui.alignCenter.addEventListener('click', function(){lyrAlign='center'; applyAlign();}); ui.alignRight.addEventListener('click', function(){lyrAlign='right'; applyAlign();}); ui.opRange.addEventListener('input', function(e){setLyOpacity(parseInt(e.target.value,10)/100);});
ui.fsRange && ui.fsRange.addEventListener('input', function(){ var v=parseInt(ui.fsRange.value,10); if(isNaN(v)) return; lyrFontScale = v/100; applyFontScale(); });
ui.blurRange && ui.blurRange.addEventListener('input', function(){ var v=parseInt(ui.blurRange.value,10); if(isNaN(v)) return; lyBlur=v; applyBlur(); });
ui.btnTri.addEventListener('click', function(){setLyrMode('tri');}); ui.btnFull.addEventListener('click', function(){setLyrMode('full');}); ui.btnGlow.addEventListener('click', function(){setLyrGlow(!lyrGlow);}); ui.btnSmaller.addEventListener('click', function(){lyrFontScale-=0.06; applyFontScale();}); ui.btnBigger.addEventListener('click', function(){lyrFontScale+=0.06; applyFontScale();});
ui.showLyrics.addEventListener('click', function(){ WM && WM.lyrics && WM.lyrics.show(); showChromeNow(); ensureLyWin();}); ui.lyClose.addEventListener('click', function(){ui.lyWin.classList.remove('visible');});

if(ui.hlPick){ ui.hlPick.addEventListener('input', function(){ hlColor = ui.hlPick.value || '#7ef9a7'; applyHLColor(); }); }
if(ui.hlChips){ ui.hlChips.addEventListener('click', function(e){ var chip=e.target.closest('.chip'); if(!chip) return; hlColor=(chip.getAttribute('data-hl')||'#7ef9a7'); applyHLColor(); }); }

// Auto-hide
if(ui.btnAutoHide){ ui.btnAutoHide.addEventListener('click', function(){ lyAutoHide=!lyAutoHide; localStorage.setItem('lyAutoHide', lyAutoHide?'on':'off'); applyAutoHideUI(); }); }
['mousemove','pointermove','touchstart','keydown','wheel'].forEach(function(ev){ ui.lyWin && ui.lyWin.addEventListener(ev, function(){ showChromeNow(); }, {passive:true}); });

function buildLyricsJSONFromKARItems(items){var lines = [];var cur = { main_time:null, text:'', words:[] };function push(){ if (cur.words.length){ var t0 = cur.words[0].t || 0; cur.main_time = t0; cur.text = cur.words.map(function(w){ return w.w; }).join(''); lines.push(cur);} cur = { main_time:null, text:'', words:[] }; }var arr = Array.isArray(items) ? items : [];for (var i=0; i<arr.length; i++){var e = arr[i] || {}; var t = (e.playTime || 0) / 1000; var raw = (typeof e.text === 'string') ? e.text : '';var probe = raw.replace(/\r\n?/g,'\n').trim(); if (/^@/.test(probe) || /^\$\$[^\$\$]+\]$/.test(probe)) continue; if (raw === '') { push(); } if (raw === '  ') { if (cur.main_time == null) cur.main_time = t; cur.words.push({ t: t, w: ' ' }); continue; } if (raw === '/' || raw === '\\' || raw === '\n' || raw === '\r') { push(); continue; } var parts = raw.split(/[\/\\]/); for (var j=0; j<parts.length; j++){ var p = parts[j]; if (p !== ''){ if (cur.main_time == null) cur.main_time = t; cur.words.push({ t: t, w: p }); } if (j < parts.length - 1) push(); } } push(); return { meta:{}, lines: lines };}
function buildLyricsJSONFromMIDI(ab){var mf=new MIDIFile(ab); var items=mf.getLyrics()||[]; return buildLyricsJSONFromKARItems(items);} 
function renderLyricsFull(json){ui.lyFull.innerHTML=''; if(!json||!json.lines||!json.lines.length){ui.lyFull.innerHTML='<div class="small" style="padding:6px;color:#888">No lyrics</div>';return;} var html=''; for(var i=0;i<json.lines.length;i++){var L=json.lines[i]; html+='<div class="line">'; for(var w=0; w<(L.words||[]).length; w++){ html+='<span class="w">'+escapeHtml(L.words[w].w)+'</span>'; } html+='</div>'; } ui.lyFull.innerHTML=html; var first = ui.lyFull.firstElementChild; if(first) first.classList.add('active');}
function buildActiveSpans(L){var html=''; for(var i=0;i<(L.words||[]).length;i++){html+='<span class="w">'+escapeHtml(L.words[i].w)+'</span>'; } ui.lyAct.innerHTML=html; ACTIVE_SPANS=[].slice.call(ui.lyAct.querySelectorAll('.w'));
}
function renderLyrics(json){lastLyrics=json; lyricsState={lines:json?json.lines:[],idxLine:-1,idxWord:-1}; ensureLyWin(); applyFontScale(); setLyrMode(lyrMode); setLyrGlow(lyrGlow); applyAlign(); if(!json||!json.lines||!json.lines.length){ ui.lyPrev.textContent=''; ui.lyAct.textContent=''; ui.lyNext.textContent=''; ui.lyFull.innerHTML='<div class="small" style="padding:6px;color:#888">No lyrics</div>'; return;} ui.lyPrev.textContent=''; buildActiveSpans(json.lines[0]||{words:[]}); ui.lyNext.innerHTML=escJoin(json.lines[1]); renderLyricsFull(json);} 
function repaintLyricsTri(now){var json=lastLyrics; if(!json||!json.lines||!json.lines.length) return; var lines=json.lines; var li=-1; for(var i=0;i<lines.length;i++){if(lines[i].main_time<=now) li=i; else break;} if(li<0){ui.lyPrev.innerHTML=''; ui.lyAct.innerHTML=''; ui.lyNext.innerHTML=escJoin(lines[0]); return;} var Lcur=lines[li],Lprev=(li>0)?lines[li-1]:null,Lnext=(li<lines.length-1)?lines[li+1]:null; if(lyricsState.idxLine!==li){ui.lyPrev.innerHTML=escJoin(Lprev); buildActiveSpans(Lcur||{words:[]}); ui.lyNext.innerHTML=escJoin(Lnext); lyricsState.idxLine=li; lyricsState.idxWord=-1;} var wi=-1; var W=(Lcur&&Lcur.words)?Lcur.words:[]; for(var k=0;k<W.length;k++){ if(W[k].t<=now) wi=k; else break;} // Compute progress across the current word (0..1)
var HOLD = 0.25; // seconds to hold the last word if no next timestamp
var tStart = null, tEnd = null;

if (wi >= 0) {
  tStart = W[wi].t;
  if (wi < W.length - 1) {
    // Next word exists → end at next word start
    tEnd = W[wi + 1].t;
  } else {
    // Last word → use next line start if available, otherwise a small hold
    tEnd = (Lnext && typeof Lnext.main_time === 'number')
      ? Lnext.main_time
      : (tStart + HOLD);
  }
}

var prog = 0;
if (tStart != null && tEnd != null) {
  var span = Math.max(0.001, tEnd - tStart); // guard against zero/negative
  prog = (now - tStart) / span;
  if (prog < 0) prog = 0;
  if (prog > 1) prog = 1;
}

// Repaint only if line changed or word index changed
if (lyricsState.idxWord !== wi || lyricsState.idxLine !== li) {
  // Clear state and re‑apply cumulative highlight up to (but NOT including) current word
  ACTIVE_SPANS.forEach(function(s){
    s.classList.remove('on', 'cur');
    s.style.removeProperty('--p');
  });
  for (var j = 0; j < wi; j++) {
    if (ACTIVE_SPANS[j]) ACTIVE_SPANS[j].classList.add('on');
  }
  lyricsState.idxWord = wi;
}

// Always update the current word’s progress, even if idx unchanged this frame
if (wi >= 0 && ACTIVE_SPANS[wi]) {
  var curSpan = ACTIVE_SPANS[wi];
  curSpan.classList.add('cur');
  curSpan.style.setProperty('--p', (prog * 100).toFixed(1) + '%');
}}
function updateLyricsView(now){ if(lyrMode==='tri'){repaintLyricsTri(now); return;} if(!lastLyrics||!lastLyrics.lines||!lastLyrics.lines.length) return; var lines=lastLyrics.lines; var li=-1; for(var i=0;i<lines.length;i++){if(lines[i].main_time<=now) li=i; else break;} if(li<0)return; var host=ui.lyFull; var el=host.children[li]; if(el){ el.classList.add('active'); var prev=host.querySelector('.active'); if(prev&&prev!==el) prev.classList.remove('active'); try{ el.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){ el.scrollIntoView({block:'nearest'});} } lyricsState.idxLine=li; }
function startLyricsClock(){cancelAnimationFrame(rafLyrics); (function t(){var cur=isPlaying?(ac.currentTime-songStart):0; updateLyricsView(cur); rafLyrics=requestAnimationFrame(t);})();}
/*!
 * SMFInject v1 (tiny)
 * Scan SMF buffer with MIDIFile.js and mirror first CC0/32/PC per channel into MIX16.
 */
(function(){
  'use strict';
  if (window.SMFInject) return;

  function send(bytes){
    try{
      if (window.__MIX16 && typeof __MIX16.filter === 'function'){
        var out = __MIX16.filter(bytes);
        if (out && typeof __MIX16.refreshNames === 'function'){
          __MIX16.refreshNames({ fallback: false });
        }
      }
    }catch(_){}
    return bytes;
  }
  function mkPC(ch, pg){ return new Uint8Array([0xC0 | (ch & 0x0F), pg & 0x7F]); }
  function mkCC(ch, cc, val){ return new Uint8Array([0xB0 | (ch & 0x0F), cc & 0x7F, val & 0x7F]); }

  function getEvents(mf){
    try{
      if (typeof mf.getMidiEvents === 'function') return mf.getMidiEvents() || [];
      if (typeof mf.getEvents     === 'function') return mf.getEvents()     || [];
    }catch(_){}
    return [];
  }

  function preinject(arrayBuf){
    try{
      if (!arrayBuf || typeof MIDIFile !== 'function') return false;
      var mf  = new MIDIFile(arrayBuf);
      var evs = getEvents(mf);
      if (!Array.isArray(evs) || evs.length === 0) return false;

      var msb = new Array(16).fill(null);
      var lsb = new Array(16).fill(null);
      var pc  = new Array(16).fill(null);

      for (var i=0; i<evs.length; i++){
        var e  = evs[i] || {};
        var ch = e.channel;
        if (ch == null || ch < 0 || ch > 15) continue;

        var st = e.subtype, tp = e.type, et = e.eventType;

        // CC0/32
        if (st==='controller' || tp==='controller' || et==='controller' || st===0xB0){
          var c = (e.param1!=null)?e.param1:(e.control!=null)?e.control:(e.controller!=null)?e.controller:null;
          var v = (e.param2!=null)?e.param2:(e.value  !=null)?e.value  :null;
          if (c===0  && v!=null && msb[ch]==null) msb[ch]=(v&0x7F);
          if (c===32 && v!=null && lsb[ch]==null) lsb[ch]=(v&0x7F);
        }
        // Program Change
        if (st==='programChange' || tp==='programChange' || et==='programChange' || st===0xC0){
          var p = (e.param1!=null)?e.param1:(e.program!=null)?e.program:(e.value!=null)?e.value:0;
          if (pc[ch]==null) pc[ch]=(p&0x7F);
        }
      }

      var any=false;
      for (var c=0; c<16; c++){
        if (msb[c]!=null) { send(mkCC(c,0,  msb[c])); any=true; }
        if (lsb[c]!=null) { send(mkCC(c,32, lsb[c])); any=true; }
        if (pc[c] !=null) { send(mkPC(c,    pc[c] )); any=true; }
      }
      return any;
    }catch(_){ return false; }
  }

  window.SMFInject = { preinject: preinject };
})();


async function playSong(rel,name){ if(busy) return; busy=true; try{ await ensureSynth(); if(ac.state!=='running'){try{await ac.resume();}catch(e){}} if(!sfSelected){alert('Please select a SoundFont first.'); return;} if(pendingSF){ sfSelected=pendingSF; pendingSF=null; } setStatus('APPLYING SF…'); await applyCurrentSF(); setStatus('LOADING SONG…'); setLoading(true,'Loading song…'); var my=++token; var url=PATH_MIDI_BASE+encodePath(rel); var res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('MIDI HTTP '+res.status); var buf=await res.arrayBuffer(); lastMIDIBuf=buf.slice(0);
window.SMFInject && SMFInject.preinject(buf);
lastPlayed={rel:rel,name:(name||rel)}; try{var lyr=buildLyricsJSONFromMIDI(buf); renderLyrics(lyr); }catch(e){ console.warn('Lyrics parse failed',e);} if(my!==token) return; await synth.addSMFDataToPlayer(buf); songStart=ac.currentTime; await synth.playPlayer(); if(my!==token) return; isPlaying=true; ui.stop.disabled=false; ui.resume.disabled=false; currentSong=rel; highlightNow(rel); setNowPlaying(rel,lastPlayed.name); setStatus('PLAYING'); runTimers(); startLyricsClock(); if(synth.waitForPlayerStopped){ synth.waitForPlayerStopped().then(async function(){ if(my===token){isPlaying=false; ui.stop.disabled=true; setNowPlaying(null,null); setStatus('IDLE'); if(pendingSF){ sfSelected=pendingSF; pendingSF=null; await applyCurrentSF(); rememberSF(sfSelected); } await feedNextIfAny(); }});} }catch(e){console.error(e); alert('Cannot load/play file.\n'+e.message);} finally{ setLoading(false); busy=false; }}

async function resumePlay(){ if(busy||isPlaying) return; busy=true; try{ await ensureSynth(); if(ac.state!=='running'){try{await ac.resume();}catch(e){}} if(!sfSelected){alert('Please select a SoundFont first.'); return;} if(lastMIDIBuf){ if(pendingSF){ sfSelected=pendingSF; pendingSF=null; } await applyCurrentSF(); setStatus('LOADING SONG…'); var my=++token; 
window.SMFInject && SMFInject.preinject(lastMIDIBuf);
await synth.addSMFDataToPlayer(lastMIDIBuf.slice(0)); songStart=ac.currentTime; await synth.playPlayer(); if(my!==token) return; isPlaying=true; ui.stop.disabled=false; currentSong=lastPlayed?lastPlayed.rel:null; highlightNow(currentSong||''); setNowPlaying(currentSong, lastPlayed?lastPlayed.name:null); setStatus('PLAYING'); runTimers(); ensureLyWin(); startLyricsClock(); if(synth.waitForPlayerStopped){ synth.waitForPlayerStopped().then(async function(){ if(my===token){isPlaying=false; ui.stop.disabled=true; setNowPlaying(null,null); setStatus('IDLE'); if(pendingSF){ sfSelected=pendingSF; pendingSF=null; await applyCurrentSF(); rememberSF(sfSelected); } await feedNextIfAny(); }});} return;} if(lastPlayed){ await playSong(lastPlayed.rel,lastPlayed.name); return;} await feedNextIfAny(); } finally{ busy=false; }}

function isFS(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function enterFS(){ var el=document.documentElement; if(el.requestFullscreen) return el.requestFullscreen(); if(el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); }
function exitFS(){ if(document.exitFullscreen) return document.exitFullscreen(); if(document.webkitExitFullscreen) return document.webkitExitFullscreen(); }
function updateFSButton(){ ui.fsToggle.textContent = isFS() ? '⤢' : '⛶'; ui.fsToggle.title = isFS()? 'Exit Fullscreen' : 'Enter Fullscreen'; }
ui.fsToggle.addEventListener('click', function(){ if(isFS()){ exitFS(); } else { enterFS(); } });
document.addEventListener('fullscreenchange', function(){ syncVizSize(); updateFSButton(); });
document.addEventListener('webkitfullscreenchange', function(){ syncVizSize(); updateFSButton(); });

var sfPolicy = localStorage.getItem('sfChangePolicy')||'ask';
var __SF_SUPPRESS_CHANGE__ = false; var __lastVisibleValue = '';
function showSFToast(msg, onNow, onNext, onCancel){ ui.sfToastMsg.textContent = msg||''; ui.sfToast.classList.add('visible'); const close=()=>{ui.sfToast.classList.remove('visible'); try{ if(ui.ccSfPolicy){ ui.ccSfPolicy.querySelectorAll('button').forEach(b=>{ b.classList.toggle('active', (b.getAttribute('data-pol')||'')===sfPolicy); }); } }catch(e){} }; ui.sfApplyNow.onclick=function(){ if(ui.sfRemember.checked){ localStorage.setItem('sfChangePolicy','now'); sfPolicy='now'; } close(); onNow&&onNow(); ui.sfRemember.checked=false; }; ui.sfApplyNext.onclick=function(){ if(ui.sfRemember.checked){ localStorage.setItem('sfChangePolicy','next'); sfPolicy='next'; } close(); onNext&&onNext(); ui.sfRemember.checked=false; }; ui.sfCancel.onclick=function(){ if(ui.sfRemember.checked){ localStorage.setItem('sfChangePolicy','ask'); sfPolicy='ask'; } close(); onCancel&&onCancel(); ui.sfRemember.checked=false; }; }
function rememberSF(v){ try{ localStorage.setItem('sfSelectedRel', v||''); }catch(e){} }

ui.sfSelect.addEventListener('focus', function(){ __lastVisibleValue = ui.sfSelect.value; });
ui.sfSelect.addEventListener('change', async function(){ if(__SF_SUPPRESS_CHANGE__) return; var v = ui.sfSelect.value||''; if(!v){ui.start.disabled=true; ui.resume.disabled=true; setStatus('READY'); return;} if(!isPlaying){ sfSelected=v; pendingSF=null; setStatus('READY'); ui.start.disabled=false; ui.resume.disabled=false; rememberSF(sfSelected); // mirror to CC
  if(ui.ccSf){ try{ __SF_SUPPRESS_CHANGE__=true; ui.ccSf.value=v; } finally{ __SF_SUPPRESS_CHANGE__=false; } }
  return; }
  var label = (ui.sfSelect.options[ui.sfSelect.selectedIndex]?.textContent||v).trim();
  if(sfPolicy==='now'){
    __SF_SUPPRESS_CHANGE__=true; try{ ui.sfSelect.value=__lastVisibleValue || ui.sfSelect.value; } finally{ __SF_SUPPRESS_CHANGE__=false; }
    showSFToast('Apply "'+label+'" now? (Playback will stop)', async function(){ await quietStop(); sfSelected=v; pendingSF=null; await applyCurrentSF(); rememberSF(sfSelected); setStatus('Applied SF now: '+label); ui.start.disabled=false; ui.resume.disabled=false; if(ui.ccSf){ ui.ccSf.value=v; } }, function(){ pendingSF=v; setStatus('Will apply SF on next song: '+label); if(ui.ccSf){ ui.ccSf.value=v; } }, function(){ /*cancel*/ });
    return;
  }
  if(sfPolicy==='next'){
    pendingSF=v; setStatus('Will apply SF on next song: '+label); __SF_SUPPRESS_CHANGE__=true; try{ ui.sfSelect.value=__lastVisibleValue || ui.sfSelect.value; } finally{ __SF_SUPPRESS_CHANGE__=false; } if(ui.ccSf){ ui.ccSf.value=v; } return;
  }
  __SF_SUPPRESS_CHANGE__=true; try{ ui.sfSelect.value=__lastVisibleValue || ui.sfSelect.value; } finally{ __SF_SUPPRESS_CHANGE__=false; }
  showSFToast('Switch SoundFont to "'+label+'"?', async function(){ await quietStop(); sfSelected=v; pendingSF=null; await applyCurrentSF(); rememberSF(sfSelected); setStatus('Applied SF now: '+label); ui.start.disabled=false; ui.resume.disabled=false; if(ui.ccSf){ ui.ccSf.value=v; } }, function(){ pendingSF=v; setStatus('Will apply SF on next song: '+label); if(ui.ccSf){ ui.ccSf.value=v; } }, function(){ /*cancel*/ });
});

ui.start.addEventListener('click', async function(){ if(busy) return; busy=true; try{ await ensureSynth(); await ac.resume(); syncVizSize(); runTimers(); if(!sfSelected){alert('Please select a SoundFont first.'); return;} await applyCurrentSF(); rememberSF(sfSelected); setStatus('IDLE'); }catch(e){alert(e.message);} finally{ busy=false; }});
ui.stop.addEventListener('click', async function(){ if(busy) return; busy=true; try{ await quietStop(); if(pendingSF){ sfSelected=pendingSF; pendingSF=null; await applyCurrentSF(); rememberSF(sfSelected); } await feedNextIfAny(); } finally{ busy=false; }});
ui.resume.addEventListener('click', async function(){ await resumePlay(); });
ui.showBrowser.addEventListener('click', function(){ WM && WM.browser && WM.browser.show();}); ui.showQueue.addEventListener('click', function(){ WM && WM.queue && WM.queue.show();}); ui.showLyrics.addEventListener('click', function(){ WM && WM.lyrics && WM.lyrics.show();}); ui.showBG.addEventListener('click', function(){ WM && WM.bg && WM.bg.show(); updateBGPanelUI();});

if (ui.volRange){ ui.volRange.addEventListener('input', function(e){ setVolume(parseInt(e.target.value,10)/100); }); ui.volRange.value = Math.round(volume*100); ui.volRange.setAttribute('title','Volume: '+Math.round(volume*100)+'%'); }

// Song list clicks with power gestures
ui.list.addEventListener('click', function(e){var a=e.target.closest?e.target.closest('a.song'):null; if(!a) return; e.preventDefault(); var rel=a.getAttribute('data-path'); var name=a.textContent.trim(); var path=a.getAttribute('title'); if(e.altKey){ (async function(){ if(isPlaying){ await quietStop(); } 

await playSong(rel,name); })(); return; } if(isPlaying){ if(e.shiftKey){ q.unshift({rel:rel,name:name,path:path}); } else { q.push({rel:rel,name:name,path:path}); } renderQueue(); } else { playSong(rel,name); }});
ui.queueList.addEventListener('click', function(e){var row=e.target.closest('.row'); if(!row) return; var idx=parseInt(row.getAttribute('data-idx'),10); if(isNaN(idx)) return; var t=e.target.textContent.trim(); if(t==='✕'){ q.splice(idx,1); renderQueue(); } else if(t==='▲'){ if(idx>0){var tmp=q[idx]; q[idx]=q[idx-1]; q[idx-1]=tmp; renderQueue(); } } else if(t==='▼'){ if(idx<q.length-1){ var tmp=q[idx]; q[idx]=q[idx+1]; q[idx+1]=tmp; renderQueue(); } } else if(t==='Next'){ var it=q.splice(idx,1)[0]; q.unshift(it); renderQueue(); if(!isPlaying){ feedNextIfAny(); } }});

// Space + extras
document.addEventListener('keydown', function(e){ if(e.repeat) return; var tag=(e.target&&e.target.tagName)||''; if(/INPUT|TEXTAREA|SELECT/.test(tag)) return; if(e.code==='Space'||e.key===' '){ e.preventDefault(); if(isPlaying){ ui.stop.click(); } else { resumePlay(); } } if (e.key && e.key.toLowerCase()==='f'){ ui.fsToggle.click(); } if (e.key && e.key.toLowerCase()==='l'){ WM && WM.lyrics && WM.lyrics.toggle && WM.lyrics.toggle(); } });

// Browser Search
(function(){ if (!ui.browserSearch || !ui.list) return; const list=document.getElementById('playlist'); const rows=Array.from(list.querySelectorAll('.row')); const countEl=ui.browserSearchCount; const inputEl=ui.browserSearch; const clearBtn=ui.browserSearchClear; rows.forEach(r=>{ const a=r.querySelector('a.song'); if (a && !a.dataset.name) a.dataset.name=(a.textContent||'').trim();}); function escapeReg(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');} function highlightMatch(anchor,query){ if(!anchor) return; const original=anchor.dataset.name||anchor.textContent||''; if(!query){ anchor.textContent=original; return;} const re=new RegExp(escapeReg(query),'ig'); const parts=original.split(re); const matches=original.match(re); if(!matches){ anchor.textContent=original; return;} let html=''; for(let i=0;i<parts.length;i++){ html+=escapeHtml(parts[i]); if(i<matches.length) html+='<mark class="match">'+escapeHtml(matches[i])+'</mark>'; } anchor.innerHTML=html; } function itemText(row){ const a=row.querySelector('a.song'); const name=a?(a.dataset.name||a.textContent||''):''; const path=a?(a.getAttribute('title')||''):''; return (name+' '+path).toLowerCase(); } function setCount(shown,total){ if(!countEl) return; countEl.textContent=(shown===total)?`${total}`:`${shown} of ${total}`; } function filter(q){ const query=(q||'').trim().toLowerCase(); localStorage.setItem('browserSearch', q||''); let shown=0; const total=rows.length; rows.forEach(r=>{ const a=r.querySelector('a.song'); if(!a){ r.style.display=''; return;} const ok=!query || itemText(r).indexOf(query)!==-1; r.style.display=ok?'':'none'; if(ok){ shown++; } highlightMatch(a, query); }); setCount(shown,total); } function debounce(fn,ms){ let t=null; return function(){ clearTimeout(t); const args=arguments; t=setTimeout(()=>fn.apply(this,args), ms); }; } const onType=debounce(function(){ filter(inputEl.value); },80); inputEl.addEventListener('input', onType); clearBtn && clearBtn.addEventListener('click', function(){ inputEl.value=''; filter(''); inputEl.focus(); }); const saved=localStorage.getItem('browserSearch')||''; if(saved){ inputEl.value=saved; filter(saved);} else { filter(''); } document.addEventListener('keydown', function(e){ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){ if (ui.browserPanel && ui.browserPanel.classList.contains('visible')){ e.preventDefault(); inputEl.focus(); } } }); inputEl.addEventListener('keydown', function(e){ if(e.key==='Enter'){ const first=rows.find(r=>r.style.display!=='none'); const a=first&&first.querySelector('a.song'); if(a){ a.click(); } } }); })();

// Background engine (refined)
var BG=(function(){
  var mode=localStorage.getItem('bgMode') || (BG_VIDEOS.length? 'video' : (BG_IMAGES.length? 'images' : 'gradient'));
  var shuffle=(localStorage.getItem('bgShuffle')||'on')==='on';
  var imgDur=parseInt(localStorage.getItem('bgImgDur')||'12000',10)||12000;
  var paused=(localStorage.getItem('bgPaused')||'off')==='on';
  var gradients=BG_GRADIENTS.slice();
  var iv=null;

  var stage=document.getElementById('bgStage');
  var vA=document.getElementById('bgVideo');
  var vB=document.getElementById('bgVideoB');
  if(!vB){ vB=document.createElement('video'); vB.id='bgVideoB'; vB.className='layer'; vB.setAttribute('muted',''); vB.muted=true; vB.setAttribute('playsinline',''); stage.insertBefore(vB, stage.querySelector('#bgImage')); }
  var img=document.getElementById('bgImage'), grad=document.getElementById('bgGrad'), col=document.getElementById('bgColor');
  [vA,vB].forEach(function(v){ v.playsInline=true; v.muted=true; });

  var front=vA, back=vB; function swap(){ var t=front; front=back; back=t; }
  function layerOn(el){ [vA,vB,img,grad,col].forEach(function(e){ (e===el)?e.classList.add('on'):e.classList.remove('on'); }); }
  function stopVideo(v){ try{ v.pause(); v.removeAttribute('src'); v.load(); }catch(e){} }
  function stopAllVideo(){ stopVideo(vA); stopVideo(vB); }
  function afterFirstFrame(video, cb){ var done=false; function go(){ if(done) return; done=true; video.play().catch(function(){}).then(cb).catch(cb); } if(video.readyState>=2){ go(); } else { var once=function(){ video.removeEventListener('loadeddata', once); go(); }; video.addEventListener('loadeddata', once); } }
  function fadeToVideo(url){ if(!url) return; clearInterval(iv); try{ back.pause(); }catch(e){} back.src=url; back.currentTime=0; back.onerror=function(){ try{ back.onerror=null; }catch(e){} next(); }; afterFirstFrame(back, function(){ back.classList.add('on'); front.classList.remove('on'); setTimeout(function(){ layerOn(back); try{ front.pause(); front.removeAttribute('src'); front.load(); }catch(e){} swap(); front.onended=function(){ if(!paused){ next(); } }; front.onerror=function(){ next(); }; }, 600); }); }
  function applyImage(url){ if(!url) return; stopAllVideo(); img.onerror=function(){ next(); }; img.src=url; layerOn(img); }
  function applyGradient(css){ stopAllVideo(); grad.style.background=css||'linear-gradient(135deg,#111,#333)'; layerOn(grad); }
  function applyColor(css){ stopAllVideo(); col.style.background=css||'#000'; layerOn(col); }
  function save(){ localStorage.setItem('bgMode',mode); localStorage.setItem('bgShuffle', shuffle?'on':'off'); localStorage.setItem('bgImgDur', String(imgDur)); localStorage.setItem('bgPaused', paused?'on':'off'); }
  function makeOrder(arr){ var a=arr.slice(); if(shuffle){ for(var i=a.length-1;i>0;i--){ var j=(Math.random()* (i+1))|0; var t=a[i]; a[i]=a[j]; a[j]=t; } } return a; }
  var bagVideo={order:[],idx:0,src:BG_VIDEOS}; var bagImage={order:[],idx:0,src:BG_IMAGES};
  function refill(bag){ bag.order = makeOrder(bag.src); bag.idx=0; }
  function nextFrom(bag){ if(!bag.src.length) return null; if(bag.idx>=bag.order.length){ refill(bag); } var x=bag.order[bag.idx++]; if (bag === bagVideo) localStorage.setItem('bgVidIdx', String(bag.idx)); if (bag === bagImage) localStorage.setItem('bgImgIdx', String(bag.idx)); return x; }
  function prevFrom(bag){ if(!bag.src.length) return null; if(bag.idx<=1){ bag.idx = Math.max(0,bag.order.length-1); } else { bag.idx-=2; } if (bag === bagVideo) localStorage.setItem('bgVidIdx', String(bag.idx)); if (bag === bagImage) localStorage.setItem('bgImgIdx', String(bag.idx)); return nextFrom(bag); }
  function clearTimer(){ if(iv){ clearInterval(iv); iv=null; } }
  function setMode(m){ if(m===mode) return; if(mode==='video' && m!=='video'){ stopAllVideo(); } mode=m; save(); schedule(true); updateBGPanelUI(); }
  function setShuffle(on){ shuffle=!!on; save(); refill(bagVideo); refill(bagImage); updateBGPanelUI(); }
  function setImgDur(ms){ imgDur=Math.max(1000,Math.min(120000, ms||12000)); save(); if((mode==='images'||mode==='gradient'||mode==='color') && iv){ clearTimer(); if(!paused) iv=setInterval(next, imgDur); } updateBGPanelUI(); }
  function setPaused(p){ paused=!!p; save(); if(mode==='video'){ try{ paused ? front.pause() : front.play().catch(function(){}); }catch(e){} } else { if(paused) clearTimer(); else { clearTimer(); iv=setInterval(next, imgDur); } } updateBGPanelUI(); }
  function next(){ if(mode==='video'){ var u=nextFrom(bagVideo); if(u) fadeToVideo(u); return; } if(mode==='images'){ var u2=nextFrom(bagImage); if(u2) applyImage(u2); return; } if(mode==='gradient'){ var k=(parseInt(localStorage.getItem('bgGradIdx')||'0',10)||0)+1; if(k>=gradients.length)k=0; localStorage.setItem('bgGradIdx',String(k)); applyGradient(gradients[k]); return; } if(mode==='color'){ var colors=['#000000','#111111','#0b132b','#1f1f1f','#101010']; var c=(parseInt(localStorage.getItem('bgColIdx')||'0',10)||0)+1; if(c>=colors.length)c=0; localStorage.setItem('bgColIdx',String(c)); applyColor(colors[c]); return; } }
  function prev(){ if(mode==='video'){ var u=prevFrom(bagVideo); if(u) fadeToVideo(u); return; } if(mode==='images'){ var u=prevFrom(bagImage); if(u) applyImage(u); return; } }
  function schedule(force){ clearTimer(); if(mode==='video' && bagVideo.src.length){ if(!bagVideo.order.length) refill(bagVideo); var idx=parseInt(localStorage.getItem('bgVidIdx')||'0',10)||0; if(idx<0||idx>=bagVideo.src.length){ idx=0; } refill(bagVideo); for(var i=0;i<idx;i++) nextFrom(bagVideo); var u=nextFrom(bagVideo); front.src=u; front.currentTime=0; front.onerror=function(){ next(); }; if(!paused){ try{ front.play().catch(function(){}); }catch(e){} } layerOn(front); front.onended=function(){ if(!paused){ next(); } } }
    else if(mode==='images' && bagImage.src.length){ if(!bagImage.order.length) refill(bagImage); var j=parseInt(localStorage.getItem('bgImgIdx')||'0',10)||0; if(j<0||j>=bagImage.src.length){ j=0; } refill(bagImage); for (var k=0;k<j;k++) nextFrom(bagImage); var u2=nextFrom(bagImage); applyImage(u2); if(!paused){ iv=setInterval(next, imgDur); } }
    else if(mode==='gradient'){ var gidx=parseInt(localStorage.getItem('bgGradIdx')||'0',10)||0; gidx=Math.max(0,Math.min(gradients.length-1,gidx)); applyGradient(gradients[gidx]); if(!paused){ iv=setInterval(next, imgDur); } }
    else if(mode==='color'){ var cidx=parseInt(localStorage.getItem('bgColIdx')||'0',10)||0; var colors=['#000000','#111111','#0b132b','#1f1f1f','#101010']; cidx=Math.max(0,Math.min(colors.length-1,cidx)); applyColor(colors[cidx]); if(!paused){ iv=setInterval(next, imgDur); } }
  }
  function init(){ bagVideo.src = (BG_VIDEOS||[]).slice(); bagImage.src = (BG_IMAGES||[]).slice(); refill(bagVideo); refill(bagImage); if(ui.bgGradSel){ ui.bgGradSel.innerHTML = gradients.map(function(g,i){return '<option value="'+i+'">Gradient '+(i+1)+'</option>';}).join(''); var gi=parseInt(localStorage.getItem('bgGradIdx')||'0',10)||0; if(gi<0||gi>=gradients.length) gi=0; ui.bgGradSel.value=String(gi); ui.bgGradSel.addEventListener('change', function(){ var v=parseInt(ui.bgGradSel.value,10)||0; localStorage.setItem('bgGradIdx', String(v)); applyGradient(gradients[v]); }); } if(ui.bgShuffle){ ui.bgShuffle.checked = shuffle; ui.bgShuffle.addEventListener('change', function(){ setShuffle(ui.bgShuffle.checked); }); } if(ui.bgImgDur){ ui.bgImgDur.value = imgDur; ui.bgImgDurLabel.textContent = Math.round(imgDur/1000)+'s'; ui.bgImgDur.addEventListener('input', function(){ ui.bgImgDurLabel.textContent = Math.round(parseInt(this.value,10)/1000)+'s'; }); ui.bgImgDur.addEventListener('change', function(){ setImgDur(parseInt(this.value,10)); }); } if(ui.bgColorPicker){ ui.bgColorPicker.addEventListener('input', function(){ localStorage.setItem('bgColor', this.value); applyColor(this.value); }); var savedC=localStorage.getItem('bgColor'); if(savedC){ ui.bgColorPicker.value=savedC; } } document.querySelectorAll('[data-bgmode]').forEach(function(b){ b.addEventListener('click', function(){ document.querySelectorAll('[data-bgmode]').forEach(function(x){x.classList.remove('active');}); b.classList.add('active'); setMode(b.getAttribute('data-bgmode')); }); }); schedule(true); updateBGPanelUI(); }
  function stats(){ var parts=[]; parts.push('Mode: '+mode); if(mode==='video'){ parts.push('Videos: '+bagVideo.src.length); } if(mode==='images'){ parts.push('Images: '+bagImage.src.length+' @'+Math.round(imgDur/1000)+'s'); } parts.push('Shuffle: '+(shuffle?'On':'Off')); parts.push(paused?'Paused':'Playing'); return parts.join(' | '); }
  return { init:init, setMode:setMode, next:next, prev:prev, setPaused:setPaused, setShuffle:setShuffle, setImgDur:setImgDur, _stats:stats };
})();

function updateBGPanelUI(){ if(!ui.bgPanel) return; var mode=localStorage.getItem('bgMode')||'images'; document.querySelectorAll('[data-bgmode]').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-bgmode')===mode); }); document.getElementById('bgRowShuffle').style.display = (mode==='video'||mode==='images')?'flex':'none'; document.getElementById('bgRowImgDur').style.display = (mode==='images'||mode==='gradient'||mode==='color')?'flex':'none'; document.getElementById('bgRowGrad').style.display = (mode==='gradient')?'flex':'none'; document.getElementById('bgRowColor').style.display = (mode==='color')?'flex':'none'; if(ui.bgStats) ui.bgStats.textContent = BG._stats(); }

// === Window Manager init ===
(function(){ const STORE='wm:'; let z=200; function clamp(v,a,b){return Math.max(a,Math.min(b,v));} function rect(el){return el.getBoundingClientRect();} function save(k,d){try{localStorage.setItem(STORE+k,JSON.stringify(d));}catch(e){}} function load(k){try{return JSON.parse(localStorage.getItem(STORE+k)||'null');}catch(e){return null;}} function stateOf(win){return{left:parseInt(win.style.left||'0',10)||0,top:parseInt(win.style.top||'0',10)||0,width:win.offsetWidth,height:win.offsetHeight,minimized:win.classList.contains('minimized'),maximized:win.classList.contains('maximized')};} function persist(win,key){save(key,stateOf(win));} function restoreWithinViewport(win){const r=rect(win); if(r.width===0&&r.height===0) return; let L=clamp(r.left,0,Math.max(0,innerWidth-r.width));let T=clamp(r.top,0,Math.max(0,innerHeight-r.height));win.style.left=L+'px';win.style.top=T+'px';}
  function restore(win,key){const st=load(key); if(!st) return; if(typeof st.left==='number')win.style.left=st.left+'px'; if(typeof st.top==='number')win.style.top=st.top+'px'; if(typeof st.width==='number')win.style.width=st.width+'px'; if(typeof st.height==='number')win.style.height=st.height+'px'; if(st.minimized)win.classList.add('minimized'); if(st.maximized)win.classList.add('maximized'); restoreWithinViewport(win);} 
  function bringToFront(win){
  // Option A: lyrics window must not auto-front; respect CSS --z-lyrics
  if (win.id === 'lyWin') return;

  // Keep WM windows below overlays (toast=600, spinner=1000)
  z = clamp(z + 1, 200, 590);
  win.style.zIndex = String(z);
}
  
  function addChrome(win,head,key){const right=head.querySelector('.wm-chrome')||(function(){const span=head.querySelector('span:last-child');const box=document.createElement('span');box.className='wm-chrome'; if(span) span.parentNode.insertBefore(box,span); else head.appendChild(box); return box;})(); const mk=(t,tt)=>{const b=document.createElement('button'); b.className='wm-btn'; b.textContent=t; b.title=tt; return b;}; const bMin=mk('—','Minimize'); const bMax=mk('▢','Maximize/Restore'); right.prepend(bMax); right.prepend(bMin); bMin.addEventListener('click',()=>{win.classList.toggle('minimized'); win.classList.remove('maximized'); persist(win,key);}); bMax.addEventListener('click',()=>{const was=win.classList.contains('maximized'); if(was){win.classList.remove('maximized'); restoreWithinViewport(win);} else {win.classList.remove('minimized'); win.classList.add('maximized');} persist(win,key);}); }
  function bindGrip(win,grip,key){ if(grip.dataset.rszBound==='1') return; grip.dataset.rszBound='1'; const onDown=(e)=>{ if(win.classList.contains('maximized')) return; bringToFront(win); const r=rect(win); const startX=('touches' in e ? e.touches[0].clientX : e.clientX); const startY=('touches' in e ? e.touches[0].clientY : e.clientY); const startW=r.width, startH=r.height, startL=r.left, startT=r.top; const cs=getComputedStyle(win); const minW=Math.max(parseInt(cs.minWidth,10)||0, 200); const minH=Math.max(parseInt(cs.minHeight,10)||0, 140); const maxW=Math.max(minW, innerWidth - startL); const maxH=Math.max(minH, innerHeight - startT); try{ if(key==='lyrics'){ localStorage.setItem(STORE+key+':free','on'); win.classList.add('free'); } }catch(err){} const onMove=(ev)=>{ const x=('touches' in ev ? ev.touches[0].clientX : ev.clientX); const y=('touches' in ev ? ev.touches[0].clientY : ev.clientY); let w=startW + (x - startX); let h=startH + (y - startY); w=Math.max(minW, Math.min(maxW, w)); h=Math.max(minH, Math.min(maxH, h)); win.style.width=w+'px'; win.style.height=h+'px'; }; const stop=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',stop); document.removeEventListener('touchmove',onMove,{passive:false}); document.removeEventListener('touchend',stop); persist(win,key); }; document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',stop); document.addEventListener('touchmove',onMove,{passive:false}); document.addEventListener('touchend',stop); e.preventDefault(); }; grip.addEventListener('mousedown',onDown); grip.addEventListener('touchstart',onDown,{passive:false}); }
  function addResizer(win,key){ let grip=win.querySelector('.wm-grip'); if(!grip){ grip=document.createElement('div'); grip.className='wm-grip'; win.appendChild(grip); } bindGrip(win,grip,key); }
  function startDrag(win,head,key,e){ if(win.classList.contains('maximized')) return; bringToFront(win); const r=rect(win); const sx=('touches'in e?e.touches[0].clientX:e.clientX), sy=('touches'in e?e.touches[0].clientY:e.clientY); const ox=sx-r.left, oy=sy-r.top; const onMove=(ev)=>{const x=('touches'in ev?ev.touches[0].clientX:ev.clientX), y=('touches'in ev?ev.touches[0].clientY:ev.clientY); let L=x-ox, T=y-oy; const W=win.offsetWidth, H=win.offsetHeight; L=clamp(L,0,innerWidth-W); T=clamp(T,0,innerHeight-Math.min(H,innerHeight)); win.style.left=L+'px'; win.style.top=T+'px'; win.style.right='auto'; win.style.bottom='auto';}; const stop=()=>{document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',stop);document.removeEventListener('touchmove',onMove,{passive:true});document.removeEventListener('touchend',stop); persist(win,key);}; document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',stop); document.addEventListener('touchmove',onMove,{passive:true}); document.addEventListener('touchend',stop);} 
  
  function initWindow(sel, headSel, key){ const win=document.querySelector(sel); if(!win) return; const head=win.querySelector(headSel); if(!head) return; win.style.position='fixed';
  if (win.id === 'lyWin') {
  // Let CSS control stacking for lyrics
  win.style.removeProperty('z-index');
} else {
  win.style.zIndex = String(++z);
}
  addChrome(win,head,key); addResizer(win,key); head.addEventListener('mousedown',(e)=>startDrag(win,head,key,e)); head.addEventListener('touchstart',(e)=>startDrag(win,head,key,e),{passive:true}); head.addEventListener('dblclick',()=>{const was=win.classList.contains('maximized'); if(was){win.classList.remove('maximized'); restoreWithinViewport(win);} else {win.classList.remove('minimized'); win.classList.add('maximized');} persist(win,key);}); win.addEventListener('mousedown',()=>bringToFront(win)); window.addEventListener('resize',()=>restoreWithinViewport(win)); restore(win,key); try{ if(localStorage.getItem(STORE+key+':free')==='on'){ win.classList.add('free'); } }catch(e){} return {show(){win.classList.remove('minimized'); win.classList.remove('maximized'); win.classList.add('visible'); bringToFront(win); restoreWithinViewport(win);}, hide(){win.classList.remove('visible');}, toggle(){win.classList.toggle('visible'); if(win.classList.contains('visible')) {win.classList.remove('minimized'); win.classList.remove('maximized'); bringToFront(win); restoreWithinViewport(win);} }, element:win}; }
  
  window.WM={ init(){ this.browser=initWindow('#browserPanel','.drag','browser'); this.queue=initWindow('#queuePanel','.drag','queue'); this.lyrics=initWindow('#lyWin','#lyHead','lyrics'); this.bg=initWindow('#bgPanel','.drag','bg'); this.cc=initWindow('#ccPanel','.drag','cc'); } };
})();
WM.init();

// === Micro‑dock (with gear button for CC) ===
(function(){
  var dock = document.createElement('div');
  dock.id='microDock'; dock.className='mdock'; dock.setAttribute('role','group'); dock.setAttribute('aria-label','Quick controls');
  dock.innerHTML = '\
    <button id="mdLyPin" class="md-btn" title="Lyrics Stay (pin)" aria-pressed="false">📌</button>\
    <button id="mdFS" class="md-btn" title="Fullscreen">⛶</button>\
    <button id="mdCC" class="md-btn" title="Control Center">⚙</button>\
    <div class="md-split">\
      <button id="mdPanel" class="md-btn md-main" title="Panels">☰</button>\
      <div id="mdPanelMenu" class="md-menu" aria-label="Panels menu">\
        <button data-open="browser" class="md-item">Browser</button>\
        <button data-open="queue"   class="md-item">Queue</button>\
        <button data-open="bg"      class="md-item">Backgrounds</button>\
        <button data-open="lyrics"  class="md-item">Lyrics</button>\
      </div>\
    </div>';
  document.body.appendChild(dock);
  const btnPin=dock.querySelector('#mdLyPin');
  const btnFS=dock.querySelector('#mdFS');
  const btnCC=dock.querySelector('#mdCC');
  const btnMain=dock.querySelector('#mdPanel');
  const menu=dock.querySelector('#mdPanelMenu');
  const lyEl=document.getElementById('lyWin');
  const KEY='lyricsStay';
  let stay=(localStorage.getItem(KEY)||'off')==='on';
  function applyPinUI(){ btnPin.classList.toggle('active',stay); btnPin.setAttribute('aria-pressed', String(stay)); }
  function ensureLyricsVisible(){ if(stay && lyEl && !lyEl.classList.contains('visible')){ try{ WM && WM.lyrics && WM.lyrics.show && WM.lyrics.show(); }catch(e){} } }
  applyPinUI(); if(stay) ensureLyricsVisible();
  btnPin.addEventListener('click', function(){ stay=!stay; localStorage.setItem(KEY, stay?'on':'off'); applyPinUI(); ensureLyricsVisible(); if(ui.ccPinLyrics){ ui.ccPinLyrics.classList.toggle('active', stay); } });
  if (window.MutationObserver && lyEl){ const mo=new MutationObserver(()=>ensureLyricsVisible()); mo.observe(lyEl,{attributes:true,attributeFilter:['class']}); }
  btnFS.addEventListener('click', function(){ try{ if(typeof isFS==='function'&&typeof enterFS==='function'&&typeof exitFS==='function'){ isFS()? exitFS(): enterFS(); } else { document.getElementById('fsToggle')?.click(); } }catch(e){} });
  function toggleMenu(open){ const willOpen=(open==null)? !menu.classList.contains('open'): !!open; menu.classList.toggle('open', willOpen); btnMain.classList.toggle('active', willOpen); }
  btnMain.addEventListener('click', ()=>toggleMenu());
  menu.addEventListener('click', (e)=>{ const b=e.target.closest('[data-open]'); if(!b) return; const t=b.getAttribute('data-open'); try{ if(t==='browser') WM?.browser?.show?.(); else if(t==='queue') WM?.queue?.show?.(); else if(t==='bg') WM?.bg?.show?.(); else if(t==='lyrics') WM?.lyrics?.show?.(); }catch(e){} toggleMenu(false); });
  document.addEventListener('click', (e)=>{ if(!dock.contains(e.target)) toggleMenu(false); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') toggleMenu(false); });
  btnCC.addEventListener('click', ()=>{ WM && WM.cc && WM.cc.toggle && WM.cc.toggle(); });
})();

// === Control Center wiring ===
(function(){ if(!ui.ccPanel) return;
  // Transport
  ui.ccStart && ui.ccStart.addEventListener('click', ()=> ui.start.click());
  ui.ccResume && ui.ccResume.addEventListener('click', ()=> ui.resume.click());
  ui.ccSkip && ui.ccSkip.addEventListener('click', ()=> ui.stop.click());
  // Volume
  if(ui.ccVol){ ui.ccVol.value = Math.round((volume||0.9)*100); ui.ccVolLabel.textContent = Math.round((volume||0.9)*100)+'%'; ui.ccVol.addEventListener('input', ()=> setVolume(parseInt(ui.ccVol.value,10)/100)); }
  // SoundFont select (mirror header)
  if(ui.ccSf){
    try{ ui.ccSf.value = ui.sfSelect.value || (localStorage.getItem('sfSelectedRel')||''); }catch(e){}
    ui.ccSf.addEventListener('change', function(){ if(!ui.ccSf.value) return; 
      try{ __SF_SUPPRESS_CHANGE__=true; ui.sfSelect.value = ui.ccSf.value; } finally { __SF_SUPPRESS_CHANGE__=false; ui.sfSelect.dispatchEvent(new Event('change')); }
    });
  }
  // SF policy buttons
  function applyPolUI(){ if(!ui.ccSfPolicy) return; ui.ccSfPolicy.querySelectorAll('button').forEach(b=>{ b.classList.toggle('active', (b.getAttribute('data-pol')||'')===sfPolicy); }); }
  applyPolUI();
  ui.ccSfPolicy && ui.ccSfPolicy.addEventListener('click', function(e){ const b=e.target.closest('button[data-pol]'); if(!b) return; sfPolicy=b.getAttribute('data-pol'); localStorage.setItem('sfChangePolicy', sfPolicy); applyPolUI(); });
  // Lyrics
  ui.ccShowLyrics && ui.ccShowLyrics.addEventListener('click', ()=>{ WM && WM.lyrics && WM.lyrics.toggle && WM.lyrics.toggle(); });
  // Pin sync with micro-dock
  if(ui.ccPinLyrics){ const stay=(localStorage.getItem('lyricsStay')||'off')==='on'; ui.ccPinLyrics.classList.toggle('active', stay); ui.ccPinLyrics.addEventListener('click', function(){ const cur=(localStorage.getItem('lyricsStay')||'off')==='on'; const next=!cur; localStorage.setItem('lyricsStay', next?'on':'off'); ui.ccPinLyrics.classList.toggle('active', next); const btn = document.getElementById('mdLyPin'); if(btn){ btn.classList.toggle('active', next); btn.setAttribute('aria-pressed', String(next)); } if(next){ try{ WM && WM.lyrics && WM.lyrics.show && WM.lyrics.show(); }catch(e){} } }); }
  // Glow & AutoHide
  if(ui.ccGlow){ ui.ccGlow.classList.toggle('active', lyrGlow); ui.ccGlow.addEventListener('click', ()=> setLyrGlow(!lyrGlow)); }
  if(ui.ccAutoHide){ ui.ccAutoHide.classList.toggle('active', lyAutoHide); ui.ccAutoHide.textContent = lyAutoHide? 'AutoHide: ON' : 'AutoHide: OFF'; ui.ccAutoHide.addEventListener('click', ()=>{ lyAutoHide=!lyAutoHide; localStorage.setItem('lyAutoHide', lyAutoHide?'on':'off'); applyAutoHideUI(); }); }
  // HL color
  if(ui.ccHLs){ ui.ccHLs.addEventListener('click', function(e){ const ch=e.target.closest('.chip'); if(!ch) return; hlColor=ch.getAttribute('data-hl')||'#7ef9a7'; applyHLColor(); }); }
  if(ui.ccHLpick){ ui.ccHLpick.addEventListener('input', function(){ hlColor=ui.ccHLpick.value || '#7ef9a7'; applyHLColor(); }); }
  // Compact header
  if(ui.ccCompactHead){ const on = (localStorage.getItem('compactHeader')||'off')==='on'; ui.ccCompactHead.checked = on; document.body.classList.toggle('compact-header', on); ui.ccCompactHead.addEventListener('change', function(){ const v=ui.ccCompactHead.checked; localStorage.setItem('compactHeader', v?'on':'off'); document.body.classList.toggle('compact-header', v); }); }
})();

// Media Session (optional)
(function mediaSession(){
  if (!('mediaSession' in navigator)) return;
  function setMeta(title){ navigator.mediaSession.metadata = new MediaMetadata({ title: title||'TOH Player', artist: '', album: '', artwork: [] }); }
  function playingTitle(){ return (lastPlayed && lastPlayed.name) ? lastPlayed.name : (currentSong||'TOH Player'); }
  setMeta(playingTitle());
  navigator.mediaSession.setActionHandler('previoustrack', ()=>{ BG.prev?.(); });
  navigator.mediaSession.setActionHandler('nexttrack', ()=>{ if(isPlaying){ ui.stop.click(); } else { feedNextIfAny(); } });
  navigator.mediaSession.setActionHandler('play', ()=>{ resumePlay(); });
  navigator.mediaSession.setActionHandler('pause', ()=>{ if(isPlaying){ ui.stop.click(); } });
  const _origSetNow = setNowPlaying; window.setNowPlaying = function(rel,n){ _origSetNow(rel,n); try{ setMeta(n || rel || 'TOH Player'); }catch(e){} };
})();

// Deep-link: #play=relative/path.mid
(function deepLink(){
  function tryPlayFromHash(){
    var m = location.hash.match(/#play=(.+)$/);
    if(!m) return;
    var rel = decodeURIComponent(m[1]||'');
    if(!rel) return;
    var row = document.querySelector('#playlist .row[data-path="'+CSS.escape(rel)+'"] a.song');
    var name = row ? row.textContent.trim() : rel.split('/').pop().replace(/\.(mid|midi|kar)$/i,'');
    if(!sfSelected){ var savedSF = localStorage.getItem('sfSelectedRel') || ''; if(savedSF && ui.sfSelect){ ui.sfSelect.value=savedSF; ui.sfSelect.dispatchEvent(new Event('change')); } }
    resumePlay();
    playSong(rel, name);
  }
  window.addEventListener('hashchange', tryPlayFromHash);
  tryPlayFromHash();
})();

// === Close buttons handler (Browser / Queue / BG / CC / Lyrics) ===
(function(){
  function hidePanel(which){
    try{
      if(which==='browser') ui.browserPanel && ui.browserPanel.classList.remove('visible');
      else if(which==='queue') ui.queuePanel && ui.queuePanel.classList.remove('visible');
      else if(which==='bg') ui.bgPanel && ui.bgPanel.classList.remove('visible');
      else if(which==='cc') ui.ccPanel && ui.ccPanel.classList.remove('visible');
      else if(which==='lyrics') ui.lyWin && ui.lyWin.classList.remove('visible');
    }catch(e){}
  }
  function bindStops(){
    try{
      document.querySelectorAll('button.close').forEach(function(b){
        ['mousedown','touchstart'].forEach(function(ev){ b.addEventListener(ev, function(e){ e.stopPropagation(); }, {passive:true}); });
      });
    }catch(e){}
  }
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest ? e.target.closest('button.close') : null;
    if(!btn) return;
    e.stopPropagation();
    hidePanel(btn.getAttribute('data-close')||'');
  }, true);
  bindStops();
})();

// === Init ===
(function init(){ syncVizSize(); runTimers(); updateTicker(); setLyrMode(lyrMode||'tri'); setLyrGlow(lyrGlow); applyFontScale(); applyAlign(); setVolume(volume); ensureLyWin(); updateFSButton(); try{ BG.init(); }catch(e){ console.warn('BG init failed', e); } try{ var sel = ui.sfSelect; if (sel && sel.options.length>1){ var savedSF = localStorage.getItem('sfSelectedRel') || ''; var setBySaved = false; if (savedSF){ for (var i=1;i<sel.options.length;i++){ if (sel.options[i].value === savedSF){ __SF_SUPPRESS_CHANGE__ = true; try{ sel.selectedIndex=i; } finally{ setTimeout(function(){__SF_SUPPRESS_CHANGE__=false; sel.dispatchEvent(new Event('change'));}, 0);} setBySaved = true; break; } } } if (!setBySaved && sel.selectedIndex <= 0 && sel.options.length>1){ var minIdx=-1, minSize=Infinity; for (var j=1;j<sel.options.length;j++){ var sz = parseInt(sel.options[j].getAttribute('data-size')||'0', 10) || Infinity; if (sz < minSize){ minSize = sz; minIdx = j; } } if (minIdx>0){ __SF_SUPPRESS_CHANGE__ = true; try{ sel.selectedIndex=minIdx; } finally{ setTimeout(function(){__SF_SUPPRESS_CHANGE__=false; sel.dispatchEvent(new Event('change'));}, 0);} } } } }catch(e){ console.warn('Auto-select SF failed', e); } window.addEventListener('resize', syncVizSize); })();
</script>

<!-- === Lyrics Font Family support (TTF/OTF/WOFF/WOFF2) === -->
<style id="lyrics-font-family-var">#lyBody { font-family: var(--lyFont, system-ui); }</style>
<script>
(function(){
  const BUILTINS = [
    {name:'System Default', value:'system-ui'},
    {name:'Arial', value:'Arial, sans-serif'},
    {name:'Verdana', value:'Verdana, sans-serif'},
    {name:'Georgia', value:'Georgia, serif'},
    {name:'Courier New', value:'"Courier New", monospace'},
    {name:'Tahoma', value:'Tahoma, sans-serif'},
    {name:'Times New Roman', value:'"Times New Roman", serif'}
  ];
  var FONT_FILES = (typeof window.FONT_FILES !== 'undefined') ? window.FONT_FILES : [];
  const foot = document.getElementById('lyFoot'); if (!foot) return;
  const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='6px';
  const label = document.createElement('span'); label.className='small'; label.textContent='Font';
  const sel = document.createElement('select'); sel.id='lyFontSelect'; sel.style.maxWidth='260px';
  row.appendChild(label); row.appendChild(sel); (foot.querySelector('.foot-right')||foot).appendChild(row);
  function baseName(path){ try{ return path.split('/').pop(); }catch(e){ return path; } }
  function stripExt(name){ const i=name.lastIndexOf('.'); return (i>0)? name.slice(0,i): name; }
  function humanize(name){ return stripExt(name).replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim(); }
  function familyFromFile(path){ return humanize(baseName(path)); }
  function makeOpt(value, label){ const o=document.createElement('option'); o.value=value; o.textContent=label; return o; }
  const customs = (FONT_FILES||[]).map(f=>({ path:f, family: familyFromFile(f) }));
  const KEY_FAMILY='lyrFontFamily'; const KEY_CUSTOM_PATH='lyrFontFile';
  BUILTINS.forEach(b=> sel.appendChild(makeOpt(b.value, b.name)));
  if (customs.length){ sel.appendChild(makeOpt('__sep__', '──────────')); sel.lastChild.disabled=true; }
  customs.forEach(c=> sel.appendChild(makeOpt('file:'+c.path, `${c.family} (custom)`)));
  function applyFontFamily(cssFamily){ try{ document.getElementById('lyBody')?.style.setProperty('--lyFont', cssFamily || 'system-ui'); }catch(e){} try{ localStorage.setItem(KEY_FAMILY, cssFamily || 'system-ui'); }catch(e){} }
  async function loadCustomFont(fontPath){ const family = familyFromFile(fontPath) || 'CustomFont'; if ([...document.fonts].some(f=>f.family===family)) return family; const ff = new FontFace(family, `url(${fontPath})`, { display:'swap' }); const font = await ff.load(); document.fonts.add(font); return family; }
  async function choose(v){ if (!v) return; if (v.startsWith('file:')){ const p = v.slice(5); try{ const fam = await loadCustomFont(p); applyFontFamily(`"${fam}", system-ui`); localStorage.setItem(KEY_CUSTOM_PATH, p);}catch(e){ console.warn('Custom font load failed', e); alert('Cannot load custom font: '+p); applyFontFamily('system-ui'); } return; } localStorage.removeItem(KEY_CUSTOM_PATH); applyFontFamily(v); }
  (async function initSelect(){ const saved = localStorage.getItem(KEY_FAMILY) || 'system-ui'; const savedFile = localStorage.getItem(KEY_CUSTOM_PATH) || ''; let setValue = saved; if (savedFile){ const optValue = 'file:'+savedFile; const exists = [...sel.options].some(o=>o.value===optValue); if (exists) setValue = optValue; } sel.value = setValue; await choose(setValue); })();
  sel.addEventListener('change', ()=> choose(sel.value));
})();
</script>

<!-- Font transparency/AutoHide: make lyrics window chromeless truly transparent -->
<style id="lyrics-autohide-transparent-patch">
#lyWin.chrome-hidden {
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
#lyWin.chrome-hidden .wm-grip { display: none !important; }
</style>

<!-- === Lyrics Countdown LITE (5s default; clamp; skip-guard; token-safe) === --><style id="lyr-countdown-lite-css">
#lyBody { position:relative; }

#lyCountOverlay {
  position:absolute; inset:0; display:none;
  align-items:center; justify-content:center;
  pointer-events:none; z-index:3;
  --ringInner: 58%;
  --ringTrack: rgba(255,255,255,.16);
  --prog: 0;
}

#lyCountOverlay .lyWrap {
  position:relative;
  width: clamp(72px, calc(var(--fs,1)*8vw + 24px), 128px);
  height: clamp(72px, calc(var(--fs,1)*8vw + 24px), 128px);
}

#lyCountOverlay .ring {
  position:absolute; inset:0; border-radius:50%;
  background: conic-gradient(var(--hl) calc(var(--prog) * 1turn), var(--ringTrack) 0);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent var(--ringInner), #000 calc(var(--ringInner) + 1%));
          mask: radial-gradient(circle at 50% 50%, transparent var(--ringInner), #000 calc(var(--ringInner) + 1%));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 24px rgba(0,0,0,.35);
}

#lyCountOverlay .lyDigit {
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  font-family: var(--lyFont, system-ui);
  font-weight: 800; letter-spacing:.02em;
  color: var(--fg);
  font-size: clamp(36px, calc(var(--fs,1)*2rem + 2vw), 84px);
  -webkit-text-stroke: 0.02px #000;
  text-shadow: 1px 0 0 #000, -1px 0 0 #000,
               0 1px 0 #000,  0 -1px 0 #000,
               1px 1px 0 #000, -1px -1px 0 #000,
               1px -1px 0 #000, -1px 1px 0 #000;
               opacity: 0;
  animation: fadeIn 0.4s forwards;
  
}

#lyWin.chrome-hidden #lyCountOverlay {}


@keyframes fadeIn {
  to { opacity: 1; }
}

</style>

<script id="lyr-countdown-lite-js">
(function(){
  var overlay, wrap, ring, digit;
  var rafTick = 0, rafWait = 0;
  var endTs = 0;                 // absolute lyric start (seconds since songStart)
  var startTs = 0;               // endTs - COUNT_LEN
  var playTokenAtStart = 0;

  // Default 5s; allow override via localStorage; clamp (1..9)
  var n = parseInt(localStorage.getItem('lyCountLen') || '5', 10);
  var COUNT_LEN = Math.max(1, Math.min(9, isNaN(n) ? 5 : n));

  // Skip guard: if first lyric is too near the present, skip countdown (no flash)
  var SKIP_SECS = parseFloat(localStorage.getItem('lyCountSkipSec') || '0.9');

  // Small epsilon for boundary flicker
  var EPS = 0.06;

  function clamp01(x){ return x<0?0: (x>1?1:x); }

  function ensure(){
    var host = document.getElementById('lyBody'); if(!host) return null;

    overlay = document.getElementById('lyCountOverlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'lyCountOverlay';
      overlay.style.display = 'none';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '3';
      host.appendChild(overlay);
    }
    wrap = overlay.querySelector('.lyWrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'lyWrap';
      overlay.appendChild(wrap);
    }
    ring = wrap.querySelector('.ring');
    if(!ring){
      ring = document.createElement('div');
      ring.className = 'ring';
      wrap.appendChild(ring);
    }
    digit = wrap.querySelector('.lyDigit');
    if(!digit){
      digit = document.createElement('div');
      digit.className = 'lyDigit';
      wrap.appendChild(digit);
    }
    return overlay;
  }

  function firstLyricTime(){
    try{
      var j=(window.lastLyrics && Array.isArray(lastLyrics.lines)) ? lastLyrics : null;
      if(!j) return null;
      var t=null;
      for(var i=0;i<j.lines.length;i++){
        var L=j.lines[i]; if(!L||!Array.isArray(L.words)) continue;
        for(var k=0;k<L.words.length;k++){
          var w=L.words[k];
          if(typeof w.t==='number'){ if(t==null || w.t<t) t=w.t; }
        }
      }
      return (t==null) ? null : Math.max(0, t);
    }catch(e){ return null; }
  }

  function hide(){
    cancelAnimationFrame(rafTick); rafTick = 0;
    cancelAnimationFrame(rafWait); rafWait = 0;
    if(overlay) overlay.style.display = 'none';
  }
  function show(){ if(overlay) overlay.style.display = 'flex'; }
  function setProg(p){ if(overlay) overlay.style.setProperty('--prog', String(clamp01(p))); }

  function tick(){
    cancelAnimationFrame(rafTick);

    // Cancel if song changed
    if (typeof window.token === 'number' && window.token !== playTokenAtStart) { hide(); return; }

    var now = window.ac ? (window.ac.currentTime - (window.songStart||0)) : 0;
    var remain = Math.max(0, endTs - now);

    if(remain <= 0.08){ hide(); return; }

    // Overall progress from startTs → endTs (0..1)
    var prog = (now - startTs) / (COUNT_LEN || 1);
    setProg(prog);

    // Integer digit (ceil of remaining seconds, clamped to COUNT_LEN..1)
    var d = Math.ceil(remain);
    if(d > COUNT_LEN) d = COUNT_LEN;
    if(d <= 0){ hide(); return; }

    if(digit && digit._last !== d){
      digit.textContent = d;
      digit._last = d;
    }
    rafTick = requestAnimationFrame(tick);
  }

  function beginCountdown(first){
    if(!ensure()) return;
    endTs = first;
    startTs = Math.max(0, endTs - COUNT_LEN);
    if(digit) digit._last = -1;
    setProg(0);
    show();
    tick();
  }

  function waitUntilWindowStart(first){
    cancelAnimationFrame(rafWait);
    function loop(){
      // Cancel if song changed
      if (typeof window.token === 'number' && window.token !== playTokenAtStart) { hide(); return; }

      var now = window.ac ? (window.ac.currentTime - (window.songStart||0)) : 0;
      if(now + EPS >= (first - COUNT_LEN)){ beginCountdown(first); return; }
      rafWait = requestAnimationFrame(loop);
    }
    rafWait = requestAnimationFrame(loop);
  }

  function maybeStart(){
    if(!ensure()) return;
    if(!window.ac || !window.isPlaying) return;

    var first = firstLyricTime();
    if(first == null || !isFinite(first)) return;

    var now = window.ac.currentTime - (window.songStart||0);

    // Skip if lyric starts too close (avoid blip)
    if (first <= now + SKIP_SECS) return;

    if(now + EPS >= (first - COUNT_LEN)){
      beginCountdown(first);
    } else {
      hide();
      waitUntilWindowStart(first);
    }
  }

  // Hook into status changes (token-safe)
  var _setStatus = window.setStatus;
  window.setStatus = function(msg){
    try{ _setStatus && _setStatus(msg); }catch(e){}
    try{
      if(msg === 'PLAYING'){
        playTokenAtStart = (typeof window.token === 'number') ? window.token : 0;
        hide();
        maybeStart();
      }
      if(msg === 'IDLE'){ hide(); }
    }catch(e){}
  };

  // Console helpers for quick tuning
  window.__LY_COUNT = {
    setLen: function(n){
      var v = Math.max(1, Math.min(9, parseInt(n||5,10) || 5));
      localStorage.setItem('lyCountLen', String(v));
      // updates next play
    },
    setSkip: function(s){
      var v = Math.max(0, parseFloat(s||0.9));
      localStorage.setItem('lyCountSkipSec', String(v));
      // updates next play
    },
    start: maybeStart,
    stop: hide
  };
})();
</script>

<script src="bigger_lyrics_patch.js"></script>
<script src="bigger_lyrics_unlimited.js"></script>
<script src="viz_rainbow_patch.js"></script>


<script src="screensaver_karaoke_panel_display_only_v3.4.3.js"></script>
<script src="screensaver_karaoke_patch.js"></script>

<script src="queue_tools_toh.js"></script>

<script src="header_animated_patch.js"></script>


<script src="header_miniviz_patch.js"></script>
<script src="eq_switch_plus_v2.js"></script>

<script src="eq_popup_patch.js"></script>


<script src="simple_mapper_catalog_bundle_v1.1.4.js"></script>
<script src="mapper_presets_patch_v1.0.js"></script>
<script src="mixer16_patch_v4.2.9f_patched.js?v=20250927"></script>


<script src="mixer_mobile_free_drag_patch_v2.js?v=20250927"></script>

<script src="simple_mapper_v1.1.js?v=20250927"></script>
<script src="sm_presong_helpers_nols.js"></script>

<script>
  // After your JSSynth is ready
  // Avoid double-double when bundle retries too
  window.smNoDouble = true;
</script>

<script src="mapper_mix16_bridge_v2.1_nofallback.js?v=ipt"></script>


<script src="mix16_smf_vlq_tap.js"></script>
<script src="mix16_tap_smf_preload_v1.js"></script>
<script src="smf_inject_v1.js"></script>
<script src="patch_instrument_info.js"></script>
<script src="playback_floating_panel_patch_v1.js"></script>
<script src="playback_drag_fix_v1.js"></script>


<script src="record_audio_server_patch2.js"></script>
<script src="simple_mapper_panel_center_hotfix.js"></script>

<script>
/* SMInfoMapperBridge: connects Info Panel clicks to your SimpleMapper UI */
document.addEventListener('DOMContentLoaded', function () {
  window.SMInfoMapperBridge = {
    open: function () {
      // Use your library's show() to pop the panel
      try { SimpleMapper.show(); } catch (e) {
        const panel = document.getElementById('smPanel');
        panel && panel.classList.add('visible');
      }
    },
    setChannel: function (ch) {
      // ch is 0..15; UI dropdown shows 1..16
      const chanSel = document.getElementById('smChan');
      if (chanSel) {
        chanSel.value = String((ch|0) + 1);
        chanSel.dispatchEvent(new Event('change'));
      }
    },
    setSearch: function (q) {
      // Your mapper has numeric fields (no text search).
      // So we treat "search" as "prefill currently loaded patch values".
      // This guarantees exact match and avoids misleading defaults.
      try {
        // If MIX16 is present, use its patch values
        if (window.__MIX16 && typeof __MIX16.getPatch === 'function') {
          // If a row was clicked, SMInfo.launchMapperForChannel(c) already set the row active.
          // We can infer channel from the active row or fall back to CH1.
          let ch = 0;
          const active = document.querySelector('#smInfoGrid .smRow.active');
          if (active && active.dataset && active.dataset.ch) ch = parseInt(active.dataset.ch, 10) || 0;

          const p = __MIX16.getPatch(ch);
          const msb = (p && typeof p.bankMSB === 'number') ? p.bankMSB : 0;
          const lsb = (p && typeof p.bankLSB === 'number') ? p.bankLSB : 0;
          const pg  = (p && typeof p.program === 'number') ? p.program : 0;

          const fMSB = document.getElementById('smMSB');
          const fLSB = document.getElementById('smLSB');
          const fPG  = document.getElementById('smProg');
          if (fMSB) fMSB.value = String(msb);
          if (fLSB) fLSB.value = String(lsb);
          if (fPG)  fPG.value  = String(pg);
        }
      } catch (e) {}
    }
  };
});
</script>


<script>
(function(){
  const _setStatus = window.setStatus;
  window.setStatus = function(msg){
    try { _setStatus && _setStatus(msg); } catch(e) {}

    try {
      if (msg === 'PLAYING' && window.lyAutoHide && window.ui && ui.lyWin) {
        // Force chrome hidden at song start. User activity still reveals it.
        ui.lyWin.classList.add('chrome-hidden');
        // Do NOT call showChromeNow(); we want it to stay hidden.
      }
    } catch(e) {}
  };
})();
</script>
<script id="theme-switch-patch">
(function(){
  const KEY = 'uiTheme';
  const THEMES = [
    { id:'dark', label:'Dark' },
    { id:'neon', label:'Neon' },
    { id:'warm', label:'Warm' },
    { id:'mono', label:'Mono' }
  ];

  function valid(id){ return THEMES.some(t => t.id === id); }
  function labelOf(id){ return (THEMES.find(t => t.id===id)||{}).label || 'Dark'; }

  function applyTheme(id){
    const theme = valid(id) ? id : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch(_) {}
    syncButton(theme);
  }

  function nextTheme(){
    const cur = getTheme();
    const idx = THEMES.findIndex(t => t.id === cur);
    const next = THEMES[(idx + 1) % THEMES.length].id;
    applyTheme(next);
  }

  function getTheme(){
    try {
      const saved = localStorage.getItem(KEY) || 'dark';
      return valid(saved) ? saved : 'dark';
    } catch(_) { return 'dark'; }
  }

  // Build a small CC row if present
  function ensureCC(){
    const cc = document.getElementById('ccPanel');
    if (!cc) return;
    const list = cc.querySelector('.list');
    if (!list) return;

    // Avoid duplicates
    if (document.getElementById('ccThemeRow')) return;

    const row = document.createElement('div');
    row.className = 'row';
    row.id = 'ccThemeRow';

    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = 'Theme';

    const btn = document.createElement('button');
    btn.id = 'ccThemeBtn';
    btn.className = 'small';
    btn.title = 'Cycle theme';
    btn.addEventListener('click', nextTheme);

    row.appendChild(lab);
    row.appendChild(btn);
    list.appendChild(row);

    // Initial label sync happens after applyTheme()
  }

  function syncButton(themeId){
    const btn = document.getElementById('ccThemeBtn');
    if (btn) btn.textContent = 'Theme: ' + labelOf(themeId);
  }

  // Init
  ensureCC();
  applyTheme(getTheme());

  // Console helpers
  window.__THEME = {
    get:  () => getTheme(),
    set:  (id) => applyTheme(id),
    next: () => nextTheme(),
    list: () => THEMES.map(t=>t.id)
  };
})();
</script>
<!-- === LRC+ Export (Enhanced LRC: per-line + per-word) === -->
<script id="lrc-export-patch">
(function(){
  // ---------- helpers ----------
  function lrcTime(t, decimals){
    // t is seconds from song start
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const frac = Math.max(0, t - (m*60 + s));
    const d = (decimals === 3) ? Math.round(frac * 1000) : Math.round(frac * 100); // ms or cs
    const dd = (decimals === 3)
      ? String(d).padStart(3, '0')
      : String(d).padStart(2, '0');
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${dd}`;
  }

  function safeFileName(s){
    s = (s || 'lyrics').trim();
    // Remove/replace filesystem-unfriendly chars
    return s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g,' ').trim() || 'lyrics';
  }

  function metaValue(v){ return (v==null?'':String(v)).trim(); }

  // ---------- core: build LRC+ ----------
  /**
   * buildEnhancedLRC(json, meta, opt)
   * json: { lines: [ { main_time: number, words:[{t:number, w:string}, ...] } ] }
   * meta: { ti, ar, al, by, re, ve, offset }
   * opt:  { perWord:true, decimals:2 }
   */
  function buildEnhancedLRC(json, meta, opt){
    const lines = (json && Array.isArray(json.lines)) ? json.lines : [];
    const cfg   = Object.assign({ perWord:true, decimals:2 }, opt || {});

    const out = [];

    // Extended tags (all optional; provide blanks if unknown)
    const ti = metaValue(meta?.ti);
    const ar = metaValue(meta?.ar);
    const al = metaValue(meta?.al);
    const by = metaValue(meta?.by) || 'KaraokeHD Player';
    const re = metaValue(meta?.re) || 'KaraokeHD LRC+ Export';
    const ve = metaValue(meta?.ve) || 'v1.0';
    const off= meta?.offset;
    if (ti) out.push(`[ti:${ti}]`);
    if (ar) out.push(`[ar:${ar}]`);
    if (al) out.push(`[al:${al}]`);
    out.push(`[by:${by}]`);
    out.push(`[re:${re}]`);
    out.push(`[ve:${ve}]`);
    if (typeof off === 'number' && isFinite(off)) out.push(`[offset:${Math.round(off)}]`);

    // Main body
    for (let i=0;i<lines.length;i++){
      const L = lines[i] || {};
      const tLine = isFinite(L.main_time) ? L.main_time : 0;
      let row = `[${lrcTime(tLine, cfg.decimals)}]`;

      const W = Array.isArray(L.words) ? L.words : [];
      for (let k=0;k<W.length;k++){
        const tok = W[k] || {};
        const wtxt = (tok.w==null?'':String(tok.w));
        const ttok = isFinite(tok.t) ? tok.t : tLine;

        if (!cfg.perWord){
          // Per-line only: append raw text
          row += wtxt;
        } else {
          // Per-word: add <mm:ss.xx> before each non-empty token; preserve spaces as-is
          if (wtxt.trim().length > 0){
            row += `<${lrcTime(ttok, cfg.decimals)}>${wtxt}`;
          } else {
            // whitespace token—keep it (you prefer no trimming)
            row += wtxt;
          }
        }
      }
      out.push(row);
    }

    return out.join('\n') + '\n';
  }

  function downloadLRC(filename, content){
    const blob = new Blob([content], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2500);
  }

  // ---------- UI: add button into Control Center → Tools ----------
  function ensureCCButton(){
    const cc = document.getElementById('ccPanel');
    if (!cc) return;
    const list = cc.querySelector('.list');
    if (!list) return;

    // Find existing Tools row; if missing, create one
    let toolsRow = [...list.children].find(el => {
      const lab = el.querySelector('.label');
      return lab && /tools/i.test(lab.textContent||'');
    });
    if (!toolsRow){
      toolsRow = document.createElement('div');
      toolsRow.className = 'row';
      const lab = document.createElement('span');
      lab.className = 'label';
      lab.textContent = 'Tools';
      toolsRow.appendChild(lab);
      list.insertBefore(toolsRow, list.firstChild);
    }

    // Avoid duplicate
    if (toolsRow.querySelector('#btnSaveLRC')) return;

    const linkWrap = document.createElement('span');
    const btn = document.createElement('a');
    btn.id = 'btnSaveLRC';
    btn.href = '#';
    btn.className = 'btn small';
    btn.textContent = 'Save Lyrics (LRC+)';
    btn.title = 'Export Enhanced LRC (per-word timestamps)';
    btn.addEventListener('click', function(e){
      e.preventDefault();

      // Guard: need lyrics present
      if (!window.lastLyrics || !Array.isArray(lastLyrics.lines) || !lastLyrics.lines.length){
        alert('No lyrics to export.');
        return;
      }

      // Gather meta
      const meta = {
        ti: (window.lastPlayed && lastPlayed.name) ? lastPlayed.name : (window.currentSong || 'Song'),
        ar: '',     // optional: fill artist if known
        al: '',     // optional: album
        by: 'Sem',  // or your preferred signature
        re: 'KaraokeHD LRC+ Export',
        ve: 'v1.0',
        offset: undefined // keep undefined unless you want a global offset in ms
      };

      // Choose decimals (persist simple choice)
      const keyDec = 'lrcDecimals';
      let dec = parseInt(localStorage.getItem(keyDec)||'2', 10);
      if (!(dec===2 || dec===3)) dec = 2;

      // Simple prompt (no UI noise); you can remove this if you want fixed 2 decimals
      const ans = prompt('LRC decimals? 2=centiseconds, 3=milliseconds', String(dec));
      const nextDec = parseInt(ans||String(dec), 10);
      const decimals = (nextDec===3) ? 3 : 2;
      try { localStorage.setItem(keyDec, String(decimals)); } catch(_){}

      const lrc = buildEnhancedLRC(window.lastLyrics, meta, { perWord:true, decimals });

      const base = safeFileName(meta.ti);
      const name = `${base}.lrc`;
      downloadLRC(name, lrc);
    });

    linkWrap.appendChild(btn);
    toolsRow.appendChild(linkWrap);
  }

  // Init
  ensureCCButton();
})();
</script>


<script src="ch16_names_realtime_sync_bundle_v1.3.js"></script>
<!-- 2) Inline hook: tell CH16 which loader you use (synth.loadSFont) -->
<script>
(function () {
  function tryHook() {
    if (window.__CH16_SYNC && typeof window.__CH16_SYNC.setLoader === 'function') {
      window.__CH16_SYNC.setLoader('loadSFont');
      return true;
    }
    return false;
  }
  if (!tryHook()) {
    var tries = 0;
    var t = setInterval(function () {
      if (tryHook() || ++tries > 60) { clearInterval(t); }
    }, 50);
  }
})();
</script>
<!-- Tiny 16-channel piano monitor -->
<script src="ch16_piano_bundle_v2.1.js"></script>

<script src="ch16_panel_wm_patch_v1.3.4.js?v=7"></script>

<script src="ch16_work_patch_v2.js"></script>

<script src="ch16_piano_ui_patch_v1.1.js"></script>

<script src="instrument_names_strict_patch_v1.js"></script>


<script src="close_router_patch.js"></script>

<script src="ch16_local_visibility_patch.js"></script>


<script>
var SERVER_INFO = <?php echo json_encode($SERVER_INFO, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); ?>;
var APP_VERSION = <?php echo json_encode($APP_VERSION, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); ?>;
</script>
<script id="zstack_fix_v2">
(function(){
  function cssInt(varName, dflt){
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      const n = parseInt(val, 10);
      return isFinite(n) ? n : dflt;
    } catch(_) { return dflt; }
  }

  const Z_TOAST   = cssInt('--z-toast', 600);
  const Z_SPINNER = cssInt('--z-spinner', 1000);
  const Z_TOP_WIN = Math.max(Z_TOAST + 1, Z_SPINNER - 2); // safe dominant ceiling
  const Z_BASE_LYR= cssInt('--z-lyrics', 150);            // your baseline for lyrics

  function setLyricsZ(z){ try{ document.documentElement.style.setProperty('--z-lyrics', String(z|0)); }catch(_){} }

  function bringLyrics(){ setLyricsZ(Z_TOP_WIN); }
  function lowerLyrics(){ setLyricsZ(Z_BASE_LYR); }

  // Event-driven dominance: click/touch → decide who’s dominant
  function onPointer(ev){
    const t = ev.target;
    const isLyrics = !!t && !!t.closest && t.closest('#lyWin');
    const isPanel  = !!t && !!t.closest && t.closest('.win');
    if (isLyrics) {
      bringLyrics();                 // lyrics becomes dominant (via CSS var)
    } else if (isPanel) {
      lowerLyrics();                 // panels dominate; lyrics goes back to base
      // WM already increments panel z via inline style; keep that behavior
    }
  }
  document.addEventListener('mousedown',  onPointer, { passive:true });
  document.addEventListener('touchstart', onPointer, { passive:true });

  // Also hook WM.show/toggle so opening via dock/menu respects dominance
  function wrapWM(){
    if (!window.WM) return;
    [['browser','panel'],['queue','panel'],['bg','panel'],['cc','panel'],['lyrics','lyrics']]
      .forEach(([key,kind])=>{
        const wnd = WM[key];
        if (!wnd || !wnd.element) return;
        ['show','toggle'].forEach(fn=>{
          if (typeof wnd[fn] === 'function' && !wnd[fn]._zfixWrapped){
            const _orig = wnd[fn].bind(wnd);
            wnd[fn] = function(){
              const res = _orig();
              if (kind === 'lyrics') bringLyrics(); else lowerLyrics();
              return res;
            };
            wnd[fn]._zfixWrapped = true;
          }
        });
      });
  }
  wrapWM();

  // If a panel is closed, restore lyrics baseline
  document.addEventListener('click', function(e){
    const btn = e.target.closest('button.close');
    if (!btn) return;
    const which = btn.getAttribute('data-close') || '';
    if (which && which !== 'lyrics') lowerLyrics();
  }, true);
})();
</script>
<script src="khd_infowin_20251013.js"></script>

<script src="song_info_online_patch.js"></script>




<script src="song_info_addons_min.js"></script>
<script src="song_info_ticker_info_plus_mb.js"></script>
<script>
(() => {
  /* ===== Minimal knobs ===== */
  const TICK_MS         = 6000;   // tick rate (>=1500ms)
  const WIKI_TIMEOUT_MS = 9000;   // Wikipedia timeout
  const WIKI_MAX_CHARS  = 240;    // first sentence cap
  const SEP             = ' • ';  // facts separator
  const SHOW_TAGS       = true;   // [INFO]/[QUEUE] tags; set false to hide

  /* ===== Find/observe playing items ===== */
  function rootPlaying(){
    return (
      document.querySelector('#tickerTrack') ||
      document.querySelector('.ticker .ticker-track') ||
      document.querySelector('.ticker') || null
    );
  }
  function playingItems(){
    const r = rootPlaying();
    return r ? Array.from(r.querySelectorAll('.ticker-item.playing')) : [];
  }

  /* ===== Shadow DOM layer on each .ticker-item.playing ===== */
  function ensureShadow(host){
    if (host.__shadowTicker) return host.__shadowTicker;
    const sr = host.attachShadow({ mode:'open' });
    const st = document.createElement('style');
    // Keep it simple; inherit font from host. Host’s marquee motion still applies.
    st.textContent = `
      :host { all: initial; }
      .wrap { display:inline-block; white-space:nowrap; color: inherit; font: inherit; }
      .tag  { opacity:.75; margin-right:.5em; }
    `;
    const div = document.createElement('span');
    div.className = 'wrap';
    sr.appendChild(st);
    sr.appendChild(div);
    host.__shadowTicker = { sr, div };
    return host.__shadowTicker;
  }

  function renderToAll(line, tag=null){
    const nodes = playingItems();
    for (const n of nodes){
      const { div } = ensureShadow(n);
      // Text only (no HTML). Tag is optional prefix like [INFO] / [QUEUE]
      div.textContent = (tag && SHOW_TAGS ? `[${tag}] ` : '') + String(line || '');
    }
  }

  /* ===== Utils ===== */
  const strip = s => String(s||'').replace(/\s{2,}/g,' ').trim();
  function fmtDur(sec){
    if (sec == null) return '';
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    const mm = h ? String(m).padStart(2,'0') : String(m);
    const ss = String(s).padStart(2,'0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  /* ===== Song Info (API → candy‑pill → globals) ===== */
  function getSongInfo(){
    try {
      if (window.SongInfo && typeof SongInfo.getCurrent === 'function') {
        return normalizeSI(SongInfo.getCurrent() || {});
      }
    } catch {}
    // read your candy‑pop pill (artist • album • year + badges)
    const node =
      document.querySelector('#tickerTrack .ticker-item.playing .si-info-pop') ||
      document.querySelector('.ticker .ticker-item.playing .si-info-pop');
    const si = {};
    if (node){
      const txt = node.querySelector('.si-text')?.textContent?.trim() || '';
      const parts = txt.split(' • ');
      si.artist  = parts[0] || '';
      si.album   = parts[1] || '';
      si.year    = parts[2] || '';
      const badges = node.querySelectorAll('.si-badge');
      si.label   = badges[0]?.textContent?.trim() || '';
      si.country = badges[1]?.textContent?.trim() || '';
    }
    return normalizeSI(si);
  }
  function normalizeSI(si){
    const out = {};
    out.title  = (si.title  || window.nowTitle  || window.nowPlayingTitle  || '').trim();
    out.artist = (si.artist || window.nowArtist || window.nowPlayingArtist || '').trim();
    out.album  = (si.album  || window.nowAlbum  || '').trim();
    out.year   = String(si.year || window.nowYear || '').trim();
    out.genre  = (si.genre  || window.nowGenre  || '').trim();
    out.label  = (si.label  || window.nowLabel  || '').trim();
    out.country= (si.country|| window.nowCountry|| '').trim();
    out.trackNumber = si.trackNumber || window.nowTrackNo || null;
    out.trackCount  = si.trackCount  || window.nowTrackCount || null;
    out.bpm    = si.bpm || window.nowBPM || null;
    out.key    = si.key || window.nowKey || '';
    // Duration via globals only (no network)
    out.durationSec = null;
    try { if (typeof window.songDurationSec==='number') out.durationSec = Math.floor(window.songDurationSec); } catch {}
    try { if (typeof window.songDurationMs ==='number') out.durationSec = Math.floor(window.songDurationMs/1000); } catch {}
    try { if (typeof window.totalMs        ==='number') out.durationSec = Math.floor(window.totalMs/1000); } catch {}
    return out;
  }

  /* ===== Wikipedia first sentence (best effort) ===== */
  function fetchTO(url, ms){
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms||WIKI_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
  }
  async function qWikiSummary(title, artist){
    const keys = [title, strip(`${artist} ${title}`)].filter(Boolean);
    for (const k of keys){
      try {
        const u = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(k);
        const r = await fetchTO(u, WIKI_TIMEOUT_MS); if (!r?.ok) continue;
        const j = await r.json().catch(()=>null); if (!j?.extract) continue;
        const first = (String(j.extract).split('. ')[0] || '').trim();
        if (!first) continue;
        const sentence = first.endsWith('.') ? first : (first + '.');
        return sentence.length > WIKI_MAX_CHARS ? (sentence.slice(0, WIKI_MAX_CHARS-1) + '…') : sentence;
      } catch {}
    }
    return '';
  }

  /* ===== Build blocks ===== */
  async function buildTriviaLine(){
    const si = getSongInfo();
    const p = [];
    if (si.title || si.artist) p.push([si.title, si.artist].filter(Boolean).join(' — '));
    if (si.album)                          p.push(`Album: ${si.album}`);
    if (si.year)                           p.push(`Year: ${si.year}`);
    if (si.label)                          p.push(`Label: ${si.label}`);
    if (si.country)                        p.push(`Country: ${si.country}`);
    if (si.genre)                          p.push(`Genre: ${si.genre}`);
    if (si.trackNumber && si.trackCount)   p.push(`Track ${si.trackNumber} of ${si.trackCount}`);
    else if (si.trackNumber)               p.push(`Track ${si.trackNumber}`);
    if (si.bpm)                            p.push(`Tempo: ${si.bpm} BPM`);
    if (si.key)                            p.push(`Key: ${si.key}`);
    if (si.durationSec != null)            p.push(`Duration: ${fmtDur(si.durationSec)}`);
    let wiki=''; try { wiki = await qWikiSummary(si.title||'', si.artist||''); } catch {}
    if (wiki) p.push(`Wiki: ${wiki}`);
    const line = strip(p.join(SEP)) || 'Now Playing';
    return SHOW_TAGS ? `[INFO] ${line}` : line;
  }

  function buildQueueLines(){
    const roots = [
      document.querySelector('#plBody'),
      document.querySelector('#playlist'),
      document.querySelector('.playlist'),
      document.querySelector('#playlistTable'),
      document.querySelector('.queue')
    ].filter(Boolean);
    if (!roots.length) return [];
    const root = roots[0];

    const rows = Array.from(root.querySelectorAll('[data-idx], tr, li, .row, .item'));
    if (!rows.length) return [];

    const cur = rows.findIndex(r => r.matches?.('.playing, .current, .on, .active, [aria-current="true"]'));
    const start = cur >= 0 ? cur + 1 : 0;

    const out = [];
    for (let i=start; i<rows.length; i++){
      const r  = rows[i];
      const ti = (r.getAttribute?.('data-title') || r.querySelector?.('.title,.t,.name')?.textContent || r.querySelector?.('td:nth-child(1)')?.textContent || '').trim();
      const ar = (r.getAttribute?.('data-artist')|| r.querySelector?.('.artist,.a')?.textContent    || r.querySelector?.('td:nth-child(2)')?.textContent || '').trim();
      const s  = (ti ? ti : '') + (ar ? (' — ' + ar) : '');
      if (s) out.push(SHOW_TAGS ? `[QUEUE] Next: ${s}` : `Next: ${s}`);
    }
    return out;
  }

  /* ===== Alternation (only start‑of‑cycle is random) ===== */
  const PHASE = { INFO:'INFO', QUEUE:'QUEUE' };
  let seq = [];      // ['INFO','QUEUE'] or ['QUEUE','INFO']
  let seqIdx = 0;    // 0..1
  let i = 0;         // index within current block
  let trivia = '';   // cached long line
  let queue  = [];   // full queue list (ordered)
  let timer  = 0;

  async function startCycle(){
    seq = (Math.random() < 0.5) ? [PHASE.INFO, PHASE.QUEUE] : [PHASE.QUEUE, PHASE.INFO];
    seqIdx = 0; i = 0; trivia=''; queue=[];
    if (seq[0] === PHASE.INFO) trivia = await buildTriviaLine();
    else queue = buildQueueLines();
  }

  async function tick(){
    if (!seq.length) await startCycle();

    const phase = seq[seqIdx];
    if (phase === PHASE.INFO){
      if (!trivia) trivia = await buildTriviaLine();
      setLine(trivia);
      i = 1; // info shows once
    } else {
      if (!queue.length) queue = buildQueueLines();
      const item = queue[i] || (SHOW_TAGS ? '[QUEUE] Next: —' : 'Next: —');
      setLine(item);
      i++;
    }

    const done = (phase === PHASE.INFO) ? (i >= 1) : (i >= queue.length || queue.length === 0);
    if (done){
      seqIdx++;
      if (seqIdx >= seq.length){ await startCycle(); }
      else {
        i = 0;
        if (seq[seqIdx] === PHASE.INFO) trivia = await buildTriviaLine();
        else queue = buildQueueLines();
      }
    }

    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(1500, TICK_MS|0));
  }

  // Render + guard (restore immediately if other scripts rewrite)
  function setLine(line){
    writeHard(line);
    lastLine = line;
  }
  let guard, lastLine = '';
  function armGuard(){
    if (guard) return;
    const r = rootPlaying(); if (!r) return;
    guard = new MutationObserver(() => {
      if (!lastLine) return;
      const nodes = playingItems();
      for (const n of nodes){
        // If someone rewrote the host text, put our shadow back? (we use hard text now)
        if (n.textContent !== lastLine) n.textContent = lastLine;
      }
    });
    guard.observe(r, { childList:true, subtree:true, characterData:true });
  }

  // Hook after your normal ticker refresh
  function kickSoon(){
    clearTimeout(timer);
    trivia=''; queue=[]; seq=[]; seqIdx=0; i=0; lastLine='';
    setTimeout(() => { armGuard(); tick(); }, 60);
  }
  (function hookSP(){
    if (typeof window.setNowPlaying==='function' && !window.__SHDW_SP__){
      const o = window.setNowPlaying;
      window.setNowPlaying = function(){ try{ o.apply(this, arguments); }catch{} kickSoon(); };
      window.__SHDW_SP__ = 1;
    }
  })();
  (function hookUT(){
    if (typeof window.updateTicker==='function' && !window.__SHDW_UT__){
      const o = window.updateTicker;
      window.updateTicker = function(){ try{ o.apply(this, arguments); }catch{} kickSoon(); };
      window.__SHDW_UT__ = 1;
    }
  })();

  // Debug handle (optional)
  window.__SHADOW_TICKER__ = {
    status: () => ({ seq, seqIdx, i, queueCount: queue?.length||0, triviaBuilt: !!trivia }),
    restart: () => kickSoon(),
    stop: () => { clearTimeout(timer); }
  };

  // Go
  armGuard();
  tick();
})();
</script>


<script src="title_splash_v3_min_fixed.js"></script>
<script src="titlesplash_wire_v3_min-1.js"></script>
<script src="title_splash_theme_pack_v1.js"></script>
<script src="titlesplash_theme_cc_v1.js"></script>

<script src="no_duration_title_hotfix_v1.js"></script>


<style id="md-menu-scroll-patch">
  /* Make burger menu (#mdPanelMenu) scrollable on all screens */
  .md-menu {
    max-height: clamp(160px, 55vh, 420px);
    overflow-y: auto;
    overscroll-behavior: contain;          /* prevent scroll chaining */
    -webkit-overflow-scrolling: touch;     /* momentum scrolling on iOS */
  }

  /* Slightly higher cap on narrow screens */
  @media (max-width:700px) {
    .md-menu { max-height: min(70vh, 520px); }
  }

  /* Focus styles for keyboard users (keeps your look clean) */
  .md-item:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
    outline-offset: 2px;
  }
</style>
<script id="md-menu-scroll-nav-patch">
(function() {
  const menu = document.getElementById('mdPanelMenu');
  if (!menu) return;

  // Add ARIA semantics once
  function ensureARIA() {
    menu.setAttribute('role', 'menu');
    menu.querySelectorAll('.md-item').forEach(btn => {
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('tabindex', '0'); // make focusable
    });
    // Container focusable for Esc handling
    if (!menu.hasAttribute('tabindex')) menu.setAttribute('tabindex', '-1');
  }

  function focusFirst() {
    const first = menu.querySelector('.md-item');
    if (first) first.focus();
  }

  function focusLast() {
    const items = [...menu.querySelectorAll('.md-item')];
    const last = items[items.length - 1];
    if (last) last.focus();
  }

  function nextItem(cur, dir) {
    const items = [...menu.querySelectorAll('.md-item')];
    const i = items.indexOf(cur);
    const j = (i < 0) ? 0 : Math.max(0, Math.min(items.length - 1, i + dir));
    const target = items[j];
    if (target) {
      target.focus({ preventScroll: true });
      // Ensure focused item is visible
      target.scrollIntoView({ block: 'nearest' });
    }
  }

  function pageScroll(dir) {
    menu.scrollTop += dir * menu.clientHeight * 0.9;
  }

  function closeMenu() {
    menu.classList.remove('open');
    // Sync your main burger button’s state if needed
    const btnMain = document.getElementById('mdPanel');
    if (btnMain) btnMain.classList.remove('active');
  }

  // Keyboard controls on the menu
  menu.addEventListener('keydown', (e) => {
    const key = e.key;
    const tgt = e.target.closest('.md-item') || menu;

    if (key === 'ArrowDown') { e.preventDefault(); nextItem(tgt, +1); }
    else if (key === 'ArrowUp') { e.preventDefault(); nextItem(tgt, -1); }
    else if (key === 'Home') { e.preventDefault(); focusFirst(); }
    else if (key === 'End') { e.preventDefault(); focusLast(); }
    else if (key === 'PageDown') { e.preventDefault(); pageScroll(+1); }
    else if (key === 'PageUp') { e.preventDefault(); pageScroll(-1); }
    else if (key === 'Enter' || key === ' ') {
      // Activate focused item
      const btn = e.target.closest('.md-item');
      if (btn) { e.preventDefault(); btn.click(); }
    } else if (key === 'Escape') {
      e.preventDefault();
      closeMenu();
      // Return focus to burger button
      const btnMain = document.getElementById('mdPanel');
      if (btnMain) btnMain.focus();
    }
  });

  // Observe open/close to auto-focus the first item
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.attributeName === 'class') {
        const isOpen = menu.classList.contains('open');
        if (isOpen) {
          ensureARIA();
          // Delay focus after CSS reflow
          requestAnimationFrame(() => focusFirst());
        }
      }
    }
  });

  mo.observe(menu, { attributes: true, attributeFilter: ['class'] });

  // Initial setup if menu is already open on load
  ensureARIA();
  if (menu.classList.contains('open')) focusFirst();
})();
</script>
<script src="ch16_cache_clear_button_v1.1.js"></script>

<script>
(function(){
  const input = document.getElementById('browserSearch');
  const btnGo = document.getElementById('browserSearchGo');
  const btnX  = document.getElementById('browserSearchClear');
  const count = document.getElementById('browserSearchCount');
  const list  = document.getElementById('playlist');
  if (!input || !btnGo || !btnX || !list) return;

  // --- 1) Cache any inline handlers (if present) ---
  const origOnInput = input.oninput;
  const origOnKeyUp = input.onkeyup;
  const origOnKeyDn = input.onkeydown;

  function runOriginalOnce(ev){
    const fn = origOnInput || origOnKeyUp || origOnKeyDn;
    if (typeof fn === 'function') {
      requestAnimationFrame(() => fn.call(input, ev || new Event('input')));
    } else {
      // If original was bound via addEventListener, allow one real input event:
      allowOne = true;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      allowOne = false;
    }
  }

  // --- 2) Stop only input listeners during typing (do NOT prevent default) ---
  // This blocks heavy filter listeners but lets the field edit normally.
  let allowOne = false;
  function swallowInput(e){
    if (!allowOne) {
      e.stopImmediatePropagation();   // block attached handlers
      // DO NOT call e.preventDefault() here — value should update normally
    }
  }
  input.addEventListener('input', swallowInput, true);  // capture phase

  // Neutralize inline handlers to avoid duplicate runs
  input.oninput   = null;
  input.onkeyup   = null;
  input.onkeydown = null;

  // --- 3) Keyboard: Enter triggers Search, Backspace (and others) are left alone ---
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();      // prevent form submit
      btnGo.click();
    }
    // Do NOT preventDefault for Backspace or other keys
  });

  // --- 4) Clear button: clear & run search once to reset list ---
  btnX.addEventListener('click', function(){
    input.value = '';
    btnGo.click();
  });

  // --- 5) Search button: run original filter once, then update count ---
  btnGo.addEventListener('click', function(){
    if (btnGo.disabled) return;
    const label = btnGo.textContent;
    btnGo.textContent = 'Searching…';
    btnGo.disabled = true;
    try {
      runOriginalOnce(new Event('input'));
    } finally {
      requestAnimationFrame(updateCount);
      btnGo.disabled = false;
      btnGo.textContent = label;
    }
  });

  // --- 6) Count visible rows (lightweight) ---
  function updateCount(){
    const rows = list.querySelectorAll('.row');
    let visible = 0, i = 0;
    const CHUNK = 1200;
    function step(){
      const end = Math.min(i + CHUNK, rows.length);
      for (; i < end; i++){
        const r = rows[i];
        const css = getComputedStyle(r);
        if (css.display !== 'none' && !r.classList.contains('__hide')) visible++;
      }
      if (i < rows.length) requestAnimationFrame(step);
      else count.textContent = visible + ' / ' + rows.length;
    }
    requestAnimationFrame(step);
  }

  // --- 7) IME guard (optional for CJK input) ---
  input.addEventListener('compositionstart', () => { /* no-op: we don't run live */ });
  input.addEventListener('compositionend',   () => { /* user can press Search/Enter */ });

  // UX
  input.autocomplete = 'off';
  input.spellcheck   = false;
})();
</script>
<script src="info_dock_karaoke_live_v1.0.0.js"></script>

<script>
  // Wait until DOM is ready (the script is deferred, so DOM is loaded)
  const ui = healingFX.mount('#heal-toggle'); // if #heal-toggle isn't found, it falls back to <body>
</script>

<script src="fx_engine.js"></script>
<script src="fx_presets_config.js"></script>
<script src="fx_panel.js"></script>
<script src="tri_mode_smooth_scroll_inject_toggle_patch.js"></script>

<script>
document.addEventListener('DOMContentLoaded', () => {
  // 1) Initialize FX panel mounted to your controlCenter
  FXPanel.init({ mount: '#controlCenter' });

  // 2) Hide the floating badge so only your button toggles the panel
  const badge = document.querySelector('.fxbg-badge');
  if (badge) badge.style.display = 'none';

  // 3) Make the dock non-floating when mounted (static inside the control panel)
  const style = document.createElement('style');
  style.textContent = `
    /* Dock becomes part of the normal flow when mounted */
    #controlCenter .fxbg-dock {
      position: static !important;
      right: auto !important;
      bottom: auto !important;
      z-index: auto !important;
      width: 100%;
    }
  `;
  document.head.appendChild(style);

  // 4) Wire your button to toggle the FX panel open/close (manual-open only)
  const btn = document.getElementById('btnFx');
  btn?.addEventListener('click', () => {
    const panel = document.querySelector('#controlCenter .fxbg-panel');
    if (!panel) return;
    panel.classList.toggle('fxbg-hidden');

    // Persist collapsed state
    try {
      const LS_KEY = 'fxbg_panel_v2';
      const st = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      st.collapsed = panel.classList.contains('fxbg-hidden');
      localStorage.setItem(LS_KEY, JSON.stringify(st));
    } catch {}
  });

  // 5) Restore collapsed state from localStorage (keeps your manual-open preference)
  try {
    const LS_KEY = 'fxbg_panel_v2';
    const st = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (st.collapsed !== false) {
      document.querySelector('#controlCenter .fxbg-panel')?.classList.add('fxbg-hidden');
    }
  } catch {}

  // 6) Attach micro-dock to your burger panel/menu (if you’re using it)
  FXPanel.attachToMicroDock({
    menuId: 'mdPanelMenu',      // your menu container ID
    panelId: 'mdPanel',         // your micro-dock wrapper ID
    controlCenter: '#controlCenter',
    autoObserve: true,          // wait for menu if created later
    observeTimeout: 8000        // how long to keep watching (ms)
  });

  // 7) Choose ONE initial effect (uncomment the one you want)
  // FXPresets.apply('rain_default');          // Rain (Thunder OFF), intensity from slider mapping
  // FXPresets.apply('fireworks_mobile');      // Fireworks @ 0.80 (mobile baseline)
  FXPresets.auto();                            // Auto: Galaxy quiet if reduced-motion; 0.80 mobile / 0.85 desktop
});
</script>

  <script src="midi_root_selector.js"></script>
  <!-- Iframe Overlay (initially hidden) -->
<div id="iframe-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:9999; background:#fff;">
</div>

<script>
function openTool(url) {
  const wrapper = document.getElementById("iframe-overlay");
  wrapper.innerHTML = `
    <button onclick="closeTool()" style="position:absolute; top:10px; left:10px; z-index:10000; font-size:20px;">✖</button>
    <iframe src="${url}" style="width:100%; height:100%; border:none;"</iframe>
  `;
  wrapper.style.display = "block";
}

// Close and destroy iframe
function closeTool() {
  const wrapper = document.getElementById("iframe-overlay");
  wrapper.innerHTML = "";
  wrapper.style.display = "none";
}

// ESC key support
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    closeTool();
  }
});
</script>
</body>
</html>
