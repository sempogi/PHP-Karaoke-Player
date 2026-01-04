/* ch16_piano_ui_patch_v1.1.js
 * Header tools for Channel Piano (Range/Height/Theme) with persistence + auto re-apply
 * after SoundFont reload, status changes, and panel visibility changes.
 * No inline needed.
 */
(function(){
  const KEY_RANGE  = 'ch16Range';    // 'full' | 'piano'
  const KEY_HEIGHT = 'ch16RowH';     // px (14..60)
  const KEY_THEME  = 'ch16Theme';    // 'default' | 'neon' | 'mono'

  const THEMES={
    default:['#7ef9a7','#4fd1ff','#ffd166','#ff8e72','#ff6bd6','#ffffff','#c6ffdd','#fbd786','#f7797d','#a1c4fd','#c2ffd8','#fdcfe8','#9be15d','#f6d365','#fda085','#84fab0'],
    neon:['#7ef9a7','#7ef9d0','#7ef9ff','#c8a6ff','#ff6bd6','#ffd166','#ff8e72','#84fab0','#56ccf2','#a29bfe','#ffeaa7','#fab1a0','#55efc4','#74b9ff','#ffeaa7','#81ecec'],
    mono:['#e8e8e8','#d0d0d0','#b8b8b8','#a0a0a0','#888','#fff','#ccc','#ddd','#bbb','#aaa','#ccc','#eee','#999','#bbb','#aaa','#ddd']
  };

  const S = { range: load(KEY_RANGE,'full'), height: clamp(loadNum(KEY_HEIGHT,24),14,60), theme: load(KEY_THEME,'default'), els:{} };

  function load(k, d){ try{ const v=localStorage.getItem(k); return v? v : d; }catch(_){ return d; } }
  function loadNum(k, d){ try{ const v=parseInt(localStorage.getItem(k)||'',10); return isFinite(v)? v: d; }catch(_){ return d; } }
  function save(k,v){ try{ localStorage.setItem(k, String(v)); }catch(_){ } }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function applySettings(){
    try{
      if (!window.CH16Piano) return;
      // Range
      if (S.range==='piano') CH16Piano.setRange(21,108); else CH16Piano.setRange(0,127);
      // Height
      CH16Piano.setHeight(S.height);
      // Theme colors
      const pal = THEMES[S.theme] || THEMES.default; CH16Piano.setColors(pal);
      // Update labels
      if (S.els.btnRange) S.els.btnRange.textContent = 'Range: ' + (S.range==='piano'?'Piano':'Full');
      if (S.els.rngH && S.els.labHval) S.els.labHval.textContent = S.height + 'px';
      if (S.els.selTheme) S.els.selTheme.value = S.theme;
      // Force a one-time resize to re-blit backgrounds immediately
      try{ window.dispatchEvent(new Event('resize')); }catch(_){ }
    }catch(_){ }
  }

  // Re-apply settings on events that tend to reset visuals
  function installReapplyHooks(){
    // setStatus hook: on PLAYING/IDLE/APPLYING SF/LOADING SF
    const _set = window.setStatus;
    window.setStatus = function(msg){ try{ _set && _set(msg); }catch(_){ }
      try{ if (/PLAYING|IDLE|APPLYING\s+SF|LOADING\s+SF/i.test(String(msg||''))){ applySettings(); } }catch(_){ }
    };

    // Catalog or MIX16 name refresh
    try{ if (window.SimpleMapperCatalog){ const _r=SimpleMapperCatalog.refreshSF; if (typeof _r==='function'){ SimpleMapperCatalog.refreshSF=function(){ const x=_r.apply(this, arguments); try{ applySettings(); }catch(_){ } return x; }; } } }catch(_){ }
    try{ if (window.__MIX16){ const _n=__MIX16.refreshNames; if (typeof _n==='function'){ __MIX16.refreshNames=function(){ const x=_n.apply(this, arguments); try{ applySettings(); }catch(_){ } return x; }; } } }catch(_){ }

    // Panel visibility changes
    try{
      const pnl = document.getElementById('ch16Panel');
      if (pnl && window.MutationObserver){
        const mo = new MutationObserver(()=>{ if (pnl.classList.contains('visible')) applySettings(); });
        mo.observe(pnl, {attributes:true, attributeFilter:['class']});
      }
    }catch(_){ }
  }

  function ensureUI(){
    const panel = document.getElementById('ch16Panel'); if(!panel) return false;
    const head = panel.querySelector('h4'); if(!head) return false;
    if (head.querySelector('.ch16-tools')) return true; // already there

    const box=document.createElement('div'); box.className='ch16-tools'; box.style.display='flex'; box.style.gap='8px'; box.style.alignItems='center';

    // Range toggle
    const btnRange=document.createElement('button'); btnRange.className='small'; btnRange.title='Toggle range';
    btnRange.addEventListener('click', function(){ S.range = (S.range==='piano')? 'full' : 'piano'; save(KEY_RANGE,S.range); applySettings(); });

    // Height slider
    const labH=document.createElement('span'); labH.className='small'; labH.textContent='H';
    const rngH=document.createElement('input'); rngH.type='range'; rngH.min='14'; rngH.max='60'; rngH.step='2'; rngH.style.width='90px';
    const labHval=document.createElement('span'); labHval.className='small'; labHval.style.minWidth='36px'; labHval.style.textAlign='right';
    rngH.addEventListener('input', function(){ S.height = clamp(parseInt(rngH.value,10)||24,14,60); save(KEY_HEIGHT,S.height); applySettings(); });

    // Theme select
    const sel=document.createElement('select'); sel.className='small'; sel.title='Theme';
    ;['default','neon','mono'].forEach(id=>{ const o=document.createElement('option'); o.value=id; o.textContent='Theme: '+id; sel.appendChild(o); });
    sel.addEventListener('change', function(){ S.theme = sel.value || 'default'; save(KEY_THEME,S.theme); applySettings(); });

    // Compose
    const right = head.querySelector('span:last-child') || head;
    box.appendChild(btnRange); box.appendChild(labH); box.appendChild(rngH); box.appendChild(labHval); box.appendChild(sel);
    right.parentNode.insertBefore(box, right);

    // Save refs
    S.els.btnRange = btnRange; S.els.rngH = rngH; S.els.labHval = labHval; S.els.selTheme = sel;

    // Init values
    rngH.value = String(S.height);
    sel.value = S.theme;

    return true;
  }

  function init(){
    if (!ensureUI()) { setTimeout(init, 60); return; }
    installReapplyHooks();
    applySettings();
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
