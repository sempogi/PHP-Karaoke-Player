// mixer16_patch_v4.2.9f.js
// Generated: 2025-10-09 12:21 GMT+08
// NEW: Instrument Patch Names Auto-Refresh (on PLAYING / song change) + Manual Refresh button (Mixer header)
// Bundle = Mixer v3.2 + UI Hotfix (v4.1) + Presets + Toasts + Popups + Watcher + Self-Test + Compact Status + Patch Names
//        + Auto-Pan with Visual Sync (A‑Sync badge) + Self-Test micro-toggle
// Server endpoint used: preset_api.php

(function(){
  // ===== Utilities =====
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function num(v, d){ var x = parseInt(v, 10); return (isNaN(x) ? d : x); }

  // ===== Toast (non-invasive) =====
  (function injectToast(){
    if (document.getElementById('mixToastCSS')) return;
    function mount(){
      if (document.getElementById('mixToastCSS')) return;
      var css = '#mixToastDock{position:fixed;right:12px;top:12px;z-index:1200;display:flex;flex-direction:column;gap:8px}'
              + '.mixToast{min-width:220px;max-width:min(92vw,460px);padding:8px 10px;border-radius:10px;color:#eaf2ff;'
              + 'font:13px/1.35 system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.4);opacity:0;'
              + 'transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease;border:1px solid rgba(255,255,255,.15)}'
              + '.mixToast.show{opacity:1;transform:translateY(0)}'
              + '.mixToast.ok{background:rgba(28,42,54,.92);border-color:#3a5166}'
              + '.mixToast.info{background:rgba(34,34,40,.92);border-color:#52526a}'
              + '.mixToast.err{background:rgba(62,22,22,.94);border-color:#a44}'
              + '.mixToast .t-msg{white-space:pre-wrap}';
      var st=document.createElement('style'); st.id='mixToastCSS'; st.textContent=css; document.head.appendChild(st);
      var dock=document.createElement('div'); dock.id='mixToastDock'; document.body.appendChild(dock);
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once:true });
  })();
  function toast(msg, type){ try{ var dock=document.getElementById('mixToastDock'); if(!dock){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', function(){ toast(msg, type); }, { once:true }); } return; } var el=document.createElement('div'); el.className='mixToast '+(type||'ok'); el.innerHTML='<span class="t-msg"></span>'; el.querySelector('.t-msg').textContent=String(msg||''); dock.appendChild(el); requestAnimationFrame(function(){ el.classList.add('show'); }); setTimeout(function(){ el.classList.remove('show'); setTimeout(function(){ el.remove(); }, 220); }, 1800);}catch(e){} }
  function ok(m){ toast(m,'ok'); } function info(m){ toast(m,'info'); } function err(m){ toast(m,'err'); }

  // ===== Mixer State =====
  var LS='mix16:';
  function lsGet(k, d){ try{ var v=localStorage.getItem(LS+k); return (v==null? d : v); }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(LS+k, v); }catch(e){} }

  var mute = new Array(16).fill(false);
  var solo = new Array(16).fill(false);
  var pan  = new Array(16).fill(64);   // 0..127
  var vol  = new Array(16).fill(100);  // 0..127 baseline channel volume
  var rev  = new Array(16).fill(40);   // 0..127 Reverb send (CC91)
  var cho  = new Array(16).fill(0);    // 0..127 Chorus send (CC93)
  var ccPanLink = (lsGet('ccPan','on')==='on');
  var muteMode  = lsGet('muteMode','cc7'); // 'cc7' | 'cc11' | 'gate'
  var ccProtect = (lsGet('ccProtect','on')==='on'); // block file CC resets (7/10/11/91/93)

  for (var i=0;i<16;i++){
    mute[i] = (lsGet('m'+i,'off')==='on');
    solo[i] = (lsGet('s'+i,'off')==='on');
    pan[i]  = clamp(num(lsGet('p'+i,'64'), 64), 0, 127);
    vol[i]  = clamp(num(lsGet('v'+i,'100'), 100), 0, 127);
    rev[i]  = clamp(num(lsGet('rv'+i,'40'), 40), 0, 127);
    cho[i]  = clamp(num(lsGet('ch'+i,'0'), 0), 0, 127);
  }

  // ===== Auto-Pan (per-channel) =====
  var autoPanOn = new Array(16).fill(false);
  var apTarget  = new Array(16).fill(64);
  var apSpeed   = new Array(16).fill(120); // ms per step
  var apAccum   = new Array(16).fill(0);
  var apRunning = false;
  var apRAF = null, apLastTs = 0;

  // Visual sync toggle (persisted)
  var apVisualSync = (lsGet('apSync','on') === 'on');

  for (var i2=0;i2<16;i2++){
    autoPanOn[i2] = (lsGet('ap'+i2, 'off') === 'on');
  }

  function apPickTarget(cur){
    var t = (Math.random()*128)|0;
    if (Math.abs(t - cur) < 12) t = (t + 24) % 128;
    return t;
  }
  function apPickSpeed(){
    return 80 + ((Math.random()*200)|0); // 80..280ms per 1 step
  }
  function apUpdateUI(ch, cur){
    try{
      var strip = document.querySelector('#mix16Panel .strip[data-i="'+ch+'"]');
      if(!strip) return;
      var slider = strip.querySelector('input.pan');
      if (slider) slider.value = String(cur);
      var labs = strip.querySelectorAll('.row .lbl .val');
      if (labs && labs[0]) labs[0].textContent = String(cur);
    }catch(e){}
  }
  function apTick(ts){
    if(!apRunning){ apRAF = null; return; }
    if(!ts) ts = (typeof performance!=='undefined' && performance.now)? performance.now() : Date.now();
    var dt = ts - (apLastTs || ts);
    apLastTs = ts;

    var anyOn = false;
    try{
      for (var ch=0; ch<16; ch++){
        if(!autoPanOn[ch]) continue;
        anyOn = true;
        var cur = pan[ch]|0;
        apAccum[ch] += dt;
        var sp = apSpeed[ch]|0;
        while (apAccum[ch] >= sp){
          apAccum[ch] -= sp;
          var t = apTarget[ch]|0;
          if (t > cur) cur++;
          else if (t < cur) cur--;
          else { apSpeed[ch] = apPickSpeed(); apTarget[ch] = apPickTarget(cur); }
        }
        if(cur !== (pan[ch]|0)){
          __MIX16.pan(ch, cur);
          if (apVisualSync) apUpdateUI(ch, cur);
        }
      }
    }catch(e){}

    apRunning = anyOn;
    apRAF = apRunning ? requestAnimationFrame(apTick) : null;
  }
  function apEnsure(){
    if(apRunning || autoPanOn.some(Boolean)){
      apRunning = true;
      if(!apRAF) apRAF = requestAnimationFrame(apTick);
    }
  }

  // Optional external sender (for Gate mode / future streaming)
  var _sender = null; // function(bytes)
  function setSender(fn){ _sender = fn; }
  var __MIX16_SENDING = false; // guard to not block ourselves

  // ===== MIDI SEND HELPERS (with reliable queue) =====
  function mkCC(ch, cc, val){ return new Uint8Array([0xB0|(ch&0x0F), cc&0x7F, val&0x7F]); }
  function canSend(){ try{ if (window.synth && typeof window.synth.midiControl === 'function') return true; }catch(e){} try{ return (typeof _sender === 'function'); }catch(e){ return false; } }
  var ccQueue = []; // {ch,cc,val}
  var drainTimer = null;
  function addCCToQueue(ch,cc,val){ ch|=0; cc|=0; val=clamp(val|0,0,127); for (var i=0;i<ccQueue.length;i++){ var it=ccQueue[i]; if(it.ch===ch && it.cc===cc){ it.val=val; return; } } ccQueue.push({ch:ch,cc:cc,val:val}); }
  function drainQueuedCC(){ if(!canSend()) return false; try{ var copy=ccQueue.slice(); ccQueue.length=0; for(var i=0;i<copy.length;i++){ var it=copy[i]; var ok=false; try{ if (window.synth && typeof window.synth.midiControl==='function'){ __MIX16_SENDING=true; try{ window.synth.midiControl(it.ch,it.cc,it.val); ok=true; } finally { __MIX16_SENDING=false; } } }catch(e){} if(!ok){ try{ if(typeof _sender==='function'){ _sender(mkCC(it.ch,it.cc,it.val)); ok=true; } }catch(e){} } if(!ok){ addCCToQueue(it.ch,it.cc,it.val); } } }catch(e){} return ccQueue.length===0; }
  function armDrain(){ if(drainTimer) return; drainTimer=setInterval(function(){ if(!canSend()) return; if(drainQueuedCC()){ clearInterval(drainTimer); drainTimer=null; } }, 120); }

  function sendCC(ch,cc,val){ var ok=false; try{ if(window.synth && typeof window.synth.midiControl==='function'){ __MIX16_SENDING=true; try{ window.synth.midiControl(ch|0,cc|0,val|0); ok=true; } finally { __MIX16_SENDING=false; } } }catch(e){} if(!ok){ try{ if(typeof _sender==='function'){ _sender(mkCC(ch,cc,val)); ok=true; } }catch(e){} } if(!ok){ addCCToQueue(ch,cc,val); armDrain(); return false; } return true; }

  function anySolo(){ for(var i=0;i<16;i++) if(solo[i]) return true; return false; }
  function channelAllowed(ch){ if(anySolo()) return !!solo[ch]; return !mute[ch]; }

  function applyPan(ch){ if(!ccPanLink) return; sendCC(ch, 10, clamp(pan[ch],0,127)); }
  function applyVol(ch){ sendCC(ch, 7, clamp(vol[ch],0,127)); }
  function applyMute(ch){ if (muteMode==='cc7'){ var v = mute[ch] ? 0 : clamp(vol[ch],0,127); sendCC(ch, 7, v); } else if (muteMode==='cc11'){ sendCC(ch, 11, mute[ch] ? 0 : 100); } }
  function applyRev(ch){ sendCC(ch, 91, clamp(rev[ch],0,127)); }
  function applyCho(ch){ sendCC(ch, 93, clamp(cho[ch],0,127)); }
  function applyAll(){ for (var i=0;i<16;i++){ if(ccPanLink) applyPan(i); applyVol(i); applyMute(i); applyRev(i); applyCho(i); } drainQueuedCC() || armDrain(); }

  // ===== CC Protect =====
  var PROTECT_CCS = {7:1,10:1,11:1,91:1,93:1};
  function shouldBlockCC(cc){ return !!PROTECT_CCS[(cc|0)&0x7F]; }

  // ===== PUBLIC API =====
  window.__MIX16 = {
    info: function(){ return { mute:mute.slice(), solo:solo.slice(), pan:pan.slice(), vol:vol.slice(), rev:rev.slice(), cho:cho.slice(), ccPanLink:ccPanLink, muteMode:muteMode, ccProtect:ccProtect, anySolo:anySolo(), senderWrapped: !!window.__MIX16.__senderWrapped, hasSynthMC: !!(window.synth && typeof window.synth.midiControl==='function'), webmidiPatched: !!window.__MIX16.__webmidiPatched, autoPan: autoPanOn.slice(), apVisualSync: !!apVisualSync }; },
    mute: function(ch,on){ ch=clamp(ch|0,0,15); mute[ch]=!!on; lsSet('m'+ch, mute[ch]?'on':'off'); applyMute(ch); __paintChan(ch); __paintSM(ch); refreshCompactStatus(); },
    solo: function(ch,on){ ch=clamp(ch|0,0,15); solo[ch]=!!on; lsSet('s'+ch, solo[ch]?'on':'off'); __paintChan(ch); __paintSM(ch); },
    pan:  function(ch,val){ ch=clamp(ch|0,0,15); var v=clamp(val|0,0,127); pan[ch]=v; lsSet('p'+ch, String(v)); applyPan(ch); __paintChan(ch); },
    vol:  function(ch,val){ ch=clamp(ch|0,0,15); var v=clamp(val|0,0,127); vol[ch]=v; lsSet('v'+ch, String(v)); if(!mute[ch] || muteMode!=='cc7') applyVol(ch); if(muteMode==='cc7' && !mute[ch]) applyMute(ch); __paintChan(ch); },
    rev:  function(ch,val){ ch=clamp(ch|0,0,15); var v=clamp(val|0,0,127); rev[ch]=v; lsSet('rv'+ch, String(v)); applyRev(ch); __paintChan(ch); },
    cho:  function(ch,val){ ch=clamp(ch|0,0,15); var v=clamp(val|0,0,127); cho[ch]=v; lsSet('ch'+ch, String(v)); applyCho(ch); __paintChan(ch); },
    muteAll: function(){ for (var i=0;i<16;i++){ mute[i]=true; lsSet('m'+i,'on'); applyMute(i); } __paintAll(); },
    unmuteAll: function(){ for (var i=0;i<16;i++){ mute[i]=false; lsSet('m'+i,'off'); applyMute(i); } __paintAll(); },
    clearSolo: function(){ for (var i=0;i<16;i++){ solo[i]=false; lsSet('s'+i,'off'); } __paintAll(); __paintSM(); },
    setMode: function(opts){
      if(opts&&opts.muteMode){ var old=muteMode; muteMode=(opts.muteMode==='cc11'?'cc11': (opts.muteMode==='cc7'?'cc7':'gate')); lsSet('muteMode', muteMode); if(old==='cc7' && muteMode!=='cc7'){ for (var i=0;i<16;i++){ sendCC(i,7,clamp(vol[i],0,127)); } } for (var i=0;i<16;i++) applyMute(i); }
      if(opts&&typeof opts.ccPanLink==='boolean'){ ccPanLink=!!opts.ccPanLink; lsSet('ccPan', ccPanLink?'on':'off'); for (var j=0;j<16;j++) applyPan(j); }
      if(opts&&typeof opts.ccProtect==='boolean'){ ccProtect=!!opts.ccProtect; lsSet('ccProtect', ccProtect?'on':'off'); info('CC Protect '+(ccProtect?'ON':'OFF')); }
      if(opts&&typeof opts.apVisualSync==='boolean'){ apVisualSync = !!opts.apVisualSync; lsSet('apSync', apVisualSync ? 'on' : 'off'); info('Auto-Pan Visual '+(apVisualSync?'Sync ON':'Sync OFF')); }
      __paintMode(); refreshCompactStatus(); return { muteMode:muteMode, ccPanLink:ccPanLink, ccProtect:ccProtect, apVisualSync:apVisualSync };
    },
    wrapSender: function(fn){ setSender(fn); window.__MIX16.__senderWrapped=true; drainQueuedCC(); try{ applyAll(); setTimeout(applyAll, 100); }catch(e){} refreshCompactStatus(); return function(bytes){ var b=bytes; if(!b||b.length<1) return; var s=b[0], hi=s&0xF0, ch=s&0x0F; if(hi===0x90 && (b[2]||0)>0 && muteMode==='gate'){ if(!channelAllowed(ch)) return; } if(hi===0xB0){ var cc=b[1]&0x7F; if(ccProtect && shouldBlockCC(cc)) return; } return _sender && _sender(b); } },
    filter: function(bytes){ if(!bytes||bytes.length<1) return bytes; var s=bytes[0], hi=s&0xF0, ch=s&0x0F; if(hi===0x90 && (bytes[2]||0)>0 && muteMode==='gate'){ if(!channelAllowed(ch)) return null; } if(hi===0xB0){ var cc=bytes[1]&0x7F; if(ccProtect && shouldBlockCC(cc)) return null; } return bytes; },
    reset: function(){ for (var i=0;i<16;i++){ mute[i]=false; solo[i]=false; pan[i]=64; vol[i]=100; rev[i]=40; cho[i]=0; lsSet('m'+i,'off'); lsSet('s'+i,'off'); lsSet('p'+i,'64'); lsSet('v'+i,'100'); lsSet('rv'+i,'40'); lsSet('ch'+i,'0'); applyPan(i); applyVol(i); applyMute(i); applyRev(i); applyCho(i); } __paintAll(); __paintSM(); refreshCompactStatus(); },
    patchWebMIDI: async function(){ try{ if(!navigator.requestMIDIAccess) return {ok:false, reason:'WebMIDI not available'}; var ma=await navigator.requestMIDIAccess(); function wrapOut(out){ if(!out||!out.send||out.send.__mix16Wrapped) return; var orig=out.send.bind(out); out.send=function(data, ts){ try{ var f=(window.__MIX16&&__MIX16.filter)?__MIX16.filter(data):data; if(!f) return; return orig(f, ts); }catch(e){ return orig(data, ts);} }; out.send.__mix16Wrapped=true; } ma.outputs.forEach(wrapOut); ma.onstatechange=function(){ ma.outputs.forEach(wrapOut); }; window.__MIX16.__webmidiPatched=true; refreshCompactStatus(); return {ok:true, outputs: ma.outputs.size}; }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; } },
    panic: function(){ for (var i=0;i<16;i++){ sendCC(i,123,0); sendCC(i,120,0); sendCC(i,64,0); } info('Panic sent'); },
    autoPan: function(ch, on){ ch = clamp(ch|0,0,15); autoPanOn[ch]=!!on; lsSet('ap'+ch, autoPanOn[ch]?'on':'off'); if(on){ apTarget[ch]=apPickTarget(pan[ch]|0); apSpeed[ch]=apPickSpeed(); apAccum[ch]=0; apEnsure(); } try{ MixWin.updateStripButtons(ch); }catch(e){} },
    autoPanInfo: function(){ return autoPanOn.slice(); }
  };

  // Optionally wrap window.synth.midiControl to enforce CC Protect even if sender pipeline isn’t used
  (function tryHookSynthCC(){ try{ if(!window.synth || typeof window.synth.midiControl !== 'function') return; if(window.synth.midiControl.__mix16Wrapped) return; var _origMC = window.synth.midiControl.bind(window.synth); window.synth.midiControl = function(ch, cc, val){ if(!__MIX16_SENDING && ccProtect && shouldBlockCC(cc|0)) return; try{ return _origMC(ch|0, cc|0, val|0); }catch(e){} }; window.synth.midiControl.__mix16Wrapped = true; }catch(e){} })();

  // PLAYING hook: re-apply + try preset + auto-refresh patch names
  (function(){ var _orig = window.setStatus; window.setStatus = function(msg){ try{ _orig && _orig(msg); }catch(e){} if(msg==='PLAYING'){ try{ applyAll();try{
  if(window.SimpleMapperCatalog && typeof SimpleMapperCatalog.refreshSF==='function'){ SimpleMapperCatalog.refreshSF();
    SimpleMapperCatalog.refreshSF();
  }
}catch(_){} Promise.resolve(loadAndApplyPresetFor(currentRel())).then(function(){ setTimeout(function(){ applyAll(); try{ __MIX16.refreshNames({ fallback:true }); }catch(e){} }, 120); setTimeout(function(){ applyAll(); try{ __MIX16.refreshNames({ fallback:true }); }catch(e){} }, 600); }); }catch(e){} } }; })();

  // ===== Song Watcher (fallback if host doesn't call setStatus('PLAYING')) =====
  (function(){ var lastRel = null, armed=false; function burst(){ try{ applyAll(); }catch(e){} setTimeout(function(){ try{ applyAll(); __MIX16.refreshNames && __MIX16.refreshNames({ fallback:true }); }catch(e){} },120); setTimeout(function(){ try{ applyAll(); __MIX16.refreshNames && __MIX16.refreshNames({ fallback:true }); }catch(e){} },600); setTimeout(function(){ try{ applyAll(); __MIX16.refreshNames && __MIX16.refreshNames({ fallback:true }); }catch(e){} },1500); setTimeout(function(){ try{ applyAll(); __MIX16.refreshNames && __MIX16.refreshNames({ fallback:true }); }catch(e){} },3000); } async function check(){ var rel=currentRel(); if(rel && rel!==lastRel){ lastRel=rel; try{ await loadAndApplyPresetFor(rel); }catch(e){} burst(); armed=true; } else if(rel && armed){ burst(); armed=false; } } setInterval(check, 400); })();

  // ===== Compact Status (badges in CC row) =====
  function compactStatusHTML(inf){
    function b(lbl,ok){ return '<span class="b '+(ok?'ok':'bad')+'">'+lbl+'</span>'; }
    return b('Synth', !!inf.hasSynthMC)
         + b('Wrap',  !!inf.senderWrapped)
         + b('W-MIDI',!!inf.webmidiPatched)
         + '<span class="b">'+String(inf.muteMode||'')+'</span>'
         + b('Lock',  !!inf.ccProtect)
         + b('Pan10', !!inf.ccPanLink)
         + b('A‑Sync',!!inf.apVisualSync);
  }
  function refreshCompactStatus(){ try{ var box=$('#mix16StatusBadges'); if(!box) return; var inf=__MIX16.info(); box.innerHTML = compactStatusHTML(inf); }catch(e){} }

  // ===== UI (Control Center row) =====
  function injectCCRow(){ var cc=$('#ccPanel'); if(!cc) return; var list=cc.querySelector('.list'); if(!list) return; if($('#ccMix16Row')) return; var row=document.createElement('div'); row.className='row'; row.id='ccMix16Row'; row.innerHTML =
      '<span class="label">Mixer (16ch)</span>'
      + '<div class="chips" id="mix16ModeChips" style="margin-left:8px">'
      + '  <button class="small" data-mm="gate" title="Drop NoteOn for muted channels">Gate</button>'
      + '  <button class="small" data-mm="cc7" title="CC7 Volume mute">CC7</button>'
      + '  <button class="small" data-mm="cc11" title="CC11 Expression mute">CC11</button>'
      + '</div>'
      + '<label class="small" style="margin-left:8px"><input type="checkbox" id="mix16PanCC"> Pan→CC10</label>'
      + '<label class="small" style="margin-left:8px"><input type="checkbox" id="mix16LockCC"> Lock CC7/10/11/91/93</label>'
      + '<button class="small" id="mix16MuteAll">Mute All</button>'
      + '<button class="small" id="mix16UnmuteAll">Unmute All</button>'
      + '<button class="small" id="mix16OpenWin" title="Open Mixer Window">Open</button>'
      + '<div class="md-split" style="display:inline-block; position:relative; margin-left:8px">'
      + '  <button id="mixPresetBtn" class="small" title="Presets">Preset ▾</button>'
      + '  <div id="mixPresetMenu" class="md-menu" style="right:auto; left:0;">'
      + '    <button class="md-item" data-act="save">Save (song)</button>'
      + '    <button class="md-item" data-act="saveDefault">Save as Default</button>'
      + '    <button class="md-item" data-act="loadDefault">Load Default</button>'
      + '    <button class="md-item" data-act="delete">Delete Song Preset</button>'
      + '    <button class="md-item" data-act="openWin">Open Presets Window</button>'
      + '    <button class="md-item" data-act="selfTest">Self-Test</button>'
      + '  </div>'
      + '</div>'
      + '<span id="mix16StatusBadges" class="small" style="margin-left:10px; display:inline-flex; gap:4px; flex-wrap:wrap"></span>'
      + '<button class="small" id="mix16PanicBtn" title="All Notes Off / All Sound Off" style="margin-left:6px">Panic</button>';
    list.appendChild(row);

    // Small CSS for badges
    (function(){ var css='#mix16StatusBadges .b{display:inline-block;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(28,42,54,.5);color:#cfe3ff}#mix16StatusBadges .b.ok{background:rgba(22,44,26,.5);border-color:#3b7}#mix16StatusBadges .b.bad{background:rgba(62,22,22,.5);border-color:#a55}'; var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st); })();

    var chips=$('#mix16ModeChips'); function paintMode(){ chips.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-mm')===muteMode)); }); }
    chips.addEventListener('click', function(e){ var b=e.target.closest('button[data-mm]'); if(!b) return; __MIX16.setMode({muteMode:b.getAttribute('data-mm')}); paintMode(); }); paintMode();

    var link=$('#mix16PanCC'); link.checked=ccPanLink; link.addEventListener('change', function(){ __MIX16.setMode({ccPanLink:!!link.checked}); });
    var lock=$('#mix16LockCC'); lock.checked=ccProtect; lock.addEventListener('change', function(){ __MIX16.setMode({ccProtect:!!lock.checked}); });

    $('#mix16MuteAll').addEventListener('click', function(){ __MIX16.muteAll(); });
    $('#mix16UnmuteAll').addEventListener('click', function(){ __MIX16.unmuteAll(); });
    $('#mix16OpenWin').addEventListener('click', function(){ MixWin.show(); });
    $('#mix16PanicBtn').addEventListener('click', function(){ __MIX16.panic(); });

    (function(){ var btn=$('#mixPresetBtn'), menu=$('#mixPresetMenu'); if(!btn||!menu) return; function toggleMenu(open){ menu.classList.toggle('open', open==null? !menu.classList.contains('open'): !!open); } btn.addEventListener('click', function(){ toggleMenu(); }); document.addEventListener('click', function(e){ if(!row.contains(e.target)) toggleMenu(false); }); menu.addEventListener('click', async function(e){ var b=e.target.closest('.md-item'); if(!b) return; var act=b.getAttribute('data-act'); toggleMenu(false); if(act==='openWin'){ PresetWin.show(); return; } if(act==='selfTest'){ SelfTestWin.show(); return; } await presetAction(act); }); })();

    // Initial status
    refreshCompactStatus();
  }

  // ===== Popup Mixer window =====
  var MixWin = (function(){ var win, head, list, ready=false; var KEY='wm:mix16'; function ensure(){ if(ready) return true; win=$('#mix16Panel'); if(!win){ win=document.createElement('section'); win.className='panel win'; win.id='mix16Panel'; win.style.left='24px'; win.style.top='86px'; win.style.width='700px'; win.innerHTML = '<h4 class="drag"><span>Mixer (16ch)</span><span class="wm-chrome"><button class="wm-btn" id="mix16Min">—</button><button class="wm-btn" id="mix16Max">▢</button><button class="wm-btn" id="mix16NamesRefresh" title="Refresh Patch Names">⟳</button></span><span><button class="close" data-close="mix16">×</button></span></h4>' + '<div class="list" id="mix16List"></div>' + '<div class="wm-grip" aria-hidden="true"></div>'; document.body.appendChild(win);} head=win.querySelector('.drag'); list=$('#mix16List'); if(!list.dataset.built){ var css = '#mix16Panel .strip{display:flex;flex-direction:column;align-items:center;background:rgba(17,23,29,.6);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px;min-width:112px;margin:6px}#mix16Panel .grid{display:flex;flex-wrap:wrap;align-items:flex-start}#mix16Panel .title{font:11px/1.1 system-ui;color:#b7c8d9;margin-bottom:4px}#mix16Panel .btns{display:flex;gap:6px;margin-bottom:4px}#mix16Panel .btns .b{width:28px;height:22px;border-radius:6px;border:1px solid #3a5166;background:#1b2633;color:#dfe8f3;font-size:11px;cursor:pointer}#mix16Panel .btns .b.active,#mix16Panel .btns .b[aria-pressed="true"]{background:#25415a;border-color:#5aa9ff;color:#eaf6ff;outline:2px solid #46b2ff;outline-offset:0}#mix16Panel .btns .b.s.active{box-shadow:0 0 0 1px rgba(70,178,255,.35) inset}#mix16Panel .btns .b.m.active{box-shadow:0 0 0 1px rgba(255,88,88,.35) inset}#mix16Panel .row{width:100%;margin:2px 0}#mix16Panel .lbl{display:flex;justify-content:space-between;font-size:10px;color:#9fb6c9}#mix16Panel input[type=range]{width:100%}'; var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st); var grid=document.createElement('div'); grid.className='grid'; list.appendChild(grid); for(let i=0;i<16;i++){ var el=document.createElement('div'); el.className='strip'; el.dataset.i=String(i); el.innerHTML = '<div class="title">CH '+(i+1)+'</div>' + '<div class="btns">' + '  <button class="b s" title="Solo" aria-pressed="'+(solo[i]?'true':'false')+'">S</button>' + '  <button class="b m" title="Mute" aria-pressed="'+(mute[i]?'true':'false')+'">M</button>' + '  <button class="b a" title="Auto Pan" aria-pressed="'+(autoPanOn[i]?'true':'false')+'">A</button>' + '</div>' + '<div class="pname dim">—</div>' + '<div class="row"><div class="lbl"><span>Pan</span><span class="val">'+pan[i]+'</span></div>' + '  <input class="pan" type="range" min="0" max="127" step="1" value="'+pan[i]+'">' + '</div>' + '<div class="row"><div class="lbl"><span>Vol</span><span class="val">'+vol[i]+'</span></div>' + '  <input class="vol" type="range" min="0" max="127" step="1" value="'+vol[i]+'">' + '</div>' + '<div class="row"><div class="lbl"><span>Rev</span><span class="val">'+rev[i]+'</span></div>' + '  <input class="rev" type="range" min="0" max="127" step="1" value="'+rev[i]+'">' + '</div>' + '<div class="row"><div class="lbl"><span>Cho</span><span class="val">'+cho[i]+'</span></div>' + '  <input class="cho" type="range" min="0" max="127" step="1" value="'+cho[i]+'">' + '</div>'; grid.appendChild(el);} list.dataset.built='1'; list.addEventListener('click', function(e){ var b=e.target.closest('.b'); if(!b) return; var strip=b.closest('.strip'); var i=parseInt(strip.dataset.i,10)||0; if(b.classList.contains('s')){ __MIX16.solo(i, !solo[i]); } else if(b.classList.contains('m')){ __MIX16.mute(i, !mute[i]); } else if(b.classList.contains('a')){ __MIX16.autoPan(i, !autoPanOn[i]); } updateStripButtons(i); }); list.addEventListener('input', function(e){ var strip=e.target.closest('.strip'); if(!strip) return; var i=parseInt(strip.dataset.i,10)||0; var labs=strip.querySelectorAll('.row .lbl .val'); if(e.target.classList.contains('pan')){ var v=parseInt(e.target.value,10)||0; __MIX16.pan(i, v); labs[0].textContent=String(v); if (autoPanOn[i]){ apTarget[i]=apPickTarget(v); apSpeed[i]=apPickSpeed(); apAccum[i]=0; apEnsure(); } } if(e.target.classList.contains('vol')){ var v2=parseInt(e.target.value,10)||0; __MIX16.vol(i, v2); labs[1].textContent=String(v2); } if(e.target.classList.contains('rev')){ var v3=parseInt(e.target.value,10)||0; __MIX16.rev(i, v3); labs[2].textContent=String(v3); } if(e.target.classList.contains('cho')){ var v4=parseInt(e.target.value,10)||0; __MIX16.cho(i, v4); labs[3].textContent=String(v4); } }); } if(!win.dataset.bound){ function rect(){ return win.getBoundingClientRect(); } function save(){ try{ var r=rect(); localStorage.setItem(KEY, JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height})); }catch(e){} } try{ var st=JSON.parse(localStorage.getItem(KEY)||'null'); if(st){ win.style.left=st.left+'px'; win.style.top=st.top+'px'; if(st.width) win.style.width=st.width+'px'; if(st.height) win.style.height=st.height+'px'; } }catch(e){} head.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY, ox=sx-r.left, oy=sy-r.top; function mv(ev){ var x=ev.clientX, y=ev.clientY; var L=Math.max(0, Math.min(innerWidth-r.width, x-ox)); var T=Math.max(0, Math.min(innerHeight-r.height, y-oy)); win.style.left=L+'px'; win.style.top=T+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); var grip=win.querySelector('.wm-grip'); grip.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY; function mv(ev){ var w=Math.max(500, r.width + (ev.clientX - sx)); var h=Math.max(340, r.height + (ev.clientY - sy)); win.style.width=w+'px'; win.style.height=h+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); $('#mix16Min').addEventListener('click', function(){ win.classList.toggle('minimized'); save(); }); $('#mix16Max').addEventListener('click', function(){ if(win.classList.contains('maximized')){ win.classList.remove('maximized'); } else { win.classList.remove('minimized'); win.classList.add('maximized'); } save(); }); document.addEventListener('click', function(e){ var btn=e.target && e.target.closest && e.target.closest('button.close[data-close="mix16"]'); if(btn){ e.stopPropagation(); win.classList.remove('visible'); } }, true); var rn=$('#mix16NamesRefresh'); if(rn) rn.addEventListener('click', function(){ try{ __MIX16.refreshNames({ fallback:true }); ok('Patch names refreshed'); }catch(e){ info('Refresh failed'); } }); win.dataset.bound='1'; } ready=true; return true; } function updateStripButtons(i){ try{ var strip=$('#mix16Panel .strip[data-i="'+i+'"]'); if(!strip) return; var sBtn=strip.querySelector('.b.s'); var mBtn=strip.querySelector('.b.m'); var aBtn=strip.querySelector('.b.a'); var st=__MIX16.info(); var s=!!st.solo[i]; var m=!!st.mute[i]; var a=!!(st.autoPan && st.autoPan[i]); if(sBtn){ sBtn.classList.toggle('active', s); sBtn.setAttribute('aria-pressed', s); } if(mBtn){ mBtn.classList.toggle('active', m); mBtn.setAttribute('aria-pressed', m); } if(aBtn){ aBtn.classList.toggle('active', a); aBtn.setAttribute('aria-pressed', a); } }catch(e){} } function paint(){ try{ $all('#mix16Panel .strip').forEach(function(el){ var i=parseInt(el.dataset.i,10)||0; el.querySelector('.b.s').classList.toggle('active', !!solo[i]); el.querySelector('.b.s').setAttribute('aria-pressed', !!solo[i]); el.querySelector('.b.m').classList.toggle('active', !!mute[i]); el.querySelector('.b.m').setAttribute('aria-pressed', !!mute[i]); var ab = el.querySelector('.b.a'); if(ab){ var aOn = !!autoPanOn[i]; ab.classList.toggle('active', aOn); ab.setAttribute('aria-pressed', aOn); } el.querySelector('input.pan').value=String(pan[i]); el.querySelector('input.vol').value=String(vol[i]); var r=el.querySelector('input.rev'); if(r) r.value=String(rev[i]); var c=el.querySelector('input.cho'); if(c) c.value=String(cho[i]); var labs=el.querySelectorAll('.row .lbl .val'); if(labs.length>=4){ labs[0].textContent=String(pan[i]); labs[1].textContent=String(vol[i]); labs[2].textContent=String(rev[i]); labs[3].textContent=String(cho[i]); } // patch label paint
        var pn=el.querySelector('.pname'); if(pn){ var p=(__MIX16.getPatch? __MIX16.getPatch(i):null); var txt=(p&&p.seen?(p.name||'—'):'—'); pn.textContent=txt; pn.classList.toggle('dim', txt==='—'); }
      }); }catch(e){} }

    return { show: function(){ ensure(); win.classList.add('visible'); paint(); }, hide: function(){ ensure(); win.classList.remove('visible'); }, toggle: function(){ ensure(); win.classList.toggle('visible'); paint(); }, paint: paint, updateStripButtons:updateStripButtons };
  })();

  // Helpers to repaint
  function __paintChan(i){ try{ var row=$('#ccMix16Row'); if(row){ var chips=$('#mix16ModeChips'); if(chips) chips.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-mm')===muteMode)); }); var link=$('#mix16PanCC'); if(link) link.checked=ccPanLink; var lock=$('#mix16LockCC'); if(lock) lock.checked=ccProtect; } MixWin.updateStripButtons != null && typeof i==='number' ? MixWin.updateStripButtons(i) : MixWin.paint(); }catch(e){} }
  function __paintAll(){ try{ MixWin.paint(); }catch(e){} }
  function __paintMode(){ try{ var chips=$('#mix16ModeChips'); if(chips) chips.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-mm')===muteMode)); }); var link=$('#mix16PanCC'); if(link) link.checked=ccPanLink; var lock=$('#mix16LockCC'); if(lock) lock.checked=ccProtect; }catch(e){} }
  function __paintSM(i){ try{ if(typeof i==='number') MixWin.updateStripButtons(i); else MixWin.paint(); }catch(e){} }

  // ===== Preset logic =====
  var API='preset_api.php';
  function nowISO(){ try{ return new Date().toISOString(); }catch(e){ return ''; } }
  function currentRel(){ try{ return (window.lastPlayed && lastPlayed.rel) ? lastPlayed.rel : (window.currentSong || ''); }catch(e){ return ''; } }
  async function apiLoad(rel){ const tryUrls=(rel==='__default')?[API+'?action=loadDefault', API+'?action=load&rel=__default']:[API+'?action=load&rel='+encodeURIComponent(rel||'')]; for(const url of tryUrls){ const r=await fetch(url,{cache:'no-store'}); if(r.status===404) continue; if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); } return null; }
  async function apiSave(rel,data){ const body=JSON.stringify({ rel: rel||'__default', data: data||{} }); const r=await fetch(API+'?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body}); if(!r.ok) throw new Error('Save failed HTTP '+r.status); return await r.json(); }
  async function apiDelete(rel){ const r=await fetch(API+'?action=delete&rel='+encodeURIComponent(rel||''),{method:'POST'}); if(r.status===404) return false; if(!r.ok) throw new Error('Delete failed HTTP '+r.status); return true; }

  function buildPreset(){ const inf=__MIX16.info(); const hasVol=Array.isArray(inf.vol); const hasRev=Array.isArray(inf.rev); const hasCho=Array.isArray(inf.cho); const ch=[]; for(let i=0;i<16;i++){ ch.push({ mute:!!inf.mute[i], solo:!!inf.solo[i], pan:Math.max(0,Math.min(127,inf.pan[i]|0)), vol:Math.max(0,Math.min(127,(hasVol?inf.vol[i]:100)|0)), ...(hasRev?{rev:Math.max(0,Math.min(127,(inf.rev[i]|0)))}:{}), ...(hasCho?{cho:Math.max(0,Math.min(127,(inf.cho[i]|0)))}:{}) }); } return { version:'1.1', timestamp: nowISO(), muteMode: inf.muteMode||'cc7', ccPanLink: !!inf.ccPanLink, ccProtect: !!inf.ccProtect, channels: ch }; }
  function applyPreset(p){ if(!p||!window.__MIX16) return; try{ __MIX16.setMode({ muteMode: p.muteMode||'cc7', ccPanLink: !!p.ccPanLink, ccProtect: (typeof p.ccProtect==='boolean'? p.ccProtect : ccProtect) }); }catch(e){} const ch=Array.isArray(p.channels)?p.channels:[]; for(let i=0;i<16;i++){ const c=ch[i]||{}; try{ __MIX16.solo(i, !!c.solo);}catch(e){} try{ __MIX16.mute(i, !!c.mute);}catch(e){} if(typeof c.pan==='number') try{ __MIX16.pan(i, c.pan|0);}catch(e){} if(typeof c.vol==='number') try{ __MIX16.vol(i, c.vol|0);}catch(e){} if(typeof c.rev==='number') try{ __MIX16.rev(i, c.rev|0);}catch(e){} if(typeof c.cho==='number') try{ __MIX16.cho(i, c.cho|0);}catch(e){} } MixWin.paint(); try{ applyAll(); setTimeout(function(){ applyAll(); }, 60); }catch(e){} }

  async function loadAndApplyPresetFor(rel){ if(!rel) return; try{ const song=await apiLoad(rel); if(song){ applyPreset(song); info('Song preset applied'); return 'song'; } const def=await apiLoad('__default'); if(def){ applyPreset(def); info('Default preset applied'); return 'default'; } }catch(e){ err('Preset load failed'); console.warn(e);} return 'none'; }

  async function presetAction(act){ const rel=currentRel(); try{ if(act==='save'){ if(!rel){ info('Start playback first'); return; } await apiSave(rel, buildPreset()); ok('Preset saved for\n'+rel); } else if(act==='saveDefault'){ await apiSave('__default', buildPreset()); ok('Default preset saved'); } else if(act==='loadDefault'){ const d=await apiLoad('__default'); if(!d){ info('No default preset'); return; } applyPreset(d); ok('Default preset loaded'); } else if(act==='delete'){ if(!rel){ info('No song to delete preset for'); return; } const done=await apiDelete(rel); done? ok('Preset deleted') : info('No preset for this song'); } }catch(ex){ err('Preset action failed'); console.warn(ex); } }

  // ===== Presets window =====
  var PresetWin = (function(){ var win, head, body, ready=false; var KEY='wm:mixPreset'; function ensure(){ if(ready) return true; win=$('#mixPresetPanel'); if(!win){ win=document.createElement('section'); win.className='panel win'; win.id='mixPresetPanel'; win.style.left='44px'; win.style.top='120px'; win.style.width='420px'; win.innerHTML='<h4 class="drag"><span>Presets</span><span class="wm-chrome"><button class="wm-btn" id="mixPreMin">—</button><button class="wm-btn" id="mixPreMax">▢</button></span><span><button class="close" data-close="mixPreset">×</button></span></h4><div class="list" id="mixPresetList"></div><div class="wm-grip" aria-hidden="true"></div>'; document.body.appendChild(win);} head=win.querySelector('.drag'); body=$('#mixPresetList'); if(!body.dataset.built){ var html = '<div class="row"><span class="label">Song</span><span class="small" id="preSongRel" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"></span></div>' + '<div class="row"><button class="small" data-act="save">Save (song)</button><button class="small" data-act="saveDefault">Save as Default</button><button class="small" data-act="loadDefault">Load Default</button><button class="small" data-act="delete">Delete Preset</button></div>' + '<div class="row"><span class="small">Tip: Adjust in Mixer (Pan/Vol/Rev/Cho), then Save here.</span></div>'; body.innerHTML=html; body.dataset.built='1'; body.addEventListener('click', async function(e){ var b=e.target.closest('button[data-act]'); if(!b) return; await presetAction(b.getAttribute('data-act')); refresh(); }); } if(!win.dataset.bound){ function rect(){ return win.getBoundingClientRect(); } function save(){ try{ var r=rect(); localStorage.setItem(KEY, JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height})); }catch(e){} } try{ var st=JSON.parse(localStorage.getItem(KEY)||'null'); if(st){ win.style.left=st.left+'px'; win.style.top=st.top+'px'; if(st.width) win.style.width=st.width+'px'; if(st.height) win.style.height=st.height+'px'; } }catch(e){} head.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY, ox=sx-r.left, oy=sy-r.top; function mv(ev){ var x=ev.clientX, y=ev.clientY; var L=Math.max(0, Math.min(innerWidth-r.width, x-ox)); var T=Math.max(0, Math.min(innerHeight-r.height, y-oy)); win.style.left=L+'px'; win.style.top=T+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); var grip=win.querySelector('.wm-grip'); grip.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY; function mv(ev){ var w=Math.max(360, r.width + (ev.clientX - sx)); var h=Math.max(200, r.height + (ev.clientY - sy)); win.style.width=w+'px'; win.style.height=h+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); $('#mixPreMin').addEventListener('click', function(){ win.classList.toggle('minimized'); save(); }); $('#mixPreMax').addEventListener('click', function(){ if(win.classList.contains('maximized')){ win.classList.remove('maximized'); } else { win.classList.remove('minimized'); win.classList.add('maximized'); } save(); }); document.addEventListener('click', function(e){ var btn=e.target && e.target.closest && e.target.closest('button.close[data-close="mixPreset"]'); if(btn){ e.stopPropagation(); win.classList.remove('visible'); } }, true); win.dataset.bound='1'; } ready=true; return true; } function refresh(){ try{ var el=$('#preSongRel'); if(el) el.textContent = currentRel() || '(no song)'; }catch(e){} } return { show: function(){ ensure(); refresh(); win.classList.add('visible'); }, hide: function(){ ensure(); win.classList.remove('visible'); }, toggle: function(){ ensure(); refresh(); win.classList.toggle('visible'); } }; })();

  // ===== Self-Test window (with status strip + quick toggles) =====
  var SelfTestWin = (function(){ var win, head, body, ready=false; var KEY='wm:mixSelfTest'; function ensure(){ if(ready) return true; win=$('#mixSelfTest'); if(!win){ win=document.createElement('section'); win.className='panel win'; win.id='mixSelfTest'; win.style.left='86px'; win.style.top='130px'; win.style.width='560px'; win.innerHTML='<h4 class="drag"><span>Mixer Self-Test</span><span class="wm-chrome"><button class="wm-btn" id="mixSTMin">—</button><button class="wm-btn" id="mixSTMax">▢</button></span><span><button class="close" data-close="mixSelfTest">×</button></span></h4><div class="list" id="mixSelfBody"></div><div class="wm-grip" aria-hidden="true"></div>'; document.body.appendChild(win);} head=win.querySelector('.drag'); body=$('#mixSelfBody'); if(!body.dataset.built){ var html='<style>#mixSelfTest .stline{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}#mixSelfTest .st{font:11px/1.2 system-ui;color:#cfe3ff;background:rgba(28,42,54,.55);border:1px solid rgba(255,255,255,.12);padding:4px 6px;border-radius:6px}#mixSelfTest .st.bad{background:rgba(62,22,22,.45);border-color:#a55}#mixSelfTest .chips>.small{margin-right:4px}</style>' + '<div class="row"><div id="mixSTStatus" class="stline"></div></div>' + '<div class="row" id="mixSTToggles"><span class="small" style="margin-right:6px">Mute:</span><div class="chips" id="mixSTMuteChips"><button class="small" data-mm="gate">Gate</button><button class="small" data-mm="cc7">CC7</button><button class="small" data-mm="cc11">CC11</button></div><label class="small" style="margin-left:8px"><input type="checkbox" id="mixSTLockCC"> Lock CC7/10/11/91/93</label><label class="small" style="margin-left:8px"><input type="checkbox" id="mixSTPanCC"> Pan→CC10</label><label class="small" style="margin-left:8px"><input type="checkbox" id="mixSTVisualSync"> Visual Sync (A‑Sync)</label></div>' + '<div class="row"><div class="small">Diagnostics: checks if the mixer can reach your synth/transport and if incoming MIDI goes through the Mix16 filter.</div></div>' + '<div class="row"><button class="small" id="mixRunST">Run Self-Test</button><button class="small" id="mixAudiblePan">Audible Pan Test</button><button class="small" id="mixPatchMIDI">Patch WebMIDI</button><button class="small" id="mixPanic">Panic</button></div>' + '<pre id="mixSTLog" style="max-height:220px;overflow:auto;background:rgba(10,14,18,.55);padding:8px;border-radius:6px;color:#cfe3ff"></pre>'; body.innerHTML=html; body.dataset.built='1'; body.addEventListener('click', async function(e){ var id=(e.target&&e.target.id)||''; if(id==='mixRunST'){ runSelfTest(); } else if(id==='mixAudiblePan'){ audiblePan(); } else if(id==='mixPatchMIDI'){ var r=await __MIX16.patchWebMIDI(); log('patchWebMIDI: '+JSON.stringify(r)); if(r.ok) ok('WebMIDI patched'); else info(r.reason||'No WebMIDI'); refreshStatus(); } else if(id==='mixPanic'){ __MIX16.panic(); } }); body.addEventListener('click', function(e){ var b=e.target.closest('#mixSTMuteChips .small'); if(!b) return; var mm=b.getAttribute('data-mm'); __MIX16.setMode({ muteMode:mm }); refreshStatus(); }); body.addEventListener('change', function(e){ if(e.target && e.target.id==='mixSTLockCC'){ __MIX16.setMode({ ccProtect: !!e.target.checked }); refreshStatus(); } if(e.target && e.target.id==='mixSTPanCC'){ __MIX16.setMode({ ccPanLink: !!e.target.checked }); refreshStatus(); } if(e.target && e.target.id==='mixSTVisualSync'){ __MIX16.setMode({ apVisualSync: !!e.target.checked }); refreshStatus(); } }); } if(!win.dataset.bound){ function rect(){ return win.getBoundingClientRect(); } function save(){ try{ var r=rect(); localStorage.setItem(KEY, JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height})); }catch(e){} } try{ var st=JSON.parse(localStorage.getItem(KEY)||'null'); if(st){ win.style.left=st.left+'px'; win.style.top=st.top+'px'; if(st.width) win.style.width=st.width+'px'; if(st.height) win.style.height=st.height+'px'; } }catch(e){} head.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY, ox=sx-r.left, oy=sy-r.top; function mv(ev){ var x=ev.clientX, y=ev.clientY; var L=Math.max(0, Math.min(innerWidth-r.width, x-ox)); var T=Math.max(0, Math.min(innerHeight-r.height, y-oy)); win.style.left=L+'px'; win.style.top=T+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); var grip=win.querySelector('.wm-grip'); grip.addEventListener('mousedown', function(e){ if(win.classList.contains('maximized')) return; var r=rect(); var sx=e.clientX, sy=e.clientY; function mv(ev){ var w=Math.max(420, r.width + (ev.clientX - sx)); var h=Math.max(260, r.height + (ev.clientY - sy)); win.style.width=w+'px'; win.style.height=h+'px'; } function up(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); save(); } document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }); $('#mixSTMin').addEventListener('click', function(){ win.classList.toggle('minimized'); save(); }); $('#mixSTMax').addEventListener('click', function(){ if(win.classList.contains('maximized')){ win.classList.remove('maximized'); } else { win.classList.remove('minimized'); win.classList.add('maximized'); } save(); }); document.addEventListener('click', function(e){ var btn=e.target && e.target.closest && e.target.closest('button.close[data-close="mixSelfTest"]'); if(btn){ e.stopPropagation(); win.classList.remove('visible'); } }, true); win.dataset.bound='1'; } ready=true; return true; } function log(s){ try{ var el=$('#mixSTLog'); if(el){ el.textContent += (s+'\n'); el.scrollTop=el.scrollHeight; } console.log('[MIX16/ST]', s); }catch(e){} } function runSelfTest(){ try{ var inf=__MIX16.info(); log('==== Self-Test @'+(new Date().toISOString())); log('hasSynthMC='+inf.hasSynthMC+', senderWrapped='+inf.senderWrapped+', webmidiPatched='+(inf.webmidiPatched?'true':'false')+', ccProtect='+(inf.ccProtect?'on':'off')+', ccPanLink='+(inf.ccPanLink?'on':'off')+', muteMode='+inf.muteMode); var s1=sendCC(0,10,0), s2=sendCC(0,10,127), s3=sendCC(0,10,64); var immediate=(s1||s2||s3); log('sendCC immediateDelivered='+(immediate?'yes':'no (queued)')); setTimeout(function(){ sendCC(0,10,64); },120); setTimeout(function(){ sendCC(0,10,64); },600); log('Tip: If no audible pan wobble, patch pipeline (wrapSender/filter/WebMIDI).'); refreshStatus(); }catch(e){ log('Error: '+(e&&e.message)); } } function audiblePan(){ try{ log('Audible pan test: L→R→Center on CH1'); sendCC(0,10,0); setTimeout(function(){ sendCC(0,10,127); },260); setTimeout(function(){ sendCC(0,10,64); },520); }catch(e){ log('Error: '+(e&&e.message)); } } function refreshStatus(){ try{ var inf=__MIX16.info(); var el=$('#mixSTStatus'); if(!el) return; function badge(label, ok){ return '<span class="st'+(ok?'':' bad')+'">'+label+': '+(ok?'ON/OK':'OFF')+'</span>'; } el.innerHTML = badge('SynthMC',!!inf.hasSynthMC)+badge('SenderWrapped',!!inf.senderWrapped)+badge('WebMIDI',!!inf.webmidiPatched)+'<span class="st">MuteMode: '+String(inf.muteMode||'')+'</span>'+badge('CC-Protect',!!inf.ccProtect)+badge('Pan→CC10',!!inf.ccPanLink)+badge('A‑Sync',!!inf.apVisualSync); var lock=$('#mixSTLockCC'); if(lock) lock.checked=!!inf.ccProtect; var panC=$('#mixSTPanCC'); if(panC) panC.checked=!!inf.ccPanLink; var vs=$('#mixSTVisualSync'); if(vs) vs.checked=!!inf.apVisualSync; var chips=$('#mixSTMuteChips'); if(chips) chips.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-mm')===(inf.muteMode||'')); }); }catch(e){} } return { show: function(){ ensure(); refreshStatus(); win.classList.add('visible'); }, hide: function(){ ensure(); win.classList.remove('visible'); }, toggle: function(){ ensure(); refreshStatus(); win.classList.toggle('visible'); } }; })();

  // Micro-dock entries
  function addToMicroDock(){ var menu=$('#mdPanelMenu'); if(!menu) return; if(!menu.querySelector('[data-open="mixPreset"]')){ var b=document.createElement('button'); b.className='md-item'; b.setAttribute('data-open','mixPreset'); b.textContent='Presets'; menu.appendChild(b); } if(!menu.querySelector('[data-open="mixSelfTest"]')){ var c=document.createElement('button'); c.className='md-item'; c.setAttribute('data-open','mixSelfTest'); c.textContent='Self-Test'; menu.appendChild(c); } menu.addEventListener('click', function(e){ var t=e.target.closest('[data-open]'); if(!t) return; if(t.getAttribute('data-open')==='mixPreset') PresetWin.show(); else if(t.getAttribute('data-open')==='mixSelfTest') SelfTestWin.show(); }); }

  // Inject CC row + add to micro-dock
  onReady(function(){ var cc=$('#ccPanel'); if(cc){ injectCCRow(); } else { var t=setInterval(function(){ if($('#ccPanel')){ clearInterval(t); injectCCRow(); } }, 400); } addToMicroDock(); apEnsure(); });

  // ===== Integrated Patch Watch + Labels + Refresh API =====
  (function(){ if(!window.__MIX16) return; var _pw = window.__MIX16.__patchWatch = window.__MIX16.__patchWatch || { prog:new Array(16).fill(0), msb:new Array(16).fill(0), lsb:new Array(16).fill(0), seen:new Array(16).fill(false), drumCh:new Set([9]) };
    var GM_NAMES = {0:"Acoustic Grand Piano",1:"Bright Acoustic Piano",2:"Electric Grand Piano",3:"Honky-Tonk Piano",4:"Electric Piano 1",5:"Electric Piano 2",6:"Harpsichord",7:"Clavi",8:"Celesta",9:"Glockenspiel",10:"Music Box",11:"Vibraphone",12:"Marimba",13:"Xylophone",14:"Tubular Bells",15:"Dulcimer",16:"Drawbar Organ",17:"Percussive Organ",18:"Rock Organ",19:"Church Organ",20:"Reed Organ",21:"Accordion",22:"Harmonica",23:"Tango Accordion",24:"Acoustic Guitar (nylon)",25:"Acoustic Guitar (steel)",26:"Electric Guitar (jazz)",27:"Electric Guitar (clean)",28:"Electric Guitar (muted)",29:"Overdriven Guitar",30:"Distortion Guitar",31:"Guitar Harmonics",32:"Acoustic Bass",33:"Electric Bass (finger)",34:"Electric Bass (pick)",35:"Fretless Bass",36:"Slap Bass 1",37:"Slap Bass 2",38:"Synth Bass 1",39:"Synth Bass 2",40:"Violin",41:"Viola",42:"Cello",43:"Contrabass",44:"Tremolo Strings",45:"Pizzicato Strings",46:"Orchestral Harp",47:"Timpani",48:"String Ensemble 1",49:"String Ensemble 2",50:"SynthStrings 1",51:"SynthStrings 2",52:"Choir Aahs",53:"Voice Oohs",54:"Synth Voice",55:"Orchestra Hit",56:"Trumpet",57:"Trombone",58:"Tuba",59:"Muted Trumpet",60:"French Horn",61:"Brass Section",62:"SynthBrass 1",63:"SynthBrass 2",64:"Soprano Sax",65:"Alto Sax",66:"Tenor Sax",67:"Baritone Sax",68:"Oboe",69:"English Horn",70:"Bassoon",71:"Clarinet",72:"Piccolo",73:"Flute",74:"Recorder",75:"Pan Flute",76:"Blown Bottle",77:"Shakuhachi",78:"Whistle",79:"Ocarina",80:"Lead 1 (square)",81:"Lead 2 (sawtooth)",82:"Lead 3 (calliope)",83:"Lead 4 (chiff)",84:"Lead 5 (charang)",85:"Lead 6 (voice)",86:"Lead 7 (fifths)",87:"Lead 8 (bass+lead)",88:"Pad 1 (new age)",89:"Pad 2 (warm)",90:"Pad 3 (polysynth)",91:"Pad 4 (choir)",92:"Pad 5 (bowed)",93:"Pad 6 (metallic)",94:"Pad 7 (halo)",95:"Pad 8 (sweep)",96:"FX 1 (rain)",97:"FX 2 (soundtrack)",98:"FX 3 (crystal)",99:"FX 4 (atmosphere)",100:"FX 5 (brightness)",101:"FX 6 (goblins)",102:"FX 7 (echoes)",103:"FX 8 (sci-fi)",104:"Sitar",105:"Banjo",106:"Shamisen",107:"Koto",108:"Kalimba",109:"Bagpipe",110:"Fiddle",111:"Shanai",112:"Tinkle Bell",113:"Agogo",114:"Steel Drums",115:"Woodblock",116:"Taiko Drum",117:"Melodic Tom",118:"Synth Drum",119:"Reverse Cymbal",120:"Guitar Fret Noise",121:"Breath Noise",122:"Seashore",123:"Bird Tweet",124:"Telephone Ring",125:"Helicopter",126:"Applause",127:"Gunshot" };
    function isDrumCh(ch){ return _pw.drumCh.has((ch|0)); }
function resolvePatchName(msb, lsb, pc, ch){
  try{
    if(window.SimpleMapperCatalog && typeof SimpleMapperCatalog.resolveName==='function'){
      var n=SimpleMapperCatalog.resolveName(msb|0, lsb|0, pc|0, {channel:ch});
      if(n) return n;
    }
  }catch(_){}
  // Fallback if mapper not present
  if(ch===9) return (pc|0)===0?'Standard Kit':'Drum Kit #'+((pc|0)+1);
  return 'Program #'+((pc|0)+1);
}
    function gmProgName(pc){ pc=(pc|0)&0x7F; return GM_NAMES.hasOwnProperty(pc)? GM_NAMES[pc] : ('Program #' + (pc+1)); }
    function gmDrumKitName(pc){ pc=(pc|0)&0x7F; return (pc===0? 'Standard Kit' : ('Drum Kit #'+(pc+1))); }
    function captureBank(ch,cc,val){ if(cc===0) _pw.msb[ch]=(val|0)&0x7F; else if(cc===32) _pw.lsb[ch]=(val|0)&0x7F; }
    function capturePC(ch,val){ _pw.prog[ch]=(val|0)&0x7F; _pw.seen[ch]=true; }
    function paintPatchLabel(ch){ try{ var pn=document.querySelector('#mix16Panel .strip[data-i="'+ch+'"] .pname'); if(pn){ var p=__MIX16.getPatch(ch); var txt=(p&&p.seen?(p.name||'—'):'—'); pn.textContent=txt; pn.classList.toggle('dim', txt==='—'); } }catch(e){} }

    if(typeof __MIX16.getPatch!=='function'){
      __MIX16.getPatch=function(ch){ ch|=0; if(ch<0||ch>15) return null; var drum=isDrumCh(ch); var pc=_pw.prog[ch]|0; var msb=_pw.msb[ch]|0; var lsb=_pw.lsb[ch]|0; var name = resolvePatchName(msb, lsb, pc, ch) || (drum ? gmDrumKitName(pc) : 'Program #' + (pc + 1)); return { channel:ch, isDrum:drum, program:pc, bankMSB:msb, bankLSB:lsb, name:name, seen:!!_pw.seen[ch] }; };
      __MIX16.patchInfo=function(){ var a=[]; for(var i=0;i<16;i++){ a.push(__MIX16.getPatch(i)); } return a; };
      __MIX16.setDrumChannels=function(arr){ try{ _pw.drumCh.clear(); (arr||[]).forEach(function(v){ var n=(v|0); if(n>=0&&n<16) _pw.drumCh.add(n); }); }catch(e){} };
      __MIX16.getDrumChannels=function(){ return Array.from(_pw.drumCh.values()).sort(function(a,b){return a-b;}); };
    }

    // Auto/Manual refresh API
    __MIX16.refreshNames = function(opts){ try{ var fallback = !!(opts && opts.fallback); for(var i=0;i<16;i++){ var p=__MIX16.getPatch(i); if(!p.seen && fallback){ // assume GM default if sequence didn’t send PC
            _pw.prog[i] = 0; _pw.seen[i] = true;
          }
          paintPatchLabel(i);
        }
        return true; }catch(e){ return false; } };

    if(!__MIX16.filter.__mix16IntegratedPW){ var _origF=__MIX16.filter; __MIX16.filter=function(bytes){ var changed=-1; try{ if(bytes&&bytes.length>=2){ var s=bytes[0],hi=s&0xF0,ch=s&0x0F; if(hi===0xB0&&bytes.length>=3){ var cc=bytes[1]&0x7F,v=bytes[2]&0x7F; if(cc===0||cc===32){ captureBank(ch,cc,v); changed=ch; } } else if(hi===0xC0){ capturePC(ch, bytes[1]&0x7F); changed=ch; } } }catch(e){} var out=_origF?_origF(bytes):bytes; if(changed>=0){ paintPatchLabel(changed); } return out; }; __MIX16.filter.__mix16IntegratedPW=true; }
    if(!__MIX16.wrapSender.__mix16IntegratedPW){ var _origWS=__MIX16.wrapSender; __MIX16.wrapSender=function(fn){ var send=_origWS(fn); return function(bytes){ if(bytes&&bytes.length>=2){ var s=bytes[0],hi=s&0xF0,ch=s&0x0F; if(hi===0xB0&&bytes.length>=3){ var cc=bytes[1]&0x7F,v=bytes[2]&0x7F; if(cc===0||cc===32){ captureBank(ch,cc,v); } } else if(hi===0xC0){ capturePC(ch, bytes[1]&0x7F); } } return send(bytes); } }; __MIX16.wrapSender.__mix16IntegratedPW=true; }
  })();

})();
