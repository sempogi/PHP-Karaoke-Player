// bigger_lyrics_unlimited.js
// Generated: 2025-09-26 09:05
// Purpose: Allow lyrics font scale well beyond 260% with a configurable maximum.
// - Raises Size slider max to a configurable limit (default 600%).
// - Relaxes clamp in applyFontScale() to that limit.
// - Widens the lyrics window a bit for large text.
// - Adds console helpers: __LYR_SIZE.setMax(pct), __LYR_SIZE.setScale(pct).

(function(){
  // --- 0) Configurable cap via localStorage('lyrMaxPct'), default 600 (6.0x)
  function readMaxPct(){
    var v = parseInt(localStorage.getItem('lyrMaxPct')||'600',10);
    if (isNaN(v)) v = 600;
    return Math.max(180, Math.min(800, v)); // allow 180%..800%
  }
  var MAX_PCT = readMaxPct();

  // --- 1) Widen lyrics window for big text
  try{
    var st = document.createElement('style');
    st.id = 'bigger-lyrics-unlimited-style';
    st.textContent = '.fly{width:min(1400px,95vw)!important}';
    document.head.appendChild(st);
  }catch(e){}

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  onReady(function(){
    try{
      // --- 2) Raise Size slider cap
      var fs = document.getElementById('fsRange');
      if (fs){ fs.max = String(MAX_PCT); }

      // --- 3) Patch applyFontScale() to clamp with new ceiling
      if (typeof window.applyFontScale === 'function'){
        if (!window.__origApplyFontScale) window.__origApplyFontScale = window.applyFontScale;
        window.applyFontScale = function(){
          try{
            var cap = Math.max(1.0, (readMaxPct()/100)); // dynamic in case user changes via console
            var s = Math.max(0.8, Math.min(cap, window.lyrFontScale));
            var lyBody = document.getElementById('lyBody');
            if (lyBody) lyBody.style.setProperty('--fs', s);
            try{ localStorage.setItem('lyrFontScale', String(s)); }catch(e){}
            try{ if (typeof window.applyFSUI === 'function') window.applyFSUI(); }catch(e){}
          }catch(err){
            try{ window.__origApplyFontScale && window.__origApplyFontScale(); }catch(_){ }
          }
        };
      }

      // --- 4) Re-apply to reflect any new cap
      try{ if (typeof window.applyFontScale === 'function') window.applyFontScale(); }catch(e){}

      // --- 5) Console helpers
      window.__LYR_SIZE = {
        setMax: function(pct){
          var p = parseInt(pct,10); if(isNaN(p)) return;
          p = Math.max(180, Math.min(800, p));
          try{ localStorage.setItem('lyrMaxPct', String(p)); }catch(e){}
          // Update slider live if available
          var el = document.getElementById('fsRange'); if (el) el.max = String(p);
          // Re-apply to enforce new clamp
          try{ window.applyFontScale && window.applyFontScale(); }catch(e){}
          return p;
        },
        setScale: function(pct){
          var p = parseFloat(pct); if(isNaN(p)) return;
          var s = p/100; // convert to factor
          window.lyrFontScale = s;
          try{ window.applyFontScale && window.applyFontScale(); }catch(e){}
          return s;
        },
        get: function(){
          return { maxPct: readMaxPct(), scale: parseFloat(localStorage.getItem('lyrFontScale')||'')||null };
        }
      };
    }catch(e){}
  });
})();
