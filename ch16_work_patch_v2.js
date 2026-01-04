/* ch16_work_patch_v2.js
 * Minimal stabilizer: show panel on load, hard-feed SMF at PLAYING,
 * self-test button handler, and diagnostics badge (MF/BUF/EVENTS/Clock) with numeric 8/9 support.
 */
(function(){
  document.addEventListener('DOMContentLoaded', function(){ try{ document.getElementById('ch16Panel')?.classList.add('visible'); }catch(_){ } });
  var _set = window.setStatus; window.setStatus = function(msg){ try{ typeof _set==='function' && _set(msg); }catch(_){} if (msg==='PLAYING'){ try{ if (window.CH16Piano?.loadSMF && window.lastMIDIBuf?.byteLength){ CH16Piano.loadSMF(lastMIDIBuf.slice(0)); } }catch(_){} try{ window.__CH16_DIAG && __CH16_DIAG.refresh(); }catch(_){} } };

  document.addEventListener('DOMContentLoaded', function(){ var btn=document.getElementById('ch16SelfTest'); if (!btn || btn.dataset.bound==='1') return; btn.dataset.bound='1'; btn.addEventListener('click', function(){ try{ if (window.CH16Piano?.loadSMF && window.lastMIDIBuf?.byteLength){ CH16Piano.loadSMF(lastMIDIBuf.slice(0)); } else { alert('Monitor or buffer not ready.'); } }catch(e){ alert('Self-test failed.'); } }); });

  (function(){ var tag=document.createElement('span'); tag.id='ch16Diag'; tag.className='small'; tag.style.marginLeft='8px'; tag.style.padding='2px 6px'; tag.style.border='1px solid rgba(255,255,255,.15)'; tag.style.borderRadius='6px'; tag.style.background='rgba(17,17,17,.35)'; tag.style.color='#cbd'; var header=document.querySelector('header'); if(header) header.appendChild(tag);
    function isOn(e){ var st=e?.subtype, tp=e?.type, et=e?.eventType; if (typeof st==='string' && /noteon/i.test(st)) return true; if (typeof tp==='string' && /noteon/i.test(tp)) return true; if (typeof et==='string' && /noteon/i.test(et)) return true; if (st===0x90 || tp===0x90 || et===0x90) return true; if (st===9 || tp===9 || et===9) return true; return false; }
    function isOff(e){ var st=e?.subtype, tp=e?.type, et=e?.eventType; if (typeof st==='string' && /noteoff/i.test(st)) return true; if (typeof tp==='string' && /noteoff/i.test(tp)) return true; if (typeof et==='string' && /noteoff/i.test(et)) return true; if (st===0x80 || tp===0x80 || et===0x80) return true; if (st===8 || tp===8 || et===8) return true; return false; }
    function tSec(e){ if (e?.playTime!=null) return Math.max(0, e.playTime/1000); if (e?.playtime!=null) return Math.max(0, e.playtime/1000); return null; }
    function count(ab){ try{ if (!ab?.byteLength || typeof MIDIFile!=='function') return {notes:0, first:null}; var mf=new MIDIFile(ab); var evs=null; try{ evs=(typeof mf.getMidiEvents==='function')? mf.getMidiEvents(): null; }catch(_){} if (!Array.isArray(evs) || !evs.length){ try{ evs=(typeof mf.getEvents==='function')? mf.getEvents(): []; }catch(_){} }
      var notes=0, first=null; for (var i=0;i<(evs||[]).length;i++){ var e=evs[i]||{}; if (isOn(e) || isOff(e)){ notes++; var t=tSec(e); if (typeof t==='number') first=(first==null)?t:Math.min(first,t); } } return {notes:first==null?0:notes, first:first}; }catch(_){ return {notes:0, first:null}; } }
    function now(){ try{ return (window.ac ? (ac.currentTime - (window.songStart||0)) : 0); }catch(_){ return 0; } }
    function update(){ var mfOK=(typeof window.MIDIFile==='function'); var bufOK=!!(window.lastMIDIBuf && lastMIDIBuf.byteLength); var cnt=count(bufOK? lastMIDIBuf: null); var play=!!window.isPlaying; var clock=now(); tag.textContent='MF:'+(mfOK?'OK':'—')+' BUF:'+(bufOK? (Math.round(lastMIDIBuf.byteLength/1024)+'KB'):'—')+' EVENTS:'+cnt.notes+' FIRST:'+(cnt.first==null?'—':cnt.first.toFixed(2))+' PLAY:'+(play?'ON':'OFF')+' T:'+clock.toFixed(2); }
    var raf=0; function loop(){ update(); raf=requestAnimationFrame(function(){ setTimeout(loop, 160); }); } loop(); window.__CH16_DIAG={ refresh:update };
  })();
})();
