/*!
 * playback_floating_panel_patch_v1.js
 * Floating playback control window (Pause/Resume, Stop, Repeat One, Progress with seek when available).
 * - Non-invasive: standalone panel; does not touch bottom ticker.
 * - Works with your globals: ac, synth, songStart, isPlaying, quietStop(), feedNextIfAny(), lastMIDIBuf
 * - Repeat One persists to localStorage and wraps feedNextIfAny() safely.
 * v1.0.0 (2025-10-10)
 */
(function(){
  'use strict';
  if (window.__PB_FP_PATCH__) return; window.__PB_FP_PATCH__ = true;

  // ---------- helpers ----------
  function el(id){ return document.getElementById(id); }
  function clamp(v,a,b){ v=+v||0; return Math.max(a, Math.min(b, v)); }
  function onceReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  function fmt(s){ if(!isFinite(s)||s<0) s=0; var m=(s/60)|0, x=(s%60)|0; return (m<10?'0':'')+m+':'+(x<10?'0':'')+x; }
  function hasMIDIFile(){ return (typeof window.MIDIFile === 'function'); }

  // ---------- CSS ----------
  function injectCSS(){
    if (el('pbCSS')) return;
    var css = [
      /* Panel style (like your .win) */
      '#pbPanel{ position:fixed; z-index: var(--z-win-base, 300); right:12px; top:calc(120px + env(safe-area-inset-top));',
      '  width:min(520px, 96vw); background:rgba(16,22,28,.96); color:#e7eef8;',
      '  border:1px solid #2a3a4a; border-radius:12px; box-shadow:0 12px 28px rgba(0,0,0,.5);',
      '  display:none; flex-direction:column; }',
      '#pbPanel.visible{ display:flex }',
      '#pbHead{ margin:0; padding:8px 10px; display:flex; align-items:center; justify-content:space-between;',
      '  font:600 13px/1.2 system-ui; color:#cfe3ff; background:rgba(17,17,17,.65); border-bottom:1px solid rgba(255,255,255,.08); cursor:move }',
      '#pbBody{ padding:8px 10px; display:flex; flex-direction:column; gap:10px; flex:1 1 auto; min-height:0 }',
      '#pbBtns{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }',
      '.pb-btn{ background:#1b2633; border:1px solid #3a5166; color:#dfe8f3; border-radius:8px; padding:6px 10px; font:600 12px/1 system-ui }',
      '.pb-btn.active{ outline:2px solid #7ef9a7; outline-offset:1px }',
      '#pbProg{ display:flex; align-items:center; gap:8px }',
      '#pbSlider{ flex:1; appearance:none; height:6px; border-radius:999px; background:#203041; outline:none }',
      '#pbSlider::-webkit-slider-thumb{ appearance:none; width:16px; height:16px; border-radius:50%; background:#4fd1ff; border:1px solid #28485f }',
      '#pbTime{ font:12px/1.1 monospace; color:#cfe7ff; min-width:110px; text-align:right }',
      '#pbFoot{ display:flex; align-items:center; justify-content:flex-end; gap:8px }',
      '.pb-head-btn{ background:#232a33; border:1px solid #3a5166; color:#cfe3ff; border-radius:6px; padding:3px 8px; font-size:12px }',
      '.wm-grip.pb{ position:absolute; right:6px; bottom:6px; width:14px; height:14px; cursor:nwse-resize; opacity:.7;',
      '  background:linear-gradient(135deg,rgba(255,255,255,.0) 0 50%,rgba(255,255,255,.25) 50 100%),',
      '             linear-gradient(135deg,rgba(255,255,255,.0) 0 70%,rgba(255,255,255,.2) 70 100%); border-radius:3px }',
      '@media (orientation:landscape){ #pbPanel{ width:min(480px, 94vw) } }'
    ].join('');
    var st=document.createElement('style'); st.id='pbCSS'; st.textContent=css; document.head.appendChild(st);
  }

  // ---------- DOM ----------
  function buildPanel(){
    if (el('pbPanel')) return;
    var panel=document.createElement('section'); panel.id='pbPanel';
    panel.innerHTML =
      '<div id="pbHead" class="drag">'+
        '<span>Playback</span>'+
        '<span class="pb-head-tools">'+
          '<button id="pbMin" class="pb-head-btn" title="Minimize">—</button>'+
          '<button id="pbClose" class="pb-head-btn" title="Close">×</button>'+
        '</span>'+
      '</div>'+
      '<div id="pbBody">'+
        '<div id="pbBtns">'+
          '<button id="pbPause" class="pb-btn" title="Pause/Resume">⏯</button>'+
          '<button id="pbStop"  class="pb-btn" title="Stop">⏹</button>'+
          '<button id="pbRepeat" class="pb-btn" title="Repeat current song">🔁</button>'+
        '</div>'+
        '<div id="pbProg">'+
          '<input id="pbSlider" type="range" min="0" max="1000" step="1" value="0"/>'+
          '<div id="pbTime">00:00 / 00:00</div>'+
        '</div>'+
        '<div id="pbFoot"></div>'+
      '</div>'+
      '<div class="wm-grip pb" aria-hidden="true"></div>';
    document.body.appendChild(panel);

    // drag
    var head=el('pbHead'), sx=0, sy=0, ox=0, oy=0, dragging=false;
    head.addEventListener('mousedown', function(e){
      dragging=true; var r=panel.getBoundingClientRect(); sx=e.clientX; sy=e.clientY; ox=sx-r.left; oy=sy-r.top;
      function mv(ev){ if(!dragging) return; var x=ev.clientX, y=ev.clientY;
        var L=clamp(x-ox,0,innerWidth-r.width), T=clamp(y-oy,0,innerHeight-r.height);
        panel.style.left=L+'px'; panel.style.top=T+'px'; panel.style.right='auto'; panel.style.bottom='auto';
      }
      function up(){ dragging=false; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });

    // resizer
    var grip = panel.querySelector('.wm-grip.pb');
    grip.addEventListener('mousedown', function(e){
      var r=panel.getBoundingClientRect(); var sx=e.clientX, sy=e.clientY, sw=r.width, sh=r.height;
      function mv(ev){ var w=clamp(sw + (ev.clientX - sx), 320, innerWidth), h=clamp(sh + (ev.clientY - sy), 160, innerHeight);
        panel.style.width=w+'px'; panel.style.height=h+'px';
      }
      function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      e.preventDefault();
    });

    // close/min
    el('pbClose').addEventListener('click', function(){ panel.classList.remove('visible'); });
    el('pbMin').addEventListener('click', function(){
      var body=el('pbBody'); body.style.display = (body.style.display==='none') ? '' : 'none';
    });
  }

  // micro-dock menu hook
  function hookMicroDock(){
    try{
      var menu = document.getElementById('mdPanelMenu');
      if (!menu) return;
      if (!menu.querySelector('[data-open="playback"]')){
        var b=document.createElement('button');
        b.className='md-item'; b.setAttribute('data-open','playback'); b.textContent='Playback';
        menu.appendChild(b);
        menu.addEventListener('click', function(e){
          var t=e.target.closest('[data-open]'); if(!t) return;
          if (t.getAttribute('data-open')==='playback'){
            el('pbPanel').classList.add('visible');
          }
        });
      }
    }catch(_){}
  }

  // API
  window.PlaybackPanel = {
    show: function(){ injectCSS(); buildPanel(); el('pbPanel').classList.add('visible'); },
    hide: function(){ var p=el('pbPanel'); p && p.classList.remove('visible'); },
    toggle: function(){ var p=el('pbPanel'); if(!p) { injectCSS(); buildPanel(); } p.classList.toggle('visible'); }
  };

  // ---------- repeat-one wrapper ----------
  var REPEAT_KEY = 'pb:repeatOne';
  var repeatOne = (localStorage.getItem(REPEAT_KEY)||'off')==='on';
  function setRepeatUI(on){ var b=el('pbRepeat'); if(b){ b.classList.toggle('active', !!on); b.textContent = on ? '🔁 1' : '🔁'; } }
  function wrapRepeat(){
    if (window.feedNextIfAny && !window.feedNextIfAny.__pbRepeatWrapped){
      var orig = window.feedNextIfAny;
      window.feedNextIfAny = async function(){
        try{
          if (repeatOne && window.lastPlayed && window.lastMIDIBuf){
            if (window.isPlaying) await window.quietStop?.();
            await window.playSong?.(lastPlayed.rel, lastPlayed.name);
            return;
          }
        }catch(_){}
        return orig.apply(this, arguments);
      };
      window.feedNextIfAny.__pbRepeatWrapped = true;
    }
  }

  // ---------- duration via MIDIFile ----------
  var durSec = 0, lastSig = '';
  function bufSig(ab){
    try{
      var u=new Uint8Array(ab); return ((ab&&ab.byteLength)||0)+'-'+(u[0]|0)+'-'+(u[1]|0)+'-'+(u[2]|0)+'-'+(u[3]|0);
    }catch(_){ return String((ab&&ab.byteLength)||0); }
  }
  function computeDuration(ab){
    try{
      if (!ab || !hasMIDIFile()) return 0;
      var mf=new MIDIFile(ab);
      var evs=(typeof mf.getMidiEvents==='function')?(mf.getMidiEvents()||[]):(typeof mf.getEvents==='function')?(mf.getEvents()||[]):[];
      var maxMs=0; for (var i=0;i<evs.length;i++){ var t=(evs[i] && typeof evs[i].playTime==='number')?evs[i].playTime:0; if (t>maxMs) maxMs=t; }
      return (maxMs/1000)+1; // 1s tail guard
    }catch(_){ return 0; }
  }
  function ensureDuration(){
    try{
      if (!window.lastMIDIBuf) return;
      var sig = bufSig(window.lastMIDIBuf);
      if (sig===lastSig && durSec>0) return;
      lastSig = sig; durSec = computeDuration(window.lastMIDIBuf) || 0;
    }catch(_){}
  }

  // ---------- seek support ----------
  function canSeek(){
    try{
      return (!!window.synth &&
              (typeof synth.seekPlayer==='function' || typeof synth.setPlayerPosition==='function'));
    }catch(_){ return false; }
  }
  async function doSeek(targetSec){
    try{
      if (!canSeek()) return false;
      if (typeof synth.seekPlayer==='function'){
        await synth.seekPlayer(Math.max(0, targetSec||0)); return true;
      }
      if (typeof synth.setPlayerPosition==='function'){
        // Many builds accept ms; use seconds->ms
        synth.setPlayerPosition(Math.max(0, (targetSec||0)*1000)|0); return true;
      }
    }catch(_){}
    return false;
  }

  // ---------- wire buttons ----------
  var RAF=0, SLIDING=false, previewSec=0;
  function bindUI(){
    var pause=el('pbPause'), stop=el('pbStop'), rep=el('pbRepeat'), slider=el('pbSlider'), time=el('pbTime');

    pause && pause.addEventListener('click', async function(){
      try{
        if (!window.ac) return;
        if (ac.state==='running'){ await ac.suspend(); }
        else if (ac.state==='suspended'){ await ac.resume(); }
        else if (ac.state==='closed'){ await window.resumePlay?.(); }
      }catch(e){ console.warn('[PB] pause/resume error', e); }
    });

    stop && stop.addEventListener('click', async function(){
      try{ await window.quietStop?.(); }catch(_){}
    });

    rep && rep.addEventListener('click', function(){
      repeatOne = !repeatOne;
      localStorage.setItem(REPEAT_KEY, repeatOne ? 'on':'off');
      setRepeatUI(repeatOne);
    });

    slider && slider.addEventListener('input', function(){
      ensureDuration();
      if (!durSec) return;
      SLIDING = true;
      previewSec = (slider.valueAsNumber / 1000) * durSec;
      time.textContent = fmt(previewSec)+' / '+fmt(durSec);
    });

    slider && slider.addEventListener('change', async function(){
      ensureDuration();
      if (!durSec){ SLIDING=false; return; }
      var ok = await doSeek(previewSec);
      SLIDING=false;
      if (!ok){
        // leave playback as-is; we showed preview only
      }
    });
  }

  // ---------- raf updater ----------
  function tick(){
    cancelAnimationFrame(RAF);
    RAF = requestAnimationFrame(tick);
    try{
      ensureDuration();
      var slider=el('pbSlider'), time=el('pbTime');
      if (!slider || !time) return;

      var now=0;
      if (window.ac && typeof window.songStart==='number' && window.isPlaying){
        now = Math.max(0, ac.currentTime - (window.songStart||0));
      }

      var cur = SLIDING ? previewSec : now;
      var tot = durSec || 0;
      time.textContent = fmt(cur)+' / '+fmt(tot);

      if (!SLIDING){
        var val = (!tot || !isFinite(tot) || tot<=0) ? 0 : clamp(Math.round((cur/tot)*1000), 0, 1000);
        if (slider.valueAsNumber !== val) slider.value = String(val);
      }
    }catch(_){}
  }

  // ---------- optional status hook for auto-show ----------
  var _setStatus = window.setStatus;
  window.setStatus = function(msg){
    try{ _setStatus && _setStatus(msg); }catch(_){}
    try{
      if (msg==='PLAYING'){ /* Auto behaviors can be added if desired */ }
    }catch(_){}
  };

  // ---------- boot ----------
  function boot(){
    injectCSS();
    buildPanel();
    hookMicroDock();
    bindUI();
    setRepeatUI(repeatOne);
    wrapRepeat();
    cancelAnimationFrame(RAF);
    tick();
  }

  onceReady(boot);
})();