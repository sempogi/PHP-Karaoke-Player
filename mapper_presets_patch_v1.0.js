
// mapper_presets_mapperpanel_v1.0.5.js
// Generated: 2025-09-28 GMT+08
// Purpose: Map Preset buttons INSIDE Mapper (#smPanel) + Robust AUTOLOAD
// Changes v1.0.5:
//  - Autoload now waits for: songId availability + SimpleMapper readiness
//  - Throttled to avoid double-run; retries with backoff for late songId/setStatus
//  - Works with either setStatus('PLAYING') or <audio id="player"> 'play'
// Server:  /api/song_preset_merge.php (MERGE per channel)

(function(){
  var MAP_API = (window.SM_PRESET_API || '/api/song_preset_merge.php');

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function clamp(v,a,b){ v=(v|0); return Math.max(a, Math.min(b,v)); }

  // Toast reuse (silent if no dock)
  function _toast(msg, type){ try{ var dock=document.getElementById('mixToastDock'); if(!dock) return; var el=document.createElement('div'); el.className='mixToast '+(type||'ok'); el.innerHTML='<span class="t-msg"></span>'; el.querySelector('.t-msg').textContent=String(msg||''); dock.appendChild(el); requestAnimationFrame(()=>el.classList.add('show')); setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 200); }, 1200);}catch(e){} }
  var ok=(m)=>_toast(m,'ok'), info=(m)=>_toast(m,'info'), err=(m)=>_toast(m,'err');

  // Song ID: prefer mixer rel/currentSong, then <audio>, then SM_SONG_ID, then title
  function baseName(s){ s=String(s||''); s=s.split('?')[0]; s=s.split('#')[0]; var last=(s.split('/').pop()||''); return last.replace(/\.[^.]+$/, ''); }
  function songId(){
    try{ var rel=(window.lastPlayed && lastPlayed.rel) ? lastPlayed.rel : (window.currentSong || ''); if(rel){ var b=baseName(rel); if(b) return b; } }catch(e){}
    try{ var a=document.getElementById('player') || document.querySelector('audio'); var src=a?(a.currentSrc||a.src||(a.querySelector('source')&&a.querySelector('source').src)||''):''; var b2=baseName(src); if(b2) return b2; }catch(e){}
    if(window.SM_SONG_ID && String(window.SM_SONG_ID).trim()) return String(window.SM_SONG_ID).trim();
    return (document.title||'unknown').replace(/[:|—–-].*$/,'') || 'unknown';
  }

  // API
  async function apiLoad(id){ var r=await fetch(MAP_API+'?id='+encodeURIComponent(id),{cache:'no-store'}); if(r.status===404) return null; if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  async function apiSaveCH(id,ch,msb,lsb,pg){ var body={ id:id, channels:{} }; body.channels[String(ch|0)]={ msb:msb|0, lsb:lsb|0, pg:pg|0 }; var r=await fetch(MAP_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }

  // Apply
  function mapperReady(){ return !!( (window.SimpleMapperCatalog && typeof SimpleMapperCatalog.applyWithRetry==='function') || (window.SimpleMapper && typeof SimpleMapper.apply==='function') ); }
  async function applyOne(ch,msb,lsb,pg){
    try{
      if(window.SimpleMapperCatalog && typeof SimpleMapperCatalog.applyWithRetry==='function'){
        await SimpleMapperCatalog.applyWithRetry({ channel:ch, bankMSB:msb, bankLSB:lsb, program:pg }); return;
      }
      if(window.SimpleMapper && typeof SimpleMapper.apply==='function'){
        var r=SimpleMapper.apply({ channel:ch, bankMSB:msb, bankLSB:lsb, program:pg }); if(r&&typeof r.then==='function') await r; return;
      }
    }catch(e){}
  }
  async function applyAll(map){ if(!map||!map.channels) return; for(var c=1;c<=16;c++){ var r=map.channels[c]||map.channels[String(c)]; if(!r) continue; await applyOne(c,r.msb|0,r.lsb|0,r.pg|0);} }

  // Read current Mapper fields
  function readCurrentCH(){
    var ch  = clamp(parseInt((document.getElementById('smChan')||{}).value||'0',10), 1, 16);
    var msb = clamp(parseInt((document.getElementById('smMSB')||{}).value||'0',10), 0, 127);
    var lsb = clamp(parseInt((document.getElementById('smLSB')||{}).value||'0',10), 0, 127);
    var pg  = clamp(parseInt((document.getElementById('smProg')||{}).value||'0',10), 0, 127);
    return { ch:ch, msb:msb, lsb:lsb, pg:pg };
  }

  // Inject buttons INSIDE #smPanel
  function ensureButtons(){
    var panel = document.getElementById('smPanel'); if(!panel) return false;
    if (document.getElementById('smMapPresetRow')) return true;
    var host = panel.querySelector('.list') || panel;
    var row = document.createElement('div'); row.className='row'; row.id='smMapPresetRow'; row.style.gap='8px';
    row.innerHTML = '<span class="label">Map Preset</span>'+
                    '<button id="smMpSave" class="small" title="Save Current Channel">Save (CH)</button>'+
                    '<button id="smMpLoad" class="small" title="Load All Channels">Load (All)</button>';
    host.appendChild(row);

    document.getElementById('smMpSave').addEventListener('click', async function(){
      try{ var id=songId(); var cur=readCurrentCH(); await apiSaveCH(id,cur.ch,cur.msb,cur.lsb,cur.pg); ok('Saved CH '+cur.ch+' • '+id); }
      catch(e){ err('Save failed'); }
    });
    document.getElementById('smMpLoad').addEventListener('click', async function(){
      try{ var id=songId(); var j=await apiLoad(id); if(!j||!j.ok||!j.data){ info('No preset for '+id); return; } await applyAll(j.data); ok('Applied • '+id); }
      catch(e){ err('Load failed'); }
    });
    return true;
  }

  function watchPanel(){ if (ensureButtons()) return; try{ var mo=new MutationObserver(function(){ if(ensureButtons()){ try{mo.disconnect();}catch(e){} } }); mo.observe(document.documentElement||document.body,{childList:true,subtree:true}); }catch(e){} }

  // Robust AUTOLOAD
  var __autoLock=false, __lastId='', __lastTs=0;
  function scheduleAutoload(tag){
    if (__autoLock) return; __autoLock=true; var tries=0;
    (function step(){
      tries++;
      var id = songId();
      var now = Date.now();
      // Avoid immediate double-run (same song within 1s)
      if (id && id===__lastId && (now-__lastTs)<1000){ __autoLock=false; return; }
      if (!id || !mapperReady()) { if (tries<20) return setTimeout(step, 120); __autoLock=false; return; }
      apiLoad(id).then(function(j){
        if (j && j.ok && j.data && j.data.channels){ return applyAll(j.data).then(function(){ ok('Auto • '+id); __lastId=id; __lastTs=Date.now(); }); }
      }).catch(function(){ /*silent*/ }).finally(function(){ setTimeout(function(){ __autoLock=false; }, 200); });
    })();
  }

  function hookPlay(){ var a=document.getElementById('player') || document.querySelector('audio'); if(a){ a.addEventListener('play', function(){ scheduleAutoload('play'); }, { passive:true }); } }
  function hookSetStatus(){ if (typeof window.setStatus !== 'function') return; var _orig=window.setStatus; window.setStatus=function(msg){ try{ _orig && _orig(msg); }catch(e){} if (msg==='PLAYING') scheduleAutoload('status'); } }

  onReady(function(){ watchPanel(); hookPlay(); hookSetStatus(); });
})();
