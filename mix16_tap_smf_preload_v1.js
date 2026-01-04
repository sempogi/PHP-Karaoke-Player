/*!
 * mix16_tap_smf_preload_v1.js
 * Mirrors first Bank Select + Program Change from MIDI file into MIX16 before playback.
 * Hooks JSSynth.addSMFDataToPlayer() automatically.
 * Requires MIDIFile.js.
 * v1.0.2 (2025-10-10)
 */
(function(){
  if (window.__MIX16_TAP_SMF__) return;
  window.__MIX16_TAP_SMF__ = true;

  function sendToMixer(bytes){
    try{
      if (window.__MIX16 && typeof __MIX16.filter === 'function'){
        __MIX16.filter(bytes);
        if (typeof __MIX16.refreshNames === 'function'){
          __MIX16.refreshNames({ fallback: true });
        }
      }
    }catch(_){}
  }
  function mkPC(ch, pg){ return new Uint8Array([0xC0 | (ch & 0x0F), pg & 0x7F]); }
  function mkCC(ch, cc, val){ return new Uint8Array([0xB0 | (ch & 0x0F), cc & 0x7F, val & 0x7F]); }

  function injectFromSMF(buf){
    try{
      if (!buf || typeof MIDIFile !== 'function') return;
      var mf = new MIDIFile(buf);
      var events = mf.getMidiEvents ? mf.getMidiEvents() : [];
      if (!events.length) return;

      var msb = Array(16).fill(null), lsb = Array(16).fill(null), prog = Array(16).fill(null);
      for (var i=0; i<events.length; i++){
        var e = events[i];
        var ch = e.channel;
        if (ch == null || ch < 0 || ch > 15) continue;

        if (e.subtype === 'controller'){
          if (e.param1 === 0 && msb[ch] == null) msb[ch] = e.param2;
          if (e.param1 === 32 && lsb[ch] == null) lsb[ch] = e.param2;
        }
        if (e.subtype === 'programChange' && prog[ch] == null){
          prog[ch] = e.param1;
        }
      }

      for (var c=0; c<16; c++){
        if (msb[c] != null) sendToMixer(mkCC(c, 0, msb[c]));
        if (lsb[c] != null) sendToMixer(mkCC(c, 32, lsb[c]));
        if (prog[c] != null) sendToMixer(mkPC(c, prog[c]));
      }
    }catch(e){}
  }

  function hookJSSynth(){
    if (!window.JSSynth || !JSSynth.Synthesizer) return setTimeout(hookJSSynth, 200);
    var proto = JSSynth.Synthesizer.prototype;
    if (!proto.addSMFDataToPlayer || proto.addSMFDataToPlayer.__tapHooked) return;

    var orig = proto.addSMFDataToPlayer;
    proto.addSMFDataToPlayer = function(buf){
      injectFromSMF(buf);
      return orig.call(this, buf);
    };
    proto.addSMFDataToPlayer.__tapHooked = true;
  }

  if (document.readyState !== 'loading') hookJSSynth();
  else document.addEventListener('DOMContentLoaded', hookJSSynth, { once:true });
})();