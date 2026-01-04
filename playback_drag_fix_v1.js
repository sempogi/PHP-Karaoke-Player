/*!
 * playback_drag_fix_v1.js
 * Make #pbPanel draggable on touch + mouse. Prefer WM.initWindow; fallback to pointer-drag.
 * v1.0.0 (2025-10-10)
 */
(function(){
  'use strict';
  if (window.__PB_DRAG_FIX__) return; window.__PB_DRAG_FIX__ = true;

  function el(id){ return document.getElementById(id); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rect(el){ return el.getBoundingClientRect(); }
  function restoreWithinViewport(win){
    var r = rect(win);
    if (r.width === 0 && r.height === 0) return;
    var L = clamp(r.left, 0, Math.max(0, innerWidth  - r.width));
    var T = clamp(r.top,  0, Math.max(0, innerHeight - Math.min(r.height, innerHeight)));
    win.style.left = L+'px'; win.style.top = T+'px';
    win.style.right='auto'; win.style.bottom='auto';
  }

  function ensureGrip(panel){
    var grip = panel.querySelector('.wm-grip');
    if (!grip){
      grip = document.createElement('div');
      grip.className = 'wm-grip';
      grip.setAttribute('aria-hidden','true');
      grip.style.position = 'absolute';
      grip.style.right = '6px';
      grip.style.bottom = '6px';
      grip.style.width = '14px';
      grip.style.height = '14px';
      grip.style.cursor = 'nwse-resize';
      panel.appendChild(grip);
    }
    return grip;
  }

  function fallbackPointerDrag(panel, head){
    panel.style.position = 'fixed';
    panel.style.willChange = 'left, top';
    restoreWithinViewport(panel);

    head.style.cursor = 'move';

    head.addEventListener('pointerdown', function(e){
      // start drag
      var r = rect(panel);
      var ox = e.clientX - r.left;
      var oy = e.clientY - r.top;

      try{ head.setPointerCapture(e.pointerId); }catch(_){}

      function move(ev){
        var L = clamp(ev.clientX - ox, 0, innerWidth  - panel.offsetWidth);
        var T = clamp(ev.clientY - oy, 0, innerHeight - Math.min(panel.offsetHeight, innerHeight));
        panel.style.left = L+'px';
        panel.style.top  = T+'px';
        panel.style.right='auto';
        panel.style.bottom='auto';
      }
      function up(ev){
        try{ head.releasePointerCapture(ev.pointerId); }catch(_){}
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup',   up);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup',   up);
      e.preventDefault();
    }, { passive:false });

    // resizer fallback
    var grip = ensureGrip(panel);
    grip.addEventListener('pointerdown', function(e){
      var r = rect(panel); var sx=e.clientX, sy=e.clientY, sw=r.width, sh=r.height;
      try{ grip.setPointerCapture(e.pointerId); }catch(_){}
      function move(ev){
        var w = clamp(sw + (ev.clientX - sx), 240, innerWidth);
        var h = clamp(sh + (ev.clientY - sy), 160, innerHeight);
        panel.style.width  = w+'px';
        panel.style.height = h+'px';
      }
      function up(ev){
        try{ grip.releasePointerCapture(ev.pointerId); }catch(_){}
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup',   up);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup',   up);
      e.preventDefault();
    }, { passive:false });

    window.addEventListener('resize', function(){ restoreWithinViewport(panel); });
  }

  function tryInit(){
    var panel = el('pbPanel');
    var head  = el('pbHead');
    if (!panel || !head){ setTimeout(tryInit, 200); return; }

    // If your WM is available, use it
    if (window.WM && typeof WM.initWindow === 'function'){
      ensureGrip(panel);
      if (!panel.classList.contains('win')) panel.classList.add('win');
      if (!head.classList.contains('drag')) head.classList.add('drag');

      var w = WM.initWindow('#pbPanel', '#pbHead', 'playback');
      if (w){ window.PlaybackPanel = w; }
      return;
    }

    // Fallback: native pointer-drag (works on mobile + desktop)
    fallbackPointerDrag(panel, head);
  }

  if (document.readyState !== 'loading') tryInit();
  else document.addEventListener('DOMContentLoaded', tryInit, { once:true });
})();