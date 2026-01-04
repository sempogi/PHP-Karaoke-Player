/**
 * mapper_mix16_bridge_v2.1_nofallback.js
 * Date: 2025-10-09 10:23:05
 * v2.1: Disables Mixer fallback naming for untouched channels (keeps '—' until real CC/PC).
 * Includes: v2 WebMIDI auto-patching + Mapper/Catalog/Synth hooks.
 */

(function () {
  if (window.__MIX16_BRIDGE_V21) return; window.__MIX16_BRIDGE_V21 = true;

  function injectPatchState(req) {
    try {
      if (!window.__MIX16 || typeof __MIX16.filter !== 'function') return;
      var ch0 = Math.max(0, Math.min(15, (req.channel || 1) - 1));
      var msb = (req.bankMSB || 0) & 0x7F;
      var lsb = (req.bankLSB || 0) & 0x7F;
      var pg  = (req.program || 0) & 0x7F;
      __MIX16.filter(new Uint8Array([0xB0 | ch0, 0,  msb]));
      __MIX16.filter(new Uint8Array([0xB0 | ch0, 32, lsb]));
      __MIX16.filter(new Uint8Array([0xC0 | ch0, pg]));
      try { __MIX16.refreshNames({ fallback: false }); } catch (e) {}
    } catch (e) {}
  }

  // --- NO-FALLBACK PATCH: force refreshNames to ignore fallback=true calls ---
  function disableFallbackNaming() {
    try {
      if (!window.__MIX16 || typeof __MIX16.refreshNames !== 'function') return;
      if (__MIX16.refreshNames.__mix16NoFallback) return;
      var _origRN = __MIX16.refreshNames;
      __MIX16.refreshNames = function (opts) {
        var o = opts || {}; o.fallback = false; // always disable
        return _origRN(o);
      };
      __MIX16.refreshNames.__mix16NoFallback = true;
    } catch (e) {}
  }

  function wrapSimpleMapper() {
    try {
      if (!window.SimpleMapper || typeof SimpleMapper.apply !== 'function') return;
      if (SimpleMapper.apply.__mix16Bridged) return;
      var _orig = SimpleMapper.apply;
      SimpleMapper.apply = function (opts) {
        var p = opts || {};
        var res = _orig(opts);
        if (res && typeof res.then === 'function') {
          return res.then(function (ok) { if (ok) injectPatchState({ channel: p.channel||1, bankMSB:p.bankMSB||0, bankLSB:p.bankLSB||0, program:p.program||0 }); return ok; });
        } else { injectPatchState({ channel: p.channel||1, bankMSB:p.bankMSB||0, bankLSB:p.bankLSB||0, program:p.program||0 }); return res; }
      };
      SimpleMapper.apply.__mix16Bridged = true;
    } catch (e) {}
  }

  function hookMapperUI() {
    if (window.__MIX16_BRIDGE_UI_HOOKED) return;
    document.addEventListener('click', function (e) {
      if (!e.target || e.target.id !== 'smApply') return;
      try {
        var ch  = parseInt(document.getElementById('smChan').value || '1', 10);
        var msb = parseInt(document.getElementById('smMSB').value || '0', 10);
        var lsb = parseInt(document.getElementById('smLSB').value || '0', 10);
        var pg  = parseInt(document.getElementById('smProg').value || '0', 10);
        injectPatchState({ channel: ch, bankMSB: msb, bankLSB: lsb, program: pg });
      } catch (_) {}
    }, true);
    window.__MIX16_BRIDGE_UI_HOOKED = true;
  }

  function wrapCatalog() {
    try {
      if (!window.SimpleMapperCatalog) return;
      if (typeof SimpleMapperCatalog.applyWithRetry === 'function' && !SimpleMapperCatalog.applyWithRetry.__mix16Bridged) {
        var _origApply = SimpleMapperCatalog.applyWithRetry;
        SimpleMapperCatalog.applyWithRetry = function (req) {
          var p = req || {}; var res = _origApply(req);
          if (res && typeof res.then === 'function') { return res.then(function (ok) { if (ok) injectPatchState({ channel:p.channel||1, bankMSB:p.bankMSB||0, bankLSB:p.bankLSB||0, program:p.program||0 }); return ok; }); }
          injectPatchState({ channel:p.channel||1, bankMSB:p.bankMSB||0, bankLSB:p.bankLSB||0, program:p.program||0 }); return res;
        }; SimpleMapperCatalog.applyWithRetry.__mix16Bridged = true;
      }
      if (typeof SimpleMapperCatalog.applyByName === 'function' && !SimpleMapperCatalog.applyByName.__mix16Bridged) {
        var _origByName = SimpleMapperCatalog.applyByName;
        SimpleMapperCatalog.applyByName = function (name, opts) {
          var o=opts||{}; var res=_origByName(name,o);
          function syncFromSnapshot(){ try{ if(window.__MIX16 && typeof __MIX16.getPatch==='function'){ var ch0=Math.max(0,Math.min(15,(o.channel||1)-1)); var p=__MIX16.getPatch(ch0); if(p&&p.seen) injectPatchState({ channel:ch0+1, bankMSB:p.bankMSB, bankLSB:p.bankLSB, program:p.program }); } }catch(e){} }
          if(res && typeof res.then==='function'){ return res.then(function(ok){ if(ok) syncFromSnapshot(); return ok; }); }
          syncFromSnapshot(); return res;
        }; SimpleMapperCatalog.applyByName.__mix16Bridged = true;
      }
    } catch (e) {}
  }

  function hookSynth() {
    try {
      var s = window.synth; if (!s) return;
      if (typeof s.midiProgramChange === 'function' && !s.midiProgramChange.__mix16Bridged) {
        var _origPC = s.midiProgramChange.bind(s);
        s.midiProgramChange = function (ch, pg) {
          try { if (window.__MIX16 && typeof __MIX16.filter==='function'){ var ch0=Math.max(0,Math.min(15,(ch||0)&0x0F)); __MIX16.filter(new Uint8Array([0xC0|ch0,(pg||0)&0x7F])); __MIX16.refreshNames && __MIX16.refreshNames({ fallback:false }); } } catch(e){}
          return _origPC(ch, pg);
        }; s.midiProgramChange.__mix16Bridged = true;
      }
      if (typeof s.midiControl === 'function' && !s.midiControl.__mix16Bridged) {
        var _origCC = s.midiControl.bind(s);
        s.midiControl = function (ch, cc, val) {
          try { if(window.__MIX16 && typeof __MIX16.filter==='function'){ var ch0=Math.max(0,Math.min(15,(ch||0)&0x0F)); var c=(cc||0)&0x7F; var v=(val||0)&0x7F; if(c===0||c===32){ __MIX16.filter(new Uint8Array([0xB0|ch0,c,v])); } } } catch(e){}
          return _origCC(ch, cc, val);
        }; s.midiControl.__mix16Bridged = true;
      }
    } catch (e) {}
  }

  function autoPatchWebMIDI() {
    try {
      if (!window.__MIX16 || typeof __MIX16.patchWebMIDI !== 'function') return;
      var attempted = false;
      async function doPatch(){ if(attempted) return; attempted=true; try{ var r=await __MIX16.patchWebMIDI(); if(!r||!r.ok){ attempted=false; } else { try{ __MIX16.refreshNames && __MIX16.refreshNames({ fallback:false }); }catch(e){} } }catch(e){ attempted=false; } }
      doPatch();
      ['pointerdown','mousedown','touchstart','keydown','click'].forEach(function(ev){ var once=function(){ doPatch(); window.removeEventListener(ev, once, true); }; window.addEventListener(ev, once, true); });
    } catch (e) {}
  }

  function ensureCatalogSF() { try { window.SimpleMapperCatalog && SimpleMapperCatalog.refreshSF(); } catch (e) {} }

  (function tryInit() {
    var haveMixer = !!window.__MIX16;
    var haveMapper = !!(window.SimpleMapper || window.SimpleMapperCatalog);
    var haveSynth  = !!window.synth;
    if (!haveMixer || (!haveMapper && !haveSynth)) { setTimeout(tryInit, 120); return; }
    disableFallbackNaming();
    wrapSimpleMapper(); wrapCatalog(); hookMapperUI(); hookSynth(); ensureCatalogSF(); autoPatchWebMIDI();
    try { __MIX16.refreshNames({ fallback:false }); } catch (e) {}
  })();
})();
