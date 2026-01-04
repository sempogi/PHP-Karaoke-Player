/* ch16_piano_bundle_v2.1.js
 * CH16Piano v2.1 (robust + offscreen repaint + range + height)
 * - Robust MIDI parse: supports numeric subtype/type/eventType (8/9) and strings
 * - Offscreen background cache per row for fast repaint (no smear/ghosting)
 * - API: setRange(min,max), setHeight(px), setColors(...), setClock(...)
 */
(function (global) {
  'use strict';

  const CHS = 16;
  const DEF_CANVAS_W = 520;
  const DEF_CANVAS_H = 24;
  const DEF_COLORS = ['#7ef9a7','#4fd1ff','#ffd166','#ff8e72','#ff6bd6','#ffffff','#c6ffdd','#fbd786','#f7797d','#a1c4fd','#c2ffd8','#fdcfe8','#9be15d','#f6d365','#fda085','#84fab0'];

  const S = {
    container:null,
    rows:[], // [{canvas,ctx,label,inst,w,h,bgReady,bg, bctx}]
    colors: DEF_COLORS.slice(),
    NOTE_MIN: 0,
    NOTE_MAX: 127,
    clockNow: defaultNow,
    clockPlaying: defaultPlaying,
    raf: 0,
    parsed: null,  // { perCh:[[{n,t0,t1}]], spanSec }
    idx: null,
    lastSongToken: -1,
    observed:false
  };

  function defaultNow(){ try { if (global.ac) return Math.max(0,(global.ac.currentTime||0)-(global.songStart||0)); } catch(_){} return 0; }
  function defaultPlaying(){ try { return !!global.isPlaying; } catch(_) { return false; } }

  function init(containerOrSelector){
    const el=(typeof containerOrSelector==='string')?document.querySelector(containerOrSelector):containerOrSelector;
    if(!el) throw new Error('CH16Piano: container not found');
    S.container=el; S.container.innerHTML=''; S.rows.length=0;
    const table=document.createElement('div');
    table.style.display='grid'; table.style.gridTemplateColumns='auto 1fr'; table.style.gap='6px 10px'; table.style.alignItems='center';

    for(let ch=0; ch<CHS; ch++){
      const left=document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='8px'; left.style.minWidth='110px';
      const tag=document.createElement('span'); tag.textContent='CH '+(ch+1); tag.style.display='inline-block'; tag.style.minWidth='48px'; tag.style.font='12px/1.2 monospace'; tag.style.opacity='0.85';
      const inst=document.createElement('span'); inst.textContent=getInstrumentLabel(ch); inst.style.font='12px/1.2 system-ui'; inst.style.color='var(--muted,#9aa0a6)';
      left.appendChild(tag); left.appendChild(inst);

      const right=document.createElement('div'); right.style.position='relative';
      const canvas=document.createElement('canvas'); canvas.width=DEF_CANVAS_W; canvas.height=DEF_CANVAS_H; canvas.style.width='100%'; canvas.style.maxWidth=DEF_CANVAS_W+'px'; canvas.style.height=DEF_CANVAS_H+'px'; canvas.style.display='block'; canvas.style.border='1px solid rgba(255,255,255,.08)'; canvas.style.borderRadius='6px'; canvas.style.background='transparent';
      const ctx=canvas.getContext('2d');

      table.appendChild(left); table.appendChild(right); right.appendChild(canvas);

      const bg=document.createElement('canvas'); bg.width=canvas.width; bg.height=canvas.height; const bctx=bg.getContext('2d');

      S.rows.push({canvas,ctx,label:tag,inst,w:canvas.width,h:canvas.height,bgReady:false,bg,bctx});
    }
    S.container.appendChild(table);

    // Resize handler (debounced)
    let rid=0; window.addEventListener('resize', function(){ cancelAnimationFrame(rid); rid=requestAnimationFrame(resizeAll); });

    // Observe visibility toggle of the panel to force re-layout once
    if (!S.observed){
      const pnl = document.getElementById('ch16Panel');
      if (pnl && window.MutationObserver){
        const mo = new MutationObserver(()=>{ if (pnl.classList.contains('visible')){ try{ resizeAll(); }catch(_){} } });
        mo.observe(pnl,{attributes:true, attributeFilter:['class']});
        S.observed=true;
      }
    }

    resizeAll();
    kick();
    hookSetStatus();
  }

  function getInstrumentLabel(ch){ try{ if(global.__MIX16 && typeof __MIX16.getPatch==='function'){ const p=__MIX16.getPatch(ch); if(p && typeof p.program==='number'){ const msb=(p.bankMSB!=null)?p.bankMSB:0; const lsb=(p.bankLSB!=null)?p.bankLSB:0; const pg=p.program|0; return `MSB ${msb} / LSB ${lsb} / PG ${pg}`; } } }catch(_){} return '—'; }

  function isBlackKey(n){ const pc=n%12; return (pc===1||pc===3||pc===6||pc===8||pc===10); }

  function buildBackground(row){ const {bg,bctx,w,h}=row; if (!bg || !bctx) return; bg.width=w; bg.height=h; bctx.clearRect(0,0,w,h);
    const min=S.NOTE_MIN, max=S.NOTE_MAX, span=(max-min+1);
    for(let n=min; n<=max; n++){
      const x0=Math.floor((n-min)/span*w); const x1=Math.floor((n-min+1)/span*w); const bw=Math.max(1,x1-x0);
      bctx.fillStyle=isBlackKey(n)?'#1c2127':'#0f151a'; bctx.fillRect(x0,0,bw,h);
      bctx.fillStyle='rgba(255,255,255,0.06)'; bctx.fillRect(x1-1,0,1,h);
    }
    row.bgReady=true;
  }

  function resizeAll(){ S.rows.forEach(r=>{ const cssW=Math.round(r.canvas.getBoundingClientRect().width); if(cssW && cssW!==r.w){ r.w=cssW; r.canvas.width=cssW; r.bgReady=false; } const cssH=parseInt(getComputedStyle(r.canvas).height)||r.canvas.height; if(cssH && cssH!==r.h){ r.h=cssH; r.canvas.height=cssH; r.bgReady=false; } if (!r.bgReady) buildBackground(r); // ensure bg is current
      // paint one frame using bg so panel shows something even if idle
      if (r.bctx) r.ctx.drawImage(r.bg,0,0);
    });
  }

  function drawActive(row,ch,nowSec){ const {ctx,w,h,bg}=row; if(!ctx) return; // restore background in one blit (fast clear)
    if (bg) ctx.drawImage(bg,0,0);
    const color=S.colors[ch%S.colors.length]; ctx.globalAlpha=0.95; ctx.fillStyle=color;
    const evs=S.parsed?.perCh?.[ch]||[]; if(!evs.length) return;
    let idx=S.idx[ch]||0; if(idx>0 && evs[idx-1] && nowSec+0.02<evs[idx-1].t0) idx=0;
    while(idx>0 && evs[idx-1].t1>=nowSec-0.02) idx--; while(idx<evs.length && evs[idx].t1<nowSec-0.02) idx++;
    let i=idx; const min=S.NOTE_MIN, max=S.NOTE_MAX, span=(max-min+1);
    while(i<evs.length && evs[i].t0<=nowSec+0.02){ if(evs[i].t1>=nowSec-0.02){ const n=evs[i].n; const x0=Math.floor((n-min)/span*w); const x1=Math.floor((n-min+1)/span*w); const bw=Math.max(1,x1-x0); ctx.fillRect(x0,2,bw,h-4); ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.strokeRect(x0+0.5,1.5,bw-1,h-3); } i++; }
    S.idx[ch]=idx;
  }

  function tick(){ cancelAnimationFrame(S.raf); S.raf=requestAnimationFrame(tick); if(!S.parsed || !S.clockPlaying()) return; const nowSec=S.clockNow(); for(let ch=0; ch<CHS; ch++){ drawActive(S.rows[ch],ch,nowSec); } }
  function kick(){ if(!S.raf) S.raf=requestAnimationFrame(tick); }

  function _isNoteOn(e){ const st=e.subtype, tp=e.type, et=e.eventType; if (typeof st==='string' && /noteon/i.test(st)) return true; if (typeof tp==='string' && /noteon/i.test(tp)) return true; if (typeof et==='string' && /noteon/i.test(et)) return true; if (st===0x90 || tp===0x90 || et===0x90) return true; if (st===9 || tp===9 || et===9) return true; return false; }
  function _isNoteOff(e){ const st=e.subtype, tp=e.type, et=e.eventType; if (typeof st==='string' && /noteoff/i.test(st)) return true; if (typeof tp==='string' && /noteoff/i.test(tp)) return true; if (typeof et==='string' && /noteoff/i.test(et)) return true; if (st===0x80 || tp===0x80 || et===0x80) return true; if (st===8 || tp===8 || et===8) return true; return false; }
  function _getTimeSec(e){ if (e.playTime!=null) return Math.max(0, e.playTime/1000); if (e.playtime!=null) return Math.max(0, e.playtime/1000); return 0; }
  function _getCh(e){ if (e.channel!=null) return e.channel|0; if (e.midiChannel!=null) return e.midiChannel|0; return -1; }
  function _getNote(e){ if (e.noteNumber!=null) return e.noteNumber|0; if (e.param1!=null) return e.param1|0; if (e.note!=null) return e.note|0; return null; }
  function _getVel(e){ if (e.velocity!=null) return e.velocity|0; if (e.param2!=null) return e.param2|0; return 0; }

  function loadSMF(ab){ if(!ab) return; let mf, evs; try{ if (typeof MIDIFile!=='function'){ console.warn('CH16Piano: MIDIFile.js not found'); return; } mf=new MIDIFile(ab); evs=(typeof mf.getMidiEvents==='function')? mf.getMidiEvents(): mf.getEvents(); }catch(e){ console.warn('CH16Piano: cannot parse SMF', e); return; } if(!Array.isArray(evs) || !evs.length){ console.warn('CH16Piano: no MIDI events'); return; }
    const perCh=Array.from({length:CHS}, ()=>[]); const onMap=Array.from({length:CHS}, ()=> new Map());
    for(let i=0;i<evs.length;i++){ const e=evs[i]||{}; const ch=_getCh(e); if(ch<0||ch>=CHS) continue; const t=_getTimeSec(e); let n=_getNote(e); if(n==null) continue; n=Math.max(S.NOTE_MIN, Math.min(S.NOTE_MAX, n|0)); const vel=_getVel(e);
      if (_isNoteOn(e)){
        if ((vel|0)>0){ if(!onMap[ch].has(n)) onMap[ch].set(n,t); }
        else { const t0=onMap[ch].get(n); if(typeof t0==='number'){ perCh[ch].push({n,t0,t1:Math.max(t,t0+0.02)}); onMap[ch].delete(n);} }
      } else if (_isNoteOff(e)){
        const t0=onMap[ch].get(n); if(typeof t0==='number'){ perCh[ch].push({n,t0,t1:Math.max(t,t0+0.02)}); onMap[ch].delete(n);} }
    }
    const maxT=evs.reduce((m,e)=>{ const tt=_getTimeSec(e); return tt>m?tt:m; },0);
    for(let ch=0; ch<CHS; ch++){ onMap[ch].forEach((t0,n)=>{ perCh[ch].push({n,t0,t1:Math.max(maxT,t0+0.02)}); }); perCh[ch].sort((a,b)=>a.t0-b.t0); }
    S.parsed={perCh, spanSec:maxT}; S.idx=Array.from({length:CHS}, ()=>0);
    try{ for(let ch=0; ch<CHS; ch++){ S.rows[ch]?.inst && (S.rows[ch].inst.textContent=getInstrumentLabel(ch)); } }catch(_){ }
    S.rows.forEach(r=> r && (r.bgReady=false)); S.rows.forEach(buildBackground); resizeAll();
  }

  function hookSetStatus(){ if (hookSetStatus._done) return; hookSetStatus._done=true; const _set=global.setStatus; global.setStatus=function(msg){ try{ _set && _set(msg);}catch(_){} try{ if(msg==='PLAYING'){ const token=(typeof global.token==='number')?global.token:Date.now(); if(token!==S.lastSongToken){ S.lastSongToken=token; const ab=global.lastMIDIBuf; if(ab&&ab.byteLength){ loadSMF(ab); } S.idx=Array.from({length:CHS}, ()=>0); }
        // ensure immediate visible repaint when song starts
        resizeAll();
      } else if (msg==='IDLE'){ S.rows.forEach(r=> r && (r.bgReady=false)); S.rows.forEach(buildBackground); resizeAll(); } }catch(_){ } } }

  function setRange(min,max){ const a=Math.max(0, Math.min(127, min|0)); const b=Math.max(0, Math.min(127, max|0)); S.NOTE_MIN=Math.min(a,b); S.NOTE_MAX=Math.max(a,b); S.rows.forEach(r=> r && (r.bgReady=false)); S.rows.forEach(buildBackground); resizeAll(); }
  function setHeight(px){ const h = Math.max(14, Math.min(96, px|0)); S.rows.forEach(r=>{ r.canvas.style.height=h+'px'; r.h=h; r.canvas.height=h; r.bgReady=false; buildBackground(r); }); resizeAll(); }

  const API = {
    init,
    loadSMF,
    setClock: function(fnNowSec, fnPlaying){ if(typeof fnNowSec==='function') S.clockNow=fnNowSec; if(typeof fnPlaying==='function') S.clockPlaying=fnPlaying; },
    setColors: function(palette){ if(!palette||typeof palette!=='object') return; if(Array.isArray(palette)&&palette.length){ S.colors=palette.slice(); } else { for(let ch=0; ch<CHS; ch++){ const k='ch'+ch; if(palette[k]) S.colors[ch]=palette[k]; } } },
    setRange,
    setHeight
  };

  global.CH16Piano = API;
})(window);

// Auto-init (idempotent)
(function(){ if (window.__CH16PianoInitDone) return; window.__CH16PianoInitDone=true; function now(){ try { return (window.ac ? (ac.currentTime - (window.songStart||0)) : 0); } catch(_){ return 0; } } function playing(){ try { return !!window.isPlaying; } catch(_){ return false; } } function initOnce(){ try { if (!window.CH16Piano) return; CH16Piano.init('#ch16Container'); CH16Piano.setClock(now, playing); setTimeout(function(){ try { window.dispatchEvent(new Event('resize')); }catch(_){} }, 0); } catch(_){ } } if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initOnce, {once:true}); } else { initOnce(); } })();
