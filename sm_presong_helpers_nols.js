/*!
 * sm_presong_helpers_nols.js (no-localStorage)
 * - Derives SM_SONG_ID from the currently playing <audio> (base filename)
 * - Hooks SimpleMapper.apply(...) to keep an in-memory channels snapshot: window.SM_CHANNELS
 * - Provides SongPreset.{saveToServer, loadFromServer, applyPresetMap} without touching localStorage
 * 2025-09-28
 */
(function(global){
  // ---------- utils ----------
  function slug(s){ return String(s||'').normalize('NFKD').replace(/[^\w.\-]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'unknown'; }
  function clamp(v,a,b){ v=+v||0; return Math.max(a, Math.min(b, v)); }
  function fileBase(url){ try{ var u=new URL(url, location.href); var name=(u.pathname.split('/').pop()||''); return name.replace(/\.[^.]+$/, ''); }catch(_){ return ''; } }

  // ---------- SM_SONG_ID from current audio ----------
  function currentMediaURL(){ var a=document.querySelector('audio#player, audio#audio, audio'); return a? (a.currentSrc || a.src || (a.querySelector('source')&&a.querySelector('source').src) || '') : ''; }
  function setSongIdFromPlaying(){ var base = fileBase(currentMediaURL()) || fileBase(location.pathname) || (document.title||'').replace(/[:|—–-].*$/, ''); global.SM_SONG_ID = slug(base); }
  setSongIdFromPlaying();
  var a=document.querySelector('audio#player, audio#audio, audio'); if(a){ ['loadedmetadata','play','emptied'].forEach(function(ev){ a.addEventListener(ev, setSongIdFromPlaying); }); }
  global.SM_setSongURL = function(url){ global.SM_SONG_ID = slug(fileBase(url)); };

  // ---------- In-memory channels snapshot (no localStorage) ----------
  global.SM_CHANNELS = global.SM_CHANNELS || {};
  function installApplyHook(){
    if(!global.SimpleMapper || !SimpleMapper.apply || global.__SM_CH_HOOK__) return; global.__SM_CH_HOOK__=true;
    var orig = SimpleMapper.apply;
    SimpleMapper.apply = function(opts){
      try{
        var ch = clamp((opts&&opts.channel)||1, 1, 16);
        var msb= clamp(opts&&opts.bankMSB, 0, 127);
        var lsb= clamp(opts&&opts.bankLSB, 0, 127);
        var pg = clamp(opts&&opts.program, 0, 127);
        global.SM_CHANNELS[ch] = { msb:msb, lsb:lsb, pg:pg };
      }catch(e){}
      try{
        var r=orig.call(SimpleMapper, opts);
        if(r && typeof r.then==='function') return r.then(function(v){return v;});
        return r;
      }catch(err){ console.warn('SM apply hook error',err); return false; }
    };
  }
  if(document.readyState!=='loading') installApplyHook(); else document.addEventListener('DOMContentLoaded', installApplyHook, {once:true});

  // ---------- Server client (per-song only) ----------
  async function saveToServer(apiUrl, songId){
    songId = songId || global.SM_SONG_ID || 'unknown';
    var channels = global.SM_CHANNELS || {};
    if(!Object.keys(channels).length) throw new Error('No channels to save');
    var res = await fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:songId, channels:channels }) });
    var j = await res.json(); if(!j.ok) throw new Error(j.error||('HTTP '+res.status)); return j;
  }
  async function loadFromServer(apiUrl, songId){
    songId = songId || global.SM_SONG_ID || 'unknown';
    var res = await fetch(apiUrl + '?id=' + encodeURIComponent(songId)); if(!res.ok) return null; var j=await res.json(); return j.ok? j.data: null;
  }
  async function applyPresetMap(chmap){
    if(!chmap) return false;
    for(var c=1;c<=16;c++){
      var r=chmap[c]; if(!r) continue;
      await SimpleMapperCatalog.applyWithRetry({ channel:c, bankMSB:r.msb|0, bankLSB:r.lsb|0, program:r.pg|0 });
      global.SM_CHANNELS[c] = { msb:r.msb|0, lsb:r.lsb|0, pg:r.pg|0 }; // sync memory with server state
    }
    return true;
  }

  global.SongPreset = { saveToServer: saveToServer, loadFromServer: loadFromServer, applyPresetMap: applyPresetMap };
})(window);