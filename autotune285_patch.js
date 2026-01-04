
// AutoTune285 — Global retune toward 285 Hz using Key Signature (0x59) tonic as anchor.
// Drop-in helper: include this file after your main script, then wire the few calls described in README.
(function(global){
  'use strict';
  const AutoTune285 = {
    audioCtx: null,
    channels: null,
    globalDetuneCents: 0,

    init({audioCtx, channels}){
      this.audioCtx = audioCtx;
      this.channels = channels;
      if (!channels) throw new Error('AutoTune285.init: channels required');
      for (let i=0; i<channels.length; i++){
        if (typeof channels[i].detuneCents !== 'number') channels[i].detuneCents = 0;
      }
    },

    centsToRatio(c){ return Math.pow(2, c/1200); },
    midiToFreq(m){ return 440 * Math.pow(2, (m - 69)/12); },

    computeCentsTotal(ch){
      const chObj = this.channels[ch];
      const bendSemis = chObj.bend || 0; // existing semitone bend
      const chDet = chObj.detuneCents || 0;
      return (this.globalDetuneCents || 0) + chDet + (bendSemis * 100);
    },

    applyFreq(baseFreq, ch){
      return baseFreq * this.centsToRatio(this.computeCentsTotal(ch));
    },

    retuneAllActiveVoices(){
      if (!this.audioCtx || !this.channels) return;
      const now = this.audioCtx.currentTime;
      for (let ch=0; ch<this.channels.length; ch++){
        this.channels[ch].voices.forEach(v => {
          const base = v.baseFreq || 0;
          const newFreq = this.applyFreq(base, ch);
          try{ v.osc.frequency.setValueAtTime(newFreq, now); }catch(e){}
        });
      }
    },

    // --- Key Signature helpers
    keySigToPitchClass(sf, mi){
      // pc: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
      const sharpMaj = [0,7,2,9,4,11,6,1];              // 0..7
      const flatMaj  = [5,10,3,8,1,6,11];               // -1..-7
      const sharpMin = [9,4,11,6,1,8,3,10];             // 0..7
      const flatMin  = [2,7,0,5,10,3,8];                // -1..-7
      if (mi === 0) return (sf >= 0) ? sharpMaj[sf] : flatMaj[-sf - 1];
      return (sf >= 0) ? sharpMin[sf] : flatMin[-sf - 1];
    },
    midiPitchClass(n){ return ((n % 12) + 12) % 12; },
    getAnchorNoteForPitchClass(pc, targetHz){
      let best = {note: 61, diff: 1e9};
      for (let n=36; n<=96; n++){
        if (this.midiPitchClass(n) === pc){
          const f = this.midiToFreq(n);
          const d = Math.abs(f - targetHz);
          if (d < best.diff) best = {note:n, diff:d};
        }
      }
      return best.note;
    },

    setGlobalTuningToHz(targetHz, anchorNote){
      const base = this.midiToFreq(anchorNote);
      this.globalDetuneCents = 1200 * Math.log2(targetHz / base);
      this.retuneAllActiveVoices();
      if (global.log) try{ global.log(`AutoTune: anchor ${anchorNote} → ${targetHz.toFixed(2)} Hz (${this.globalDetuneCents.toFixed(2)} cents)`);}catch(e){}
    },
    clearGlobalTuning(){
      this.globalDetuneCents = 0;
      this.retuneAllActiveVoices();
      if (global.log) try{ global.log('AutoTune: reset (0 cents)'); }catch(e){}
    },

    findKeySignatureMeta(evs){
      for (let i=0; i<evs.length; i++){
        const e = evs[i];
        if (e.kind === 'meta' && e.type === 0x59 && e.data && e.data.length >= 2){
          const b0 = e.data[0], b1 = e.data[1];
          const sf = (b0 > 127) ? (b0 - 256) : b0;   // signed
          const mi = b1;                              // 0=major,1=minor
          return {sf, mi, tick: e.tick};
        }
      }
      return null;
    },

    autoTuneTo285FromKeySignature(evs){
      const ks = this.findKeySignatureMeta(evs);
      if (!ks){ if (global.log) try{ global.log('AutoTune: no Key Signature meta found'); }catch(e){}; return; }
      const pc = this.keySigToPitchClass(ks.sf, ks.mi);
      const anchor = this.getAnchorNoteForPitchClass(pc, 285.0);
      this.setGlobalTuningToHz(285.0, anchor);
      if (global.log) try{ global.log(`AutoTune: tonic PC ${pc} → MIDI ${anchor} anchored to 285 Hz`);}catch(e){}
    }
  };

  global.AutoTune285 = AutoTune285;
})(typeof window !== 'undefined' ? window : this);
