/* ch16_panel_wm_patch_v1.3.4.js
 * Channel Piano inside WM — STABLE build
 *
 * What’s new (vs v1.3.3):
 *  - Keyboard toggle: press "C" to toggle Channel Piano
 *  - Optional VISIBILITY persistence (safe): session-only, opt‑in via localStorage 'ch16Persist'='on'
 *  - Tiny debug badge (opt‑in): #ch16debug in URL or localStorage 'ch16Debug'='on'
 *  - Still: no capture handler; do not fight your global close logic
 *  - Header button + Micro‑dock deferred toggle; raw class toggle fallback
 */
(function(){
  const SEL       = '#ch16Panel';
  const HEAD_SEL  = '.drag';

  if (!document.querySelector(SEL)) return;
  if (window.__CH16_WM_V134__) return; window.__CH16_WM_V134__ = 1;

  // ---------- tiny helpers ----------
  function $(s, r){ return (r||document).querySelector(s); }
  function rect(el){ return el.getBoundingClientRect(); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function safeJSON(s){ try{ return JSON.parse(s); }catch(_){ return null; } }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(_){ } }

  // ---------- optional visibility persistence (session-only) ----------
  function persistOn(){ return (lsGet('ch16Persist')||'off') === 'on'; }
  function ssGet(k){ try{ return sessionStorage.getItem(k); }catch(_){ return null; } }
  function ssSet(k,v){ try{ sessionStorage.setItem(k,v); }catch(_){ } }

  function readVisibility(){ if (!persistOn()) return null; const v = ssGet('ch16Visible'); return (v==='1')? true : (v==='0')? false : null; }
  function writeVisibility(vis){ if (!persistOn()) return; ssSet('ch16Visible', vis? '1':'0'); }

  // ---------- best-effort placement (read-only from wm:ch16 once) ----------
  function readPlacement(){
    const st = safeJSON(lsGet('wm:ch16')) || {};
    const W = innerWidth || 1280, H = innerHeight || 720;
    const out = {
      left:  (typeof st.left === 'number'  && isFinite(st.left))  ? clamp(st.left,  0, Math.max(0, W-200)) : null,
      top:   (typeof st.top  === 'number'  && isFinite(st.top))   ? clamp(st.top,   0, Math.max(0, H-140)) : null,
      width: (typeof st.width=== 'number'  && isFinite(st.width)) ? clamp(st.width, 200, Math.floor(W*0.9)) : null,
      height:(typeof st.height=== 'number' && isFinite(st.height))? clamp(st.height,140, Math.floor(H*0.9)) : null,
      minimized: !!st.minimized,
      maximized: !!st.maximized,
      visible:   !!st.visible
    };
    return out;
  }

  function fixIntoViewport(win){ const r=rect(win); const W=innerWidth||1280, H=innerHeight||720; let L=r.left, T=r.top; let w=r.width, h=r.height; if (w>W) { w=W-24; win.style.width=w+'px'; } if (h>H){ h=H-24; win.style.height=h+'px'; } L=clamp(L,0,Math.max(0,W-w)); T=clamp(T,0,Math.max(0,H-h)); win.style.left=L+'px'; win.style.top=T+'px'; }

  // ---------- WM registration ----------
  function registerIntoWM(){
    if (!window.WM || window.WM.ch16) return; // already

    const win  = $(SEL);
    const head = win && win.querySelector(HEAD_SEL);
    if (!win || !head) return;

    win.classList.add('win');
    win.style.position='fixed';

    // ensure close with data-close="ch16" (let your global handler close it)
    (function ensureClose(){
      const right = head.querySelector('span:last-child') || head;
      let x = $('#ch16Close', right);
      if (!x){ x=document.createElement('button'); x.id='ch16Close'; x.className='close'; x.title='Close'; x.textContent='×'; right.appendChild(x); }
      x.setAttribute('data-close','ch16');
    })();

    // add Min/Max
    (function addChrome(){
      const right = head.querySelector('.wm-chrome') || (function(){
        const span=head.querySelector('span:last-child');
        const box=document.createElement('span'); box.className='wm-chrome';
        if (span) span.parentNode.insertBefore(box, span); else head.appendChild(box);
        return box; })();
      function mk(t,tt){ const b=document.createElement('button'); b.className='wm-btn'; b.textContent=t; b.title=tt; return b; }
      const bMin = mk('—','Minimize');
      const bMax = mk('▢','Maximize/Restore');
      right.prepend(bMax); right.prepend(bMin);
      bMin.addEventListener('click', ()=>{ win.classList.toggle('minimized'); win.classList.remove('maximized'); });
      bMax.addEventListener('click', ()=>{ const was=win.classList.contains('maximized'); if (was){ win.classList.remove('maximized'); fixIntoViewport(win); } else { win.classList.remove('minimized'); win.classList.add('maximized'); } });
    })();

    // resizer
    (function addGrip(){ let g=win.querySelector('.wm-grip'); if(!g){ g=document.createElement('div'); g.className='wm-grip'; win.appendChild(g);} if (g._bound) return; g._bound=1;
      g.addEventListener('mousedown', onDown); g.addEventListener('touchstart', onDown, {passive:false});
      function onDown(e){ if (win.classList.contains('maximized')) return; const r=rect(win);
        const sx=('touches'in e?e.touches[0].clientX:e.clientX), sy=('touches'in e?e.touches[0].clientY:e.clientY);
        const sW=r.width, sH=r.height, sL=r.left, sT=r.top;
        function mv(ev){ const x=('touches'in ev?ev.touches[0].clientX:ev.clientX), y=('touches'in ev?ev.touches[0].clientY:ev.clientY);
          win.style.width = clamp(sW + (x - sx), 200, innerWidth - sL) + 'px';
          win.style.height= clamp(sH + (y - sy), 140, innerHeight- sT) + 'px'; }
        function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv); document.removeEventListener('touchend', up); }
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv); document.addEventListener('touchend', up);
        e.preventDefault(); }
    })();

    // drag
    head.addEventListener('mousedown', startDrag);
    head.addEventListener('touchstart', startDrag, {passive:true});
    function startDrag(e){ if (win.classList.contains('maximized')) return; const r=rect(win);
      const sx=('touches'in e?e.touches[0].clientX:e.clientX), sy=('touches'in e?e.touches[0].clientY:e.clientY); const ox=sx-r.left, oy=sy-r.top;
      function mv(ev){ const x=('touches'in ev?ev.touches[0].clientX:ev.clientX), y=('touches'in ev?ev.touches[0].clientY:ev.clientY); let L=x-ox, T=y-oy; L=clamp(L,0,innerWidth - win.offsetWidth); T=clamp(T,0, Math.max(0, innerHeight - Math.min(win.offsetHeight, innerHeight))); win.style.left=L+'px'; win.style.top=T+'px'; win.style.right='auto'; win.style.bottom='auto'; }
      function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.removeEventListener('touchmove', mv); document.removeEventListener('touchend', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); document.addEventListener('touchmove', mv); document.addEventListener('touchend', up);
    }

    // initial placement (read-only from storage; safe defaults otherwise)
    (function place(){
      const st = readPlacement();
      const W = innerWidth || 1280, H = innerHeight || 720;
      const width  = st.width  || clamp(Math.floor(W*0.34), 320, 620);
      const height = st.height || clamp(Math.floor(H*0.36), 200, 520);
      const left   = st.left   || clamp(W - width - 16, 0, Math.max(0, W - width));
      const top    = st.top    || clamp(16, 0, Math.max(0, H - height));
      win.style.width = width+'px';
      win.style.height= height+'px';
      win.style.left  = left+'px';
      win.style.top   = top+'px';
      if (st.minimized) win.classList.add('minimized');
      if (st.maximized) win.classList.add('maximized');
      // visibility prefers session override
      const visOverride = readVisibility();
      if (visOverride===true) win.classList.add('visible');
      else if (visOverride===false) win.classList.remove('visible');
      else if (st.visible) win.classList.add('visible');
      fixIntoViewport(win);
    })();

    // expose via WM
    window.WM.ch16 = {
      show(){ win.classList.remove('minimized'); win.classList.remove('maximized'); win.classList.add('visible'); fixIntoViewport(win); writeVisibility(true); },
      hide(){ win.classList.remove('visible'); writeVisibility(false); },
      toggle(){ const to = !win.classList.contains('visible'); if (to){ this.show(); } else { this.hide(); } },
      element: win
    };

    // If user clicked early, honor it now
    if (window.__CH16_DEFER_TOGGLE__){ try{ window.WM.ch16.toggle(); }catch(_){ } window.__CH16_DEFER_TOGGLE__=0; }
  }

  // ---------- header button & micro-dock — toggle must ALWAYS work ----------
  function ensureHeaderBtn(){ const header=$('header'); if(!header) return; let btn=$('#showCh16'); if(!btn){ btn=document.createElement('button'); btn.id='showCh16'; btn.className='small'; btn.title='Channel Piano'; btn.textContent='CH16'; header.appendChild(btn);} if (btn._bound) return; btn._bound=1; btn.addEventListener('click', function(e){ e.preventDefault(); try{ if (window.WM && window.WM.ch16){ window.WM.ch16.toggle(); } else { window.__CH16_DEFER_TOGGLE__ = 1; registerIntoWM(); } }catch(_){ const pnl=$(SEL); pnl && pnl.classList.toggle('visible'); } }); }

  function ensureDock(){ const menu=$('#mdPanelMenu'); if(!menu) return; if (menu.querySelector('[data-open="ch16"]')) return; const b=document.createElement('button'); b.className='md-item'; b.setAttribute('data-open','ch16'); b.textContent='Channel Piano'; menu.appendChild(b); menu.addEventListener('click', function(e){ const t=e.target && e.target.getAttribute ? e.target.getAttribute('data-open') : null; if (t==='ch16'){ e.preventDefault(); try{ if (window.WM && window.WM.ch16){ window.WM.ch16.toggle(); } else { window.__CH16_DEFER_TOGGLE__=1; registerIntoWM(); } }catch(_){ const pnl=$(SEL); pnl && pnl.classList.toggle('visible'); } } }, true); }

  // ---------- keyboard toggle (C) ----------
  function ensureKeyboard(){ document.addEventListener('keydown', function(e){ if (e.repeat) return; const k=(e.key||'').toLowerCase(); if (k==='c'){ try{ if (window.WM && window.WM.ch16){ window.WM.ch16.toggle(); } else { window.__CH16_DEFER_TOGGLE__=1; registerIntoWM(); } }catch(_){ const pnl=$(SEL); pnl && pnl.classList.toggle('visible'); } } }); }

  // ---------- optional debug badge ----------
  function debugOn(){ if (/#ch16debug/i.test(location.hash)) return true; return (lsGet('ch16Debug')||'off')==='on'; }
  function ensureDebug(){ if (!debugOn()) return; const tag=document.createElement('span'); tag.className='small'; tag.style.marginLeft='8px'; tag.style.padding='2px 6px'; tag.style.border='1px solid rgba(255,255,255,.15)'; tag.style.borderRadius='6px'; tag.style.background='rgba(17,17,17,.35)'; tag.style.color='#cbd'; function upd(){ const ready = !!(window.WM && window.WM.ch16); const vis = ($(SEL)?.classList.contains('visible'))?'ON':'OFF'; const def = window.__CH16_DEFER_TOGGLE__?'YES':'NO'; tag.textContent='CH16 ready:'+ready+' vis:'+vis+' defer:'+def; } setInterval(upd, 500); const header=$('header'); if (header) header.appendChild(tag); }

  // ---------- install ----------
  function install(){ ensureHeaderBtn(); ensureDock(); ensureKeyboard(); ensureDebug();
    function tryRegister(){ try{ registerIntoWM(); }catch(_){ } }
    if (window.WM && typeof window.WM.init==='function'){ if (!window.__CH16_WM_V134_HOOKED__){ window.__CH16_WM_V134_HOOKED__=1; const _init=window.WM.init; window.WM.init=function(){ const r=_init.apply(this, arguments); tryRegister(); return r; }; } tryRegister(); } else { let i=0; const iv=setInterval(function(){ if (window.WM && typeof window.WM.init==='function'){ clearInterval(iv); tryRegister(); } if (++i>50) clearInterval(iv); }, 40); }
  }

  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', install, {once:true}); } else { install(); }
})();
