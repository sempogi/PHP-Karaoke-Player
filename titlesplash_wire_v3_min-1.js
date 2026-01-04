(function(){
  const COUNTDOWN_HIDE_MS = 2000;  // hide ~2s after countdown begins
  const FORCE_HIDE_TIMEOUT_MS = 10000; // fallback: force hide after 10s

  let firstLyricFired = false;
  let countdownFired  = false;

  function ready(){ return (typeof window.TitleSplash === 'object' && window.TitleSplash); }
  function safe(fn){ try{ fn && fn(); }catch(e){} }

  function callCountdown(){ if (countdownFired) return; countdownFired = true; safe(()=> ready() && TitleSplash.countdownStarted(COUNTDOWN_HIDE_MS)); }
  function callLyricFirst(){ if (firstLyricFired) return; firstLyricFired = true; safe(()=> ready() && TitleSplash.lyricFirst()); }

  function isLyricHighlight(el){
    try{
      if (!el || el.nodeType !== 1 || !el.classList) return false;
      const c = el.classList;
      return (c.contains('w') && c.contains('on')) || (c.contains('line') && c.contains('active'));
    }catch(_){ return false; }
  }

  function findCountdownEl(){ return document.getElementById('lyCountOverlay'); }
  function findLyricsRoot(){ return document.getElementById('lyBody'); }

  function observeCountdown(){
    const el = findCountdownEl();
    if (!el) return;
    const visible = getComputedStyle(el).display !== 'none';
    if (visible) callCountdown();
    const mo = new MutationObserver((list)=>{
      for (const m of list){
        if (m.type === 'attributes' && m.attributeName === 'style'){
          const vis = getComputedStyle(el).display !== 'none';
          if (vis) { callCountdown(); mo.disconnect(); break; }
        }
      }
    });
    mo.observe(el, { attributes:true, attributeFilter:['style'] });
  }

  function observeFirstHighlight(){
    const root = findLyricsRoot();
    if (!root) return;
    const hit = root.querySelector('.w.on, .line.active');
    if (hit){ callLyricFirst(); return; }
    const mo = new MutationObserver((list)=>{
      for (const m of list){
        if (m.type === 'childList'){
          m.addedNodes && m.addedNodes.forEach(node=>{
            if (node && node.nodeType === 1){
              if (isLyricHighlight(node) || node.querySelector?.('.w.on, .line.active')){
                callLyricFirst(); mo.disconnect();
              }
            }
          });
        } else if (m.type === 'attributes' && isLyricHighlight(m.target)){
          callLyricFirst(); mo.disconnect();
        }
        if (firstLyricFired) break;
      }
    });
    mo.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  }

  function resetPerSong(){
    firstLyricFired = false;
    countdownFired = false;
  }

  function hookStatus(){
    const orig = window.setStatus;
    window.setStatus = function(msg){
      try{ orig && orig.apply(this, arguments); }catch(_){}
      try{
        if (msg === 'PLAYING'){
          resetPerSong();
          let tries = 0; const MAX = 40;
          const t = setInterval(()=>{
            const el = findCountdownEl();
            if (el || tries++ >= MAX){ clearInterval(t); observeCountdown(); }
          }, 50);
          observeFirstHighlight();

          // 🔥 Manual fallback timeout
          setTimeout(()=>{
            if (!countdownFired && !firstLyricFired){
              safe(()=> ready() && TitleSplash.countdownStarted(0));
            }
          }, FORCE_HIDE_TIMEOUT_MS);
        }
        if (msg === 'IDLE'){ resetPerSong(); }
      }catch(_){}
    };
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', hookStatus);
  } else {
    hookStatus();
  }
})();