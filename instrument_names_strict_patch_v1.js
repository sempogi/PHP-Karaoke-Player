/*
 * instrument_names_strict_patch_v1.js
 * Ensures STRICT SF-only instrument naming across the UI.
 * - Primary source: SFCatalog (built from the currently loaded SF2 phdr)
 * - Optional secondary (for first-frame timing races): SimpleMapperCatalog.resolveName()
 * - Fallback: numeric string "MSB x / LSB y / PG z"
 * - Never uses GM/GS fallback names.
 *
 * Drop this AFTER your CH16 core + piano scripts.
 * It is safe to include anywhere after the SoundFont loader hook is set.
 *
 * v1.0.0  (2025-10-16)
 */
;(function(){
  'use strict';

  // === Config ===
  // Allow consulting SimpleMapperCatalog (still SF-only) when SFCatalog hasn't delivered yet
  // Set to false if you want ultra-strict: SFCatalog only, then numeric fallback.
  var USE_SIMPLEMAPPER_SECONDARY = true;

  // Enable verbose console logs if you set localStorage['ch16StrictNamesDebug'] = 'on'
  var DEBUG = false;
  try { DEBUG = (localStorage.getItem('ch16StrictNamesDebug') === 'on'); } catch(_) {}

  function log(){ if (DEBUG && typeof console !== 'undefined') try{ console.log.apply(console, arguments); }catch(_){} }
  function warn(){ if (DEBUG && typeof console !== 'undefined') try{ console.warn.apply(console, arguments); }catch(_){} }

  // --- helpers ---
  function toInt(x){ return (x|0); }
  function numeric(msb, lsb, pg){ return 'MSB ' + toInt(msb) + ' / LSB ' + toInt(lsb) + ' / PG ' + toInt(pg); }

  function nameFromSF(msb, lsb, pg){
    try {
      if (typeof window.SFCatalog !== 'undefined' && typeof window.SFCatalog.name === 'function'){
        var n = window.SFCatalog.name(toInt(msb), toInt(lsb), toInt(pg));
        return n || '';
      }
    } catch(e){ warn('[StrictNames] SFCatalog.name error:', e); }
    return '';
  }

  function nameFromSM(msb, lsb, pg){
    if (!USE_SIMPLEMAPPER_SECONDARY) return '';
    try {
      var sm = window.SimpleMapperCatalog;
      if (sm && typeof sm.resolveName === 'function'){
        var sfont = (window.sfSelected || window.__LAST_SF_NAME__ || '');
        var n = sm.resolveName(toInt(msb), toInt(lsb), toInt(pg), { sfont: sfont });
        return n || '';
      }
    } catch(e){ warn('[StrictNames] SimpleMapperCatalog.resolveName error:', e); }
    return '';
  }

  function resolvePresetNameStrict(msb, lsb, pg){
    var n = nameFromSF(msb, lsb, pg);
    if (!n) n = nameFromSM(msb, lsb, pg);
    return n || numeric(msb, lsb, pg);
  }

  // export helper (optional use by other modules)
  try { window.resolvePresetNameStrict = resolvePresetNameStrict; } catch(_) {}

  // --- Patch __MIX16.getPatch to normalize names everywhere ---
  function installGetPatchWrapper(){
    try {
      var M = window.__MIX16;
      if (!M || typeof M.getPatch !== 'function' || M.__strictNames) return false;
      var _get = M.getPatch;
      M.getPatch = function(ch){
        var p = _get.apply(this, arguments);
        if (!p) return p;
        try {
          var msb = toInt(p.bankMSB), lsb = toInt(p.bankLSB), pg = toInt(p.program);
          var nm  = resolvePresetNameStrict(msb, lsb, pg);
          // return normalized object (do not mutate original if callers reuse it)
          var out = {};
          for (var k in p) if (Object.prototype.hasOwnProperty.call(p,k)) out[k] = p[k];
          out.name = nm;
          return out;
        } catch(e){ warn('[StrictNames] getPatch normalize error:', e); return p; }
      };
      M.__strictNames = true;
      log('[StrictNames] __MIX16.getPatch wrapped');
      return true;
    } catch(e){ warn('[StrictNames] installGetPatchWrapper error:', e); return false; }
  }

  // --- After attaching, trigger a repaint if available ---
  function requestRepaint(){
    try {
      if (window.__MIX16 && typeof window.__MIX16.refreshNames === 'function'){
        window.__MIX16.refreshNames({ fallback: false });
        log('[StrictNames] __MIX16.refreshNames(fallback:false) called');
      }
    } catch(e){ warn('[StrictNames] requestRepaint error:', e); }
  }

  // --- Attempt installation now, then retry briefly until __MIX16 is ready ---
  (function boot(){
    if (installGetPatchWrapper()) { requestRepaint(); return; }
    var tries = 0;
    var t = setInterval(function(){
      if (installGetPatchWrapper()) { clearInterval(t); requestRepaint(); return; }
      if (++tries > 60) { clearInterval(t); warn('[StrictNames] __MIX16 not ready after retries'); }
    }, 50);
  })();

})();
