
<?php
/**
 * apply_lite_patch.php
 * - Reads index.php in the same folder
 * - Removes the heavy Intro/Outro + old countdown block
 * - Removes any previous Lite block (to avoid duplicates)
 * - Injects the new Lite Countdown block before </body>
 * - Writes out index_merged_lite_countdown.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$srcFile = __DIR__ . '/test2.php';
$dstFile = __DIR__ . '/index_merged_lite_countdown.php';

if (!is_file($srcFile)) {
  http_response_code(500);
  die('ERROR: index.php not found in ' . htmlspecialchars(__DIR__, ENT_QUOTES, 'UTF-8'));
}

$in = file_get_contents($srcFile);
if ($in === false) {
  http_response_code(500);
  die('ERROR: Cannot read index.php');
}

/* 1) Remove heavy Intro/Outro patch (style + script) */
$in = preg_replace(
  '~<style\s+id=["\']lyrics-anim-countdown-css["\'][\s\S]*?</style>\s*~i',
  '',
  $in
);
$in = preg_replace(
  '~<!--\s*=+\s*Lyrics Intro/Outro \+ Countdown Patch\s*=+\s*-->\s*<script\s+id=["\']lyrics-anim-countdown-js["\'][\s\S]*?</script>\s*~i',
  '',
  $in
);

/* 2) Remove any previous Lite block (avoid duplicates) */
$in = preg_replace(
  '~<style\s+id=["\']lyr-countdown-lite-css["\'][\s\S]*?</style>\s*<script\s+id=["\']lyr-countdown-lite-js["\'][\s\S]*?</script>\s*~i',
  '',
  $in
);

/* 3) Prepare the new Lite block */
$lite = <<<HTML

<!-- === Lyrics Countdown LITE (auto-adjust; shows only at N seconds before first lyric) === -->
<style id="lyr-countdown-lite-css">
  #lyBody{ position:relative; }
  #lyCountOverlay{
    position:absolute; inset:0; display:none; align-items:center; justify-content:center;
    pointer-events:none; z-index:3;
  }
  #lyCountOverlay .lyDigit{
    color:#fff; font-weight:900; text-align:center; line-height:1;
    font-size:clamp(36px, calc(var(--fs,1)*2.2rem + 2vw), 86px);
    text-shadow:0 10px 28px rgba(0,0,0,.5);
  }
</style>
<script id="lyr-countdown-lite-js">
(function(){
  var overlay, digit; var rafTick=0, rafWait=0; var endTs=0;
  // Configure countdown length: 3 or 5 (set via localStorage: lyCountLen)
  var COUNT_LEN = parseInt(localStorage.getItem('lyCountLen') || '3', 10) || 3;
  var EPS = 0.06; // small threshold to avoid flicker at boundaries

  function ensure(){
    var host = document.getElementById('lyBody'); if(!host) return null;
    overlay = document.getElementById('lyCountOverlay');
    if(!overlay){
      overlay = document.createElement('div'); overlay.id='lyCountOverlay';
      overlay.style.display='none'; overlay.style.alignItems='center'; overlay.style.justifyContent='center';
      overlay.style.pointerEvents='none'; overlay.style.zIndex='3';
      host.appendChild(overlay);
    }
    digit = overlay.querySelector('.lyDigit');
    if(!digit){ digit = document.createElement('div'); digit.className='lyDigit'; overlay.appendChild(digit); }
    return overlay;
  }

  function firstLyricTime(){
    try{
      var j=(window.lastLyrics && Array.isArray(lastLyrics.lines))? lastLyrics : null;
      if(!j) return null;
      var t=null;
      for(var i=0;i<j.lines.length;i++){
        var L=j.lines[i]; if(!L||!Array.isArray(L.words)) continue;
        for(var k=0;k<L.words.length;k++){
          var w=L.words[k];
          if(typeof w.t==='number'){ if(t==null||w.t<t) t=w.t; }
        }
      }
      return (t==null)? null : Math.max(0,t);
    }catch(e){ return null; }
  }

  function hide(){ cancelAnimationFrame(rafTick); cancelAnimationFrame(rafWait); rafTick=0; rafWait=0;
    if(overlay) overlay.style.display='none'; }
  function show(){ if(overlay) overlay.style.display='flex'; }

  function tick(){
    cancelAnimationFrame(rafTick);
    var now = window.ac ? (window.ac.currentTime - (window.songStart||0)) : 0;
    var remain = Math.max(0, endTs - now);
    if(remain <= 0.08){ hide(); return; }
    var d = Math.ceil(remain); if(d>COUNT_LEN) d=COUNT_LEN; if(d<=0){ hide(); return; }
    if(digit && digit._last!==d){ digit.textContent=d; digit._last=d; }
    rafTick = requestAnimationFrame(tick);
  }

  function beginCountdown(first){ if(!ensure()) return; endTs=first; if(digit) digit._last=-1; show(); tick(); }

  function waitUntilWindowStart(first){
    cancelAnimationFrame(rafWait);
    function loop(){
      var now = window.ac ? (window.ac.currentTime - (window.songStart||0)) : 0;
      // Show only when we reach N seconds before the first lyric
      if(now + EPS >= (first - COUNT_LEN)){ beginCountdown(first); return; }
      rafWait = requestAnimationFrame(loop);
    }
    rafWait = requestAnimationFrame(loop);
  }

  function maybeStart(){
    if(!ensure()) return;
    if(!window.ac || !window.isPlaying) return;
    var first = firstLyricTime(); if(first==null || !isFinite(first)) return;
    var now = window.ac.currentTime - (window.songStart||0);
    if(now + EPS >= (first - COUNT_LEN)){ beginCountdown(first); }
    else { hide(); waitUntilWindowStart(first); }
  }

  // Chain into setStatus
  var _setStatus = window.setStatus;
  window.setStatus = function(msg){
    try{ _setStatus && _setStatus(msg); }catch(e){}
    try{
      if(msg==='PLAYING'){ hide(); maybeStart(); }
      if(msg==='IDLE'){ hide(); }
    }catch(e){}
  };

  // Console helpers
  window.__LY_COUNT = {
    setLen:function(n){ localStorage.setItem('lyCountLen', String(n||3)); COUNT_LEN = n||3; },
    start: maybeStart, stop: hide
  };
})();
</script>

HTML;

/* 4) Inject before </body> (or append if not found) */
if (stripos($in, '</body>') !== false) {
  $out = str_ireplace('</body>', $lite . "\n</body>", $in);
} else {
  $out = $in . "\n" . $lite;
}

/* 5) Write */
if (file_put_contents($dstFile, $out) === false) {
  http_response_code(500);
  die('ERROR: Cannot write ' . basename($dstFile));
}

/* 6) Done */
echo '<h3>✅ Merged file created</h3>';
echo '<p><a href="'.htmlspecialchars(basename($dstFile), ENT_QUOTES, 'UTF-8').'" download>Download: '.htmlspecialchars(basename($dstFile), ENT_QUOTES, 'UTF-8').'</a></p>';
echo '<p>Countdown length now is <b>' . (int)(@$_COOKIE['x']?0:0) . '</b>. You can change later in console:<br><code>localStorage.setItem(\"lyCountLen\",\"5\")</code> (then reload)</p>';
