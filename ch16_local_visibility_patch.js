/* ch16_local_visibility_patch.js
 * Persist Channel Piano (#ch16Panel) visibility across reloads using localStorage.
 * - Applies the last saved state on load
 * - Updates localStorage whenever panel's .visible class changes
 * - Uses WM.ch16 if available; otherwise toggles .visible directly
 * - No inline JS needed; does not interfere with your global close handler
 */
(function(){
  'use strict';

  var SEL = '#ch16Panel';
  var KEY = 'ch16Vis';      // localStorage key: '1' (visible) | '0' (hidden)
  var panel = null;
  var mo = null;

  function $(s){ return document.querySelector(s); }
  function lsGet(k){ try { return localStorage.getItem(k); } catch(_) { return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(_) { } }

  function readVis(){ var v = lsGet(KEY); return (v==='1') ? true : (v==='0') ? false : null; }
  function writeVis(on){ lsSet(KEY, on ? '1' : '0'); }

  function showPanel(){ try { if (window.WM && WM.ch16 && typeof WM.ch16.show === 'function'){ WM.ch16.show(); } else { panel && panel.classList.add('visible'); } } catch(_) { panel && panel.classList.add('visible'); } }
  function hidePanel(){ try { if (window.WM && WM.ch16 && typeof WM.ch16.hide === 'function'){ WM.ch16.hide(); } else { panel && panel.classList.remove('visible'); } } catch(_) { panel && panel.classList.remove('visible'); } }

  function applyInitial(){ var pref = readVis(); if (pref === true) showPanel(); else if (pref === false) hidePanel(); }

  function watchPanel(){ if (!panel || !window.MutationObserver) return; if (mo){ try{ mo.disconnect(); }catch(_){ } }
    mo = new MutationObserver(function(muts){ for (var i=0;i<muts.length;i++){ var m=muts[i]; if (m.type==='attributes' && m.attributeName==='class'){ writeVis(panel.classList.contains('visible')); } } });
    mo.observe(panel, { attributes:true, attributeFilter:['class'] }); }

  function ensureCloseAttr(){ try { var head=$(SEL+' .drag'); if (!head) return; var right=head.querySelector('span:last-child')||head; var x=right.querySelector('#ch16Close'); if (!x){ x=document.createElement('button'); x.id='ch16Close'; x.className='close'; x.title='Close'; x.textContent='×'; right.appendChild(x); } x.setAttribute('data-close','ch16'); } catch(_){} }

  function install(){ panel=$(SEL); if(!panel) return; applyInitial(); watchPanel(); ensureCloseAttr();
    // Header CH16 button fallback
    document.addEventListener('click', function(e){ var btn=e.target && e.target.closest ? e.target.closest('#showCh16') : null; if(!btn) return; e.preventDefault(); try{ if (window.WM && WM.ch16 && typeof WM.ch16.toggle==='function'){ WM.ch16.toggle(); } else { panel.classList.toggle('visible'); } writeVis(panel.classList.contains('visible')); }catch(_){ panel.classList.toggle('visible'); writeVis(panel.classList.contains('visible')); } });
    // Keyboard toggle (C)
    document.addEventListener('keydown', function(e){ if(e.repeat) return; var k=(e.key||'').toLowerCase(); if(k==='c'){ try{ if (window.WM && WM.ch16 && typeof WM.ch16.toggle==='function'){ WM.ch16.toggle(); } else { panel.classList.toggle('visible'); } writeVis(panel.classList.contains('visible')); }catch(_){ panel.classList.toggle('visible'); writeVis(panel.classList.contains('visible')); } } });
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
