/*!
 * smf_inject_v1.js
 * Pre-reads a MIDI SMF buffer and mirrors first CC0/CC32/PC per channel into MIX16.
 * Requires MIDIFile.js to be loaded on the page.
 */
(function () {
  'use strict';
  if (window.SMFInject) return;

  function send(bytes) {
    try {
      if (window.__MIX16 && typeof __MIX16.filter === 'function') {
        var out = __MIX16.filter(bytes);
        if (out && typeof __MIX16.refreshNames === 'function') {
          __MIX16.refreshNames({ fallback: true });
        }
      }
    } catch (_) {}
  }
  function pc(ch, pg) { return new Uint8Array([0xC0 | (ch & 0x0F), pg & 0x7F]); }
  function cc(ch, num, val) { return new Uint8Array([0xB0 | (ch & 0x0F), num & 0x7F, val & 0x7F]); }

  function parseEvents(mf) {
    // Try different MIDIFile APIs (builds differ)
    if (typeof mf.getMidiEvents === 'function') return mf.getMidiEvents() || [];
    if (typeof mf.getEvents === 'function') return mf.getEvents() || [];
    return [];
  }

  function preinject(arrayBuf) {
    try {
      if (!arrayBuf || typeof MIDIFile !== 'function') return false;
      var mf = new MIDIFile(arrayBuf);
      var evs = parseEvents(mf);
      if (!Array.isArray(evs) || evs.length === 0) return false;

      var msb = new Array(16).fill(null);
      var lsb = new Array(16).fill(null);
      var prog = new Array(16).fill(null);

      for (var i = 0; i < evs.length; i++) {
        var e = evs[i] || {};
        var ch = e.channel;
        if (ch == null || ch < 0 || ch > 15) continue;

        // Controller CC0/CC32
        var isCtrl = (e.subtype === 'controller') || (e.type === 'controller') || (e.eventType === 'controller') || (e.subtype === 0xB0);
        if (isCtrl) {
          var c = (e.param1 != null) ? e.param1 : (e.control != null) ? e.control : (e.controller != null) ? e.controller : null;
          var v = (e.param2 != null) ? e.param2 : (e.value != null) ? e.value : null;
          if (c === 0 && v != null && msb[ch] == null) msb[ch] = v & 0x7F;
          if (c === 32 && v != null && lsb[ch] == null) lsb[ch] = v & 0x7F;
        }

        // Program Change
        var isPC = (e.subtype === 'programChange') || (e.type === 'programChange') || (e.eventType === 'programChange') || (e.subtype === 0xC0);
        if (isPC && prog[ch] == null) {
          var pg = (e.param1 != null) ? e.param1 : (e.program != null) ? e.program : (e.value != null) ? e.value : 0;
          prog[ch] = pg & 0x7F;
        }
      }

      var any = false;
      for (var ch2 = 0; ch2 < 16; ch2++) {
        if (msb[ch2] != null) { send(cc(ch2, 0, msb[ch2])); any = true; }
        if (lsb[ch2] != null) { send(cc(ch2, 32, lsb[ch2])); any = true; }
        if (prog[ch2] != null) { send(pc(ch2, prog[ch2])); any = true; }
      }
      return any;
    } catch (_) { return false; }
  }

  window.SMFInject = { preinject: preinject };
})();