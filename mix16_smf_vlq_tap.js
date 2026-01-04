/*!
 * mix16_smf_vlq_tap.js
 * Raw SMF (MIDI) pre-scan with VLQ + GS Rhythm detection.
 * Mirrors first CC0/32 + PC per channel to MIX16.
 * - CH10 is treated as drum even if the file sends no bank (defaults to MSB=1, LSB=0)
 * - Any channel with Bank MSB=1 (bank 128) is drum
 * - GS Rhythm Part SysEx (F0 41 .. 42 12 40 1n 15 01 .. F7) marks channel n as drum
 */
(function(){
  'use strict';
  if (window.__MIX16_SMF_VLQ_TAP__) return;
  window.__MIX16_SMF_VLQ_TAP__ = true;

  function send(bytes){
    try{
      if (window.__MIX16 && typeof __MIX16.filter === 'function'){
        __MIX16.filter(bytes);
        if (typeof __MIX16.refreshNames === 'function'){
          __MIX16.refreshNames({ fallback: false });
        }
      }
    }catch(_){}
    return bytes;
  }
  function mkPC(ch, pg){ return new Uint8Array([0xC0 | (ch & 0x0F), pg & 0x7F]); }
  function mkCC(ch, cc, val){ return new Uint8Array([0xB0 | (ch & 0x0F), cc & 0x7F, val & 0x7F]); }

  // -------- VLQ / chunk helpers --------
  function readVLQ(dv, pos){
    var result=0, b, c=0;
    do{
      if (pos >= dv.byteLength) return {ok:false, value:result, next:pos};
      b = dv.getUint8(pos++); result = (result<<7) | (b & 0x7F);
      if (++c > 4) break;
    } while (b & 0x80);
    return {ok:true, value:result, next:pos};
  }
  function u32(dv,pos){
    if (pos+4 > dv.byteLength) return {ok:false, value:0, next:pos};
    var v=(dv.getUint8(pos)<<24)|(dv.getUint8(pos+1)<<16)|(dv.getUint8(pos+2)<<8)|dv.getUint8(pos+3);
    return {ok:true, value:(v>>>0), next:pos+4};
  }
  function chunkHdr(dv,pos){
    if (pos+8 > dv.byteLength) return {ok:false, id:'', len:0, next:pos};
    var id=String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2), dv.getUint8(pos+3));
    var L=u32(dv,pos+4);
    return {ok:true, id:id, len:L.value, next:L.next};
  }

  // -------- GS (Roland) Rhythm Part detection in SysEx --------
  function detectGSDrumChans(sysxBytes, markDrum){
    // GS header: 0x41 .. 0x42 0x12
    // Rhythm Part set uses address 40 1n 15 with value 01 for enable
    // We don't validate checksum; we just scan for the address bytes.
    if (!sysxBytes || sysxBytes.length < 10) return;
    // Quick header check: contains 41 and 42 12 in order
    var hasGS = false;
    for (var i=0;i<sysxBytes.length-3;i++){
      if (sysxBytes[i]===0x41 && sysxBytes[i+2]===0x42 && sysxBytes[i+3]===0x12){ hasGS = true; break; }
    }
    if (!hasGS) return;

    for (var j=0;j<sysxBytes.length-4;j++){
      if (sysxBytes[j]===0x40 && sysxBytes[j+2]===0x15){
        var partByte = sysxBytes[j+1]; // 0x1n where n=0..F for channel 1..16
        var valByte  = sysxBytes[j+3];
        if ((partByte & 0xF0) === 0x10){ // 0x1n
          var n = partByte & 0x0F;      // 0..15
          if (valByte === 0x01){        // enable rhythm
            markDrum(n);                // zero-based channel
          }
        }
      }
    }
  }

  // -------- Parse SMF to capture first banks/program + drum hints --------
  function parseFirstPatches(buf){
    var dv = new DataView(buf), pos=0, end=dv.byteLength;

    var patches = new Array(16).fill(0).map(function(){ 
      return { msb:null, lsb:null, pc:null, drum:false, sawCC0:false, sawCC32:false, sawPC:false };
    });

    // MThd
    var h=chunkHdr(dv,pos); if(!h.ok || h.id!=='MThd') return patches;
    pos = h.next + h.len;

    while (pos < end){
      var ch = chunkHdr(dv,pos); if(!ch.ok) break;
      pos = ch.next;
      var stop = pos + ch.len;

      if (ch.id !== 'MTrk'){ pos = stop; continue; }

      var runStatus = null;

      while (pos < stop){
        // delta
        var dt=readVLQ(dv,pos); if(!dt.ok){ pos=stop; break; } pos=dt.next;
        if (pos >= stop) break;
        var status = dv.getUint8(pos++);

        if (status === 0xFF){
          if (pos >= stop) break;
          var metaType = dv.getUint8(pos++);
          var mlen = readVLQ(dv,pos); if(!mlen.ok){ pos=stop; break; }
          pos = mlen.next + mlen.value;
          runStatus = null;
          continue;
        }
        if (status === 0xF0 || status === 0xF7){
          // SysEx: length + payload (scan GS rhythm)
          var sy = readVLQ(dv,pos); if(!sy.ok){ pos=stop; break; }
          var start = sy.next, endp = start + sy.value;
          if (endp > stop) { pos=stop; break; }
          try{
            var sysx = new Uint8Array(dv.buffer, dv.byteOffset + start, sy.value);
            detectGSDrumChans(sysx, function(chIdx){ if (chIdx>=0 && chIdx<16) patches[chIdx].drum = true; });
          }catch(_){}
          pos = endp;
          runStatus = null;
          continue;
        }

        var st;
        if (status & 0x80){ st=status; runStatus=status; }
        else { st=runStatus; pos--; }
        if (st == null) break;

        var type = st & 0xF0, chan = st & 0x0F;

        if (type === 0xC0){ // Program Change (1 data)
          if (pos >= stop) break;
          var pg = dv.getUint8(pos++) & 0x7F;
          if (!patches[chan].sawPC){ patches[chan].pc = pg; patches[chan].sawPC = true; }

        } else if (type === 0xB0){ // Control Change (2 data)
          if (pos + 1 >= stop) break;
          var cc = dv.getUint8(pos++) & 0x7F;
          var val= dv.getUint8(pos++) & 0x7F;
          if (cc === 0 && !patches[chan].sawCC0){ patches[chan].msb = val; patches[chan].sawCC0 = true; }
          if (cc === 32 && !patches[chan].sawCC32){ patches[chan].lsb = val; patches[chan].sawCC32 = true; }
          // Bank MSB==1 (i.e., bank #128) hints drum
          if (cc === 0 && val === 1){ patches[chan].drum = true; }

        } else {
          // skip data for other channel messages
          if      (type === 0xD0) pos += 1;   // channel pressure (1 data)
          else if (type === 0x90 || type === 0x80 || type===0xA0 || type===0xE0) pos += 2; // 2 data
          else { /* unknown */ break; }
          if (pos > stop) break;
        }
      }

      pos = stop;
    }

    // Default CH10 to drum even with no bank info
    patches[9].drum = true || patches[9].drum; // ensure channel 9 (10th) is drum

    return patches;
  }

  function mirror(patches){
    if (!patches) return;
    for (var ch=0; ch<16; ch++){
      var p = patches[ch];

      // If this channel is drum (CH10 by default, or GS, or bank MSB=1),
      // make sure we set Bank to 128 (MSB=1, LSB=0) if not provided,
      // and default PC to 0 if missing so the kit resolves (Standard Kit).
      if (p.drum){
        var msb = (p.msb != null) ? p.msb : 1;   // 1 → bank 128
        var lsb = (p.lsb != null) ? p.lsb : 0;
        var pg  = (p.pc  != null) ? p.pc  : 0;

        send(mkCC(ch, 0,  msb));
        send(mkCC(ch, 32, lsb));
        send(mkPC(ch,     pg));
      } else {
        // Non-drum: mirror whatever first values exist (don’t guess)
        if (p.msb != null) send(mkCC(ch, 0,  p.msb));
        if (p.lsb != null) send(mkCC(ch, 32, p.lsb));
        if (p.pc  != null) send(mkPC(ch,     p.pc));
      }
    }
  }

  function hook(){
    if (!window.JSSynth || !JSSynth.Synthesizer || !JSSynth.Synthesizer.prototype.addSMFDataToPlayer){
      setTimeout(hook, 200); return;
    }
    var proto = JSSynth.Synthesizer.prototype;
    if (proto.addSMFDataToPlayer.__mix16SmfVlqDrumHook__) return;

    var orig = proto.addSMFDataToPlayer;
    proto.addSMFDataToPlayer = function(buf){
      try{ mirror(parseFirstPatches(buf)); }catch(_){}
      return orig.call(this, buf);
    };
    proto.addSMFDataToPlayer.__mix16SmfVlqDrumHook__ = true;
  }

  if (document.readyState !== 'loading') hook();
  else window.addEventListener('DOMContentLoaded', hook, { once: true });
})();