// mixer_mobile_free_drag_patch_v2.js
// Fixes: close button blocked by drag pad; enables drag pad only on touch/mobile or small screens.
// Adds: first-time centering when entering free mode (if no saved position).
(function(){
  const STORE = 'wm:';
  const KEY = 'mix16';
  const FREE_KEY = STORE + KEY + ':free';
  const POS_KEY  = STORE + KEY; // same as WM uses

  function injectCSS(){
    if (document.getElementById('mix16FreeCSSv2')) return;
    const css = `
#mix16Panel{ touch-action:none; }
/* Default: drag pad is hidden so desktop users aren't affected */
#mix16Panel .mix-drag-pad{ position:absolute; left:0; top:0; height:40px; right:160px; /* leave space for wm chrome + close */
  cursor:move; background:transparent; z-index:2; pointer-events:auto; display:none }
/* Activate the drag pad only on touch devices or small screens */
@media (hover:none), (max-width:700px){
  #mix16Panel .mix-drag-pad{ display:block; }
}
/* Free mode override (release bottom sheet constraints on small screens) */
@media (max-width:700px){
  #mix16Panel.free{
    left:auto !important; right:auto !important; top:auto !important; bottom:auto !important;
    width:auto !important; max-width:92vw !important; border-radius:12px !important; max-height:78vh !important;
  }
}
`;
    const st = document.createElement('style'); st.id='mix16FreeCSSv2'; st.textContent = css; document.head.appendChild(st);
  }

  function ensurePanel(cb){
    const el = document.getElementById('mix16Panel');
    if (el) { cb(el); return; }
    const obs = new MutationObserver(()=>{
      const p = document.getElementById('mix16Panel');
      if (p){ try{ obs.disconnect(); }catch(e){} cb(p); }
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function persistFree(on){ try{ localStorage.setItem(FREE_KEY, on?'on':'off'); }catch(e){} }
  function loadFree(){ try{ return (localStorage.getItem(FREE_KEY)||'off')==='on'; }catch(e){ return false; } }
  function loadPos(){ try{ return JSON.parse(localStorage.getItem(POS_KEY)||'null'); }catch(e){ return null; } }

  function centerIfFirst(panel){
    // If no saved position/size, center the panel roughly in viewport
    const st = loadPos();
    if (st && typeof st.left==='number' && typeof st.top==='number') return;
    const r = panel.getBoundingClientRect();
    const W = Math.min(Math.max(560, r.width||560), Math.max(320, window.innerWidth*0.92));
    const H = Math.min(Math.max(360, r.height||360), Math.max(220, window.innerHeight*0.78));
    const L = Math.max(0, Math.round((window.innerWidth  - W)/2));
    const T = Math.max(0, Math.round((window.innerHeight - H)/3));
    panel.style.width  = W + 'px';
    panel.style.height = H + 'px';
    panel.style.left   = L + 'px';
    panel.style.top    = T + 'px';
  }

  function bind(panel){
    injectCSS();
    // Add an invisible drag pad over the left/middle of the header; keep buttons on the right clickable
    let head = panel.querySelector('.drag');
    if (head && !panel.querySelector('.mix-drag-pad')){
      const pad = document.createElement('div'); pad.className = 'mix-drag-pad';
      head.appendChild(pad);
      // Do not toggle free mode just by touching; only on resize or when explicitly requested
      // The header drag is already handled by WM; the pad only improves touch hit-area.
    }

    // Mark free when user touches the resize grip (common intent on phones)
    const grip = panel.querySelector('.wm-grip');
    if (grip){
      const toFree = ()=>{ panel.classList.add('free'); persistFree(true); centerIfFirst(panel); };
      grip.addEventListener('mousedown', toFree);
      grip.addEventListener('touchstart', toFree, {passive:true});
    }

    // Restore saved state
    if (loadFree()) panel.classList.add('free');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> ensurePanel(bind));
  } else {
    ensurePanel(bind);
  }
})();
