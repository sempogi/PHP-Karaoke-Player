
// AutoTune285DropIn — drop-in global retune toward 285 Hz using Key Signature (0x59) tonic.
// Usage (minimal):
//  <script src="autotune285_dropin.js"></script>
//  AutoTune285DropIn.init(audioCtx, channels, {excludeDrums:true});
//  AutoTune285DropIn.autoTuneTo285FromKeySignature(playState.evs);
// No changes to createMelodicVoice/handleEvent needed; this script wraps them.
(function(global){
  'use strict';
  const D = {
    audioCtx: null,
    channels: null,
    installed: false,
    excludeDrums: true,
    globalDetuneCents: 0,
  };

  function centsToRatio(c){ return Math.pow(2, c/1200); }
  function midiToFreq(m){ return 440 * Math.pow(2, (m - 69)/12); }
  function midiPitchClass(n){ return ((n % 12) + 12) % 12; }

  // Key Signature helpers
  const sharpMaj = [0,7,2,9,4,11,6,1];
  const flatMaj  = [5,10,3,8,1,6,11];
  const sharpMin = [9,4,11,6,1,8,3,10];
  const flatMin  = [2,7,0,5,10,3,8];
  function keySigToPitchClass(sf, mi){
    if (mi === 0) return (sf >= 0) ? sharpMaj[sf] : flatMaj[-sf - 1];
    return (sf >= 0) ? sharpMin[sf] : flatMin[-sf - 1];
  }
  function getAnchorNoteForPitchClass(pc, targetHz){
    let best = {note: 61, diff: 1e9};
    for (let n=36; n<=96; n++){
      if (midiPitchClass(n) === pc){
        const f = midiToFreq(n);
        const d = Math.abs(f - targetHz);
        if (d < best.diff) best = {note:n, diff:d};
      }
    }
    return best.note;
  }

  // Compute total detune for a channel (without needing baseFreq)
  function totalDetuneCents(ch){
    const chObj = D.channels[ch];
    const bendSemis = chObj && typeof chObj.bend === 'number' ? chObj.bend : 0; // semitones
    const chDet = chObj && typeof chObj.detuneCents === 'number' ? chObj.detuneCents : 0;
    const gDet = D.globalDetuneCents || 0;
    return gDet + chDet + bendSemis * 100;
  }

  // Apply detune to voices on a channel using delta (so we don't need baseFreq)
  function retuneChannelVoices(ch){
    if (!D.channels || !D.audioCtx) return;
    const now = D.audioCtx.currentTime;
    const chObj = D.channels[ch]; if(!chObj || !chObj.voices) return;
    const targetCents = totalDetuneCents(ch);
    chObj.voices.forEach(v => {
      const applied = v._detuneAppliedCents || 0;
      const delta = targetCents - applied;
      if (Math.abs(delta) > 0.001){
        // multiply current frequency by ratio for delta cents
        try {
          const cur = v.osc.frequency.value;
          const newFreq = cur * centsToRatio(delta);
          v.osc.frequency.setValueAtTime(newFreq, now);
          v._detuneAppliedCents = targetCents;
        } catch(e){}
      }
    });
  }

  function retuneAll(){
    if (!D.channels) return;
    for (let ch=0; ch<D.channels.length; ch++){
      if (D.excludeDrums && ch===9) continue;
      retuneChannelVoices(ch);
    }
  }

  function setGlobalTuningToHz(targetHz, anchorNote){
    const base = midiToFreq(anchorNote);
    D.globalDetuneCents = 1200 * Math.log2(targetHz / base);
    retuneAll();
    if (global.log) try{ global.log(`DropIn AutoTune: anchor ${anchorNote} → ${targetHz.toFixed(2)} Hz (${D.globalDetuneCents.toFixed(2)} cents)`);}catch(e){}
  }
  function clearGlobal(){ D.globalDetuneCents = 0; retuneAll(); }

  function findKeySignatureMeta(evs){
    for (let i=0; i<evs.length; i++){
      const e = evs[i];
      if (e.kind === 'meta' && e.type === 0x59 && e.data && e.data.length >= 2){
        const b0 = e.data[0], b1 = e.data[1];
        const sf = (b0 > 127) ? (b0 - 256) : b0; // signed
        const mi = b1;                            // 0=major,1=minor
        return {sf, mi, tick: e.tick};
      }
    }
    return null;
  }

  function autoTuneTo285FromKeySignature(evs){
    const ks = findKeySignatureMeta(evs||[]);
    if (!ks){ if (global.log) try{ global.log('DropIn AutoTune: no Key Signature meta found'); }catch(e){}; return; }
    const pc = keySigToPitchClass(ks.sf, ks.mi);
    const anchor = getAnchorNoteForPitchClass(pc, 285.0);
    setGlobalTuningToHz(285.0, anchor);
    if (global.log) try{ global.log(`DropIn AutoTune: tonic PC ${pc} → MIDI ${anchor} anchored to 285 Hz`);}catch(e){}
  }

  function installWrappers(){
    if (D.installed) return;
    // Wrap createMelodicVoice: after original creates a voice, apply initial detune
    if (typeof global.createMelodicVoice === 'function' && D.channels){
      const origCreate = global.createMelodicVoice;
      global.createMelodicVoice = function(ch, note, when, dur){
        const beforeCount = D.channels[ch]?.voices?.size || 0;
        const res = origCreate.apply(this, arguments);
        // Apply to any voices missing _detuneAppliedCents
        const chObj = D.channels[ch];
        if (chObj && chObj.voices){
          chObj.voices.forEach(v => {
            if (typeof v._detuneAppliedCents === 'undefined'){
              v._detuneAppliedCents = 0; // mark, then retune to target cents
              retuneChannelVoices(ch);
            }
          });
        }
        return res;
      };
    }

    // Wrap handleEvent: after pitch bend (E0) is processed, re-apply detune
    if (typeof global.handleEvent === 'function'){
      const origHandle = global.handleEvent;
      global.handleEvent = function(e, when){
        const r = origHandle.apply(this, arguments);
        try{
          if (e && e.kind === 'midi' && e.t === 0xE0){
            const ch = e.ch; if (!(D.excludeDrums && ch===9)) retuneChannelVoices(ch);
          }
          // If a Key Signature meta appears mid-song, auto re-anchor
          if (e && e.kind === 'meta' && e.type === 0x59){
            const ks = { sf: (e.data[0]>127 ? e.data[0]-256 : e.data[0]), mi: e.data[1] };
            const pc = keySigToPitchClass(ks.sf, ks.mi);
            const anchor = getAnchorNoteForPitchClass(pc, 285.0);
            setGlobalTuningToHz(285.0, anchor);
          }
        }catch(x){}
        return r;
      };
    }

    D.installed = true;
  }

  const API = {
    init(audioCtx, channels, opts){
      D.audioCtx = audioCtx; D.channels = channels;
      if (opts && typeof opts.excludeDrums === 'boolean') D.excludeDrums = opts.excludeDrums;
      // ensure per-channel detuneCents exists
      for (let i=0; i<(channels?channels.length:0); i++){
        if (typeof channels[i].detuneCents !== 'number') channels[i].detuneCents = 0;
      }
      installWrappers();
    },
    autoTuneTo285FromKeySignature,
    setGlobalTuningToHz,
    clearGlobal,
    retuneAll,
  };

  global.AutoTune285DropIn = API;
})(typeof window !== 'undefined' ? window : this);
