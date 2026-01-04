// bigger_lyrics_patch.js
// Generated: 2025-09-26 08:48
// Makes lyrics larger on desktop: wider window, bigger default scale, larger slider range, relaxed clamp
(function(){
  try{
    // 1) Widen lyrics window on desktop
    var st = document.createElement('style');
    st.id = 'bigger-lyrics-patch-style';
    st.textContent = '.fly{width:min(1200px,92vw)!important}';
    document.head.appendChild(st);
  }catch(e){}

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  onReady(function(){
    try{
      // 2) Increase Size slider cap to 260%
      var fs = document.getElementById('fsRange');
      if (fs) fs.max = '260';

      // 3) Relax clamp in applyFontScale to allow up to 2.6x
      if (typeof window.applyFontScale === 'function'){
        var patched = function(){
          try{
            var s = Math.max(0.8, Math.min(2.6, window.lyrFontScale));
            var lyBody = document.getElementById('lyBody');
            if (lyBody) lyBody.style.setProperty('--fs', s);
            try{ localStorage.setItem('lyrFontScale', String(s)); }catch(e){}
            try{ if (typeof window.applyFSUI === 'function') window.applyFSUI(); }catch(e){}
          }catch(e){
            // Fallback to original if anything breaks
            try{ window.__origApplyFontScale && window.__origApplyFontScale(); }catch(_){ }
          }
        };
        // Save original once
        if (!window.__origApplyFontScale) window.__origApplyFontScale = window.applyFontScale;
        window.applyFontScale = patched;
      }

      // 4) Set larger desktop default if not yet saved
      var hasSaved = (localStorage.getItem('lyrFontScale') != null);
      if (!hasSaved && (window.innerWidth||0) >= 1200){
        try{ localStorage.setItem('lyrFontScale','1.72'); }catch(e){}
      }

      // 5) Re-apply now so UI reflects changes
      try{ if (typeof window.applyFontScale === 'function') window.applyFontScale(); }catch(e){}
    }catch(e){}
  });
})();
