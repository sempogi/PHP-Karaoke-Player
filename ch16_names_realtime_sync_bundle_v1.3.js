/*!
 * ch16_names_realtime_sync_bundle_v1.3.js
 * ONE FILE solution — strict SF-only names + real-time sync
 * Adds: UNUSED channel marker ('-') until the channel is actually used.
 *
 * Rules for UNUSED:
 *  - A channel is considered UNUSED until it receives any of:
 *    - Program Change (PC), Bank MSB/LSB (CC0/32), setPatch, setProgram, setBankMSB/LSB
 *    - Note On (0x90 with velocity > 0)
 *  - On new song (setStatus('LOADING SONG…')) or after applying SF, usage flags reset.
 *  - If a song uses the default patch (0/0/0) without sending PC, the channel shows '-' until first Note On,
 *    then switches to the resolved name from SFCatalog.
 *
 * Includes:
 *  - SFCatalog provider (pdta/phdr parser)
 *  - Hard-coded SF loader hook (SF_LOADER_FN / ALT_LOADER_FN)
 *  - Event bus (CH16Bus)
 *  - __MIX16 wrappers + filter() observer
 *  - Piano real-time coalescer + UNUSED handling
 */
(function(){
  'use strict';

  if (window.__CH16_SYNC_BUNDLE__) return; // prevent double-load
  window.__CH16_SYNC_BUNDLE__ = 'v1.3';

  /* === Config: loader names === */
  var SF_LOADER_FN  = 'loadSFont';  // <-- set to your synth's loader function
  var ALT_LOADER_FN = null;         // optional secondary, e.g., 'applySFont'

  /* === SFCatalog provider (pdta/phdr) === */
  (function SFCat(){
    if (window.SFCatalog && typeof window.SFCatalog.name === 'function') return;
    function u32(dv,o){ return dv.getUint32(o,true); }
    function u16(dv,o){ return dv.getUint16(o,true); }
    function str(dv,off,len){ let s=''; for(let i=0;i<len;i++){ const c=dv.getUint8(off+i); if(c===0) break; s+=String.fromCharCode(c);} return s; }
    function findPhdr(ab){
      const dv=new DataView(ab); const len=dv.byteLength; if(len<12) return null;
      if (u32(dv,0)!==0x46464952) return null;   // 'RIFF'
      if (u32(dv,8)!==0x6b626673) return null;   // 'sfbk'
      let p=12;
      while (p+8<=len){
        const id=u32(dv,p), sz=u32(dv,p+4), start=p+8;
        if (id===0x5453494c){                  // 'LIST'
          const type=u32(dv,start);
          if (type===0x61746470){              // 'pdta'
            let q=start+4, end=start+sz;
            while (q+8<=end && q+8<=len){
              const cid=u32(dv,q), csz=u32(dv,q+4), cstart=q+8;
              if (cid===0x72646870){           // 'phdr'
                return { dv, off:cstart, size:csz };
              }
              q = cstart + csz + (csz & 1);
            }
          }
        }
        p = start + sz + (sz & 1);
      }
      return null;
    }
    let MAP = new Map(); // key=(msb<<14)|(lsb<<7)|pg → name
    function build(ab){
      const ph=findPhdr(ab); const map=new Map();
      if (ph){ const dv=ph.dv; let p=ph.off; const end=ph.off+ph.size; const REC=38;
        while (p+REC<=end){
          const name=str(dv,p,20); const pg=u16(dv,p+20)&0x7F; const bank=u16(dv,p+22)&0x3FFF;
          if (name==='EOP') break;
          const msb=(bank>>7)&0x7F, lsb=bank&0x7F; const key=(msb<<14)|(lsb<<7)|pg;
          if (!map.has(key)) map.set(key, name);
          p+=REC;
        }
      }
      MAP = map; try{ window.SFCatalog = API; }catch(_){ }
      return MAP.size;
    }
    function name(msb,lsb,pg){ const key=((msb&0x7F)<<14)|((lsb&0x7F)<<7)|(pg&0x7F); return MAP.get(key)||''; }
    const API = { build, name };
    try{ window.SFCatalog = API; }catch(_){ }
  })();

  /* === Event Bus === */
  (function(){
    if (window.CH16Bus) return;
    const Bus = new EventTarget();
    function emit(type, detail){ try{ Bus.dispatchEvent(new CustomEvent(type, { detail })); }catch(_){} }
    window.CH16Bus = {
      on:  (type, fn) => Bus.addEventListener(type, fn),
      off: (type, fn) => Bus.removeEventListener(type, fn),
      emit: emit,
      emitPatch:    (ch, msb, lsb, pg, source) => emit('patch:applied', { ch, msb, lsb, pg, source }),
      emitSFLoaded: (source) => emit('sf:loaded', { source })
    };
  })();

  /* === Helpers === */
  const CHS = 16;
  const clampCh = (ch) => Math.max(0, Math.min(15, ch|0));
  const coerce7 = (x) => (x|0) & 0x7F;
  const logOn   = () => (localStorage.getItem('ch16DebugNames') === 'on');
  const log     = (...a) => { if (logOn()) try{ console.log('[CH16SYNC]', ...a); }catch(_){} };
  function nameFromCatalog(msb,lsb,pg){ try { return (window.SFCatalog && SFCatalog.name) ? (SFCatalog.name(msb,lsb,pg)||'') : ''; } catch(_) { return ''; } }

  /* === Hard-coded SF loader hook === */
  (function hookSynth(){
    function patchOne(s,k){
      try{
        const f = s[k];
        if (typeof f !== 'function' || f.__ch16Sync) return;
        s[k] = async function(ab){
          try{ if (ab && ab.byteLength && window.SFCatalog && SFCatalog.build) SFCatalog.build(ab); }catch(_){ }
          const out = await f.apply(this, arguments);
          try{ CH16Bus.emitSFLoaded('synth:'+k); }catch(_){ }
          return out;
        };
        s[k].__ch16Sync = 1; log('Hooked synth.', k);
      }catch(_){ }
    }
    function tryPatch(){
      if (!window.synth) return false;
      if (SF_LOADER_FN && typeof synth[SF_LOADER_FN] === 'function') patchOne(synth, SF_LOADER_FN);
      if (ALT_LOADER_FN && typeof synth[ALT_LOADER_FN] === 'function') patchOne(synth, ALT_LOADER_FN);
      return true;
    }
    if (!tryPatch()){
      let tries=0; const iv=setInterval(function(){ if (tryPatch()) clearInterval(iv); if (++tries>160) clearInterval(iv); }, 100);
    }
  })();

  /* === Wrap __MIX16 setters + filter() === */
  (function wrapMix(){
    if (!window.__MIX16) window.__MIX16 = {};
    const M = __MIX16;

    const st = { msb:Array(CHS).fill(0), lsb:Array(CHS).fill(0), pg:Array(CHS).fill(0), used:Array(CHS).fill(false) };
    try{
      if (typeof M.getPatch === 'function'){
        for (let ch=0; ch<CHS; ch++){
          const p = M.getPatch(ch) || {};
          st.msb[ch] = coerce7(p.bankMSB||0);
          st.lsb[ch] = coerce7(p.bankLSB||0);
          st.pg [ch] = coerce7(p.program||0);
          // keep used=false until an actual event arrives
        }
      }
    }catch(_){ }

    function wrapSetter(name, update){
      const orig = M[name];
      if (typeof orig === 'function' && orig.__ch16Sync) return;
      M[name] = function(){
        const args = arguments;
        const r = (typeof orig === 'function') ? orig.apply(this, args) : undefined;
        try{ const ch = clampCh(args[0]); st.used[ch] = true; update(ch, args); CH16Bus.emitPatch(ch, st.msb[ch], st.lsb[ch], st.pg[ch], name); }catch(_){ }
        return r;
      };
      M[name].__ch16Sync = 1; log('Wrapped', name);
    }

    wrapSetter('setPatch',   (ch,a)=>{ st.msb[ch]=coerce7(a[1]); st.lsb[ch]=coerce7(a[2]); st.pg[ch]=coerce7(a[3]); });
    wrapSetter('setProgram', (ch,a)=>{ st.pg[ch] =coerce7(a[1]); });
    wrapSetter('setBankMSB', (ch,a)=>{ st.msb[ch]=coerce7(a[1]); });
    wrapSetter('setBankLSB', (ch,a)=>{ st.lsb[ch]=coerce7(a[1]); });

    const f = M.filter;
    if (typeof f === 'function' && !f.__ch16Sync){
      M.filter = function(bytes){
        try{
          const u = (bytes instanceof Uint8Array) ? bytes : (Array.isArray(bytes) ? Uint8Array.from(bytes) : null);
          if (u){
            for (let i=0; i<u.length; i++){
              const s = u[i]; if ((s & 0x80) === 0) continue;
              const hi = s & 0xF0, ch = clampCh(s & 0x0F);
              if (hi === 0xC0){ st.pg[ch]  = coerce7(u[i+1]); i+=1; st.used[ch]=true; CH16Bus.emitPatch(ch, st.msb[ch], st.lsb[ch], st.pg[ch], 'filter:PC'); }
              else if (hi === 0xB0){ const cc=u[i+1]|0, vv=coerce7(u[i+2]|0); i+=2; if (cc===0){ st.msb[ch]=vv; st.used[ch]=true; CH16Bus.emitPatch(ch, st.msb[ch], st.lsb[ch], st.pg[ch], 'filter:MSB'); } if (cc===32){ st.lsb[ch]=vv; st.used[ch]=true; CH16Bus.emitPatch(ch, st.msb[ch], st.lsb[ch], st.pg[ch], 'filter:LSB'); } }
              else if (hi === 0x90){ const note=u[i+1]&0x7F, vel=u[i+2]&0x7F; i+=2; if (vel>0){ st.used[ch]=true; CH16Bus.emitPatch(ch, st.msb[ch], st.lsb[ch], st.pg[ch], 'filter:NOTEON'); } }
              else if (hi === 0xD0) i+=1; else if (hi===0x80||hi===0xA0||hi===0xE0) i+=2; else if (s===0xF0){ while (i<u.length && u[i]!==0xF7) i++; }
            }
          }
        }catch(_){ }
        return f.apply(this, arguments);
      };
      M.filter.__ch16Sync = 1; log('Wrapped filter');
    }

    // Expose a light API to query 'used' from console if needed
    window.__CH16_USED = st.used;
  })();

  /* === Piano sync + UNUSED display === */
  (function pianoSync(){
    let COALESCE_MS = 60;
    const st = { msb:Array(CHS).fill(0), lsb:Array(CHS).fill(0), pg:Array(CHS).fill(0), timer:Array(CHS).fill(0), used:Array(CHS).fill(false) };

    function getRowSpan(ch){ const host=document.getElementById('ch16Container'); if(!host) return null; const grid=host.firstElementChild; if(!grid) return null; const left=grid.children[ch*2]; if(!left) return null; const spans=left.querySelectorAll('span'); return (spans.length>=2)?spans[1]:null; }

    function paintOne(ch){
      const msb=st.msb[ch]&0x7F, lsb=st.lsb[ch]&0x7F, pg=st.pg[ch]&0x7F;
      const span = getRowSpan(ch); if (!span) return;
      if (!st.used[ch]){
        if (span.textContent !== '-') span.textContent = '-';
        span.title = 'Unused channel';
        return;
      }
      let nm = nameFromCatalog(msb, lsb, pg);
      if (!nm) nm = `MSB ${msb} / LSB ${lsb} / PG ${pg}`; // strict numeric fallback
      if (span.textContent !== nm) span.textContent = nm;
      span.title = `MSB ${msb} / LSB ${lsb} / PG ${pg}`;
      log('paint', ch+1, st.used[ch]?'USED':'UNUSED', '→', nm);
    }
    function schedulePaint(ch){ clearTimeout(st.timer[ch]); st.timer[ch] = setTimeout(()=>paintOne(ch), COALESCE_MS); }
    function paintAll(){ for(let ch=0; ch<CHS; ch++) paintOne(ch); }

    CH16Bus.on('patch:applied', (ev)=>{
      const d=ev.detail||{}; const ch=clampCh(d.ch|0);
      st.msb[ch]=coerce7(d.msb||0); st.lsb[ch]=coerce7(d.lsb||0); st.pg[ch]=coerce7(d.pg||0); st.used[ch]=true;
      schedulePaint(ch);
    });
    CH16Bus.on('sf:loaded', ()=>{ // new SoundFont → reset usage and repaint with '-'
      for(let ch=0; ch<CHS; ch++){ st.used[ch]=false; }
      paintAll();
    });

    // First paint once rows appear
    (function first(){ let tries=0; (function wait(){ if (document.querySelector('#ch16Container span')) paintAll(); else if(++tries<100) setTimeout(wait,40); })(); })();

    // setStatus hook: reset UNUSED on new song and repaint
    (function hookSetStatus(){ const _set=window.setStatus; window.setStatus=function(msg){ try{ _set&&_set(msg);}catch(_){ } const s=String(msg||''); if (/LOADING\s+SONG/i.test(s)){ for(let ch=0; ch<CHS; ch++){ st.used[ch]=false; } } if (/PLAYING|IDLE|APPLYING\s+SF|LOADING\s+SF/i.test(s.toUpperCase())) setTimeout(paintAll, 0); }; })();

    // Panel visibility: repaint when becoming visible
    (function onShow(){ const pnl=document.getElementById('ch16Panel'); if(!pnl||!window.MutationObserver) return; const mo=new MutationObserver(()=>{ if(pnl.classList.contains('visible')) paintAll(); }); mo.observe(pnl,{attributes:true,attributeFilter:['class']}); })();

    window.__CH16_SYNC = {
      repaintAll: paintAll,
      setCoalesce: function(ms){ COALESCE_MS = Math.max(0, parseInt(ms||60,10)||60); },
      setLoader: function(fnName){ try{ SF_LOADER_FN = String(fnName||'loadSFont'); }catch(_){ } },
      setAltLoader: function(fnName){ try{ ALT_LOADER_FN = fnName ? String(fnName) : null; }catch(_){ } }
    };
  })();

})();
