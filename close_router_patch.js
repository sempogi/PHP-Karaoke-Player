/* close_router_patch.js
 * Route clicks on X (button.close[data-close="..."]) to the correct window,
 * including the Channel Piano panel (data-close="ch16").
 *
 * Design goals:
 *  - Do NOT fight your existing global close handler (we do NOT stop propagation).
 *  - Work even if WM is not ready yet (fall back to removing .visible class).
 *  - Zero inline JS needed—drop this file after your WM patches.
 */
(function(){
  'use strict';

  function $(sel){ return document.querySelector(sel); }

  // Ensure piano X button carries data-close="ch16"
  function ensureCh16CloseAttr(){
    try{
      var head = $('#ch16Panel .drag');
      if (!head) return;
      var right = head.querySelector('span:last-child') || head;
      var x = right.querySelector('#ch16Close');
      if (!x){
        x = document.createElement('button');
        x.id = 'ch16Close';
        x.className = 'close';
        x.title = 'Close';
        x.textContent = '×';
        right.appendChild(x);
      }
      x.setAttribute('data-close', 'ch16');
    }catch(_){ }
  }

  // Hide via WM if available; otherwise fall back to removing .visible
  function hideByKey(which){
    if (!which) return;
    try{ if (window.WM && WM[which] && typeof WM[which].hide === 'function'){ WM[which].hide(); return; } }catch(_){ }

    var el = null;
    if (which === 'browser') el = $('#browserPanel');
    else if (which === 'queue') el = $('#queuePanel');
    else if (which === 'bg') el = $('#bgPanel');
    else if (which === 'cc') el = $('#ccPanel');
    else if (which === 'lyrics') el = $('#lyWin');
    else if (which === 'ch16') el = $('#ch16Panel');
    if (el) el.classList.remove('visible');
  }

  function install(){
    ensureCh16CloseAttr();

    // Capture-phase listener (matches your page-level handler timing).
    // IMPORTANT: we DO NOT stopPropagation here so we won't interfere.
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest ? e.target.closest('button.close') : null;
      if (!btn) return;
      var which = String(btn.getAttribute('data-close')||'').toLowerCase();
      hideByKey(which);
    }, true);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
