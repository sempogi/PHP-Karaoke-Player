/* khd_infowin_20251013_v2.2b_mapperJ_catalog_fixA_plus_full_meta_hotfix1a.js — Sem | 2025-10-13
 * HOTFIX 1a: Adds missing Manual tab content. ES5-safe, manual-only, FULL+META.
 */
(function(){
  if (window.__INFOWIN_V22B_FIXA_FULL_META_HOTFIX1A__) return;
  window.__INFOWIN_V22B_FIXA_FULL_META_HOTFIX1A__ = true;

  /* ----- Utils (ES5) ----- */
  function esc(s){ s=(s==null?'':String(s)); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }
  function fmtBytes(n){ if(!(isFinite(n)&&n>0)) return '—'; var u=['B','KB','MB','GB']; var i=0; while(n>=1024 && i<u.length-1){ n/=1024; i++; } return (i===0? Math.round(n): n.toFixed(2))+' '+u[i]; }
  function fmtSecs(s){ if(!(isFinite(s)&&s>=0)) return '—'; var m=Math.floor(s/60), sec=Math.floor(s%60); return (('0'+m).slice(-2))+':'+(('0'+sec).slice(-2)); }
  function nowTS(){ try{ return new Date().toLocaleString(); }catch(_){ return ''+new Date(); } }
  function setInfoStatus(msg){ var s=document.getElementById('infoStatus'); if (s) s.textContent = msg || ''; }
  function rowKV(k,v){ return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+(v==null?'':String(v))+'</span></div>'; }

  /* ----- Console capture ----- */
  if (!window.__LOGBUF){
    var LOGBUF=[];
    function toText(args){ try{ return Array.prototype.map.call(args, function(x){ try{ return (typeof x==='string')? x : JSON.stringify(x); }catch(_){ return String(x); } }).join(' ');}catch(_){ return ''; } }
    ['log','info','warn','error'].forEach(function(level){ var orig=console[level]; console[level]=function(){ try{ LOGBUF.push({ t:Date.now(), level:level, msg:toText(arguments) }); if (LOGBUF.length>2000) LOGBUF.splice(0, LOGBUF.length-2000);}catch(_){} try{ return orig.apply(console, arguments);}catch(_){} }; });
    window.__LOGBUF=LOGBUF;
  }
  var LOGBUF=window.__LOGBUF;

  /* ----- MIDI helpers ----- */
  function midiDurationSeconds(ab){ try{ if (!ab || typeof MIDIFile !== 'function') return null; var mf=new MIDIFile(ab); var evs=(mf.getMidiEvents? mf.getMidiEvents(): (mf.getEvents? mf.getEvents(): []))||[]; var max=0; for (var i=0;i<evs.length;i++){ var p=evs[i] && evs[i].playTime; if (typeof p==='number' && p>max) max=p; } return max? (max/1000): null; }catch(_){ return null; } }
  function extractMIDIMeta(ab){ var meta={ header:{ppqn:null}, tempos:[], timesigs:[], keysigs:[], trackNames:[], copyright:[], markers:[], cuePoints:[], texts:[] };
    try{ if (!ab || typeof MIDIFile !== 'function') return meta; var mf=new MIDIFile(ab);
      try{ if (mf.header && mf.header.getTicksPerBeat) meta.header.ppqn = mf.header.getTicksPerBeat(); }catch(_){ }
      try{ var te=(mf.getTempoEvents? mf.getTempoEvents(): [])||[]; for (var i=0;i<te.length;i++){ var e=te[i]; var bpm= (e && e.bpm!=null)? e.bpm : (e && e.tempo? 60000000/e.tempo : null); if (bpm) meta.tempos.push({ bpm: Math.round(bpm*100)/100, playTime: ((e && e.playTime)||0)/1000 }); } }catch(_){ }
      try{ var ts=(mf.getTimeSignatureEvents? mf.getTimeSignatureEvents(): [])||[]; for (var j=0;j<ts.length;j++){ var e2=ts[j]; var num=(e2 && e2.timeSignature && e2.timeSignature[0]!=null)? e2.timeSignature[0] : (e2 && e2.param1!=null? e2.param1 : null); var denPow=(e2 && e2.timeSignature && e2.timeSignature[1]!=null)? e2.timeSignature[1] : (e2 && e2.param2!=null? e2.param2 : null); var den=(denPow!=null)? (1<<denPow) : null; meta.timesigs.push({ num:num, den:den, playTime: ((e2 && e2.playTime)||0)/1000 }); } }catch(_){ }
      var evs=(mf.getMidiEvents? mf.getMidiEvents(): (mf.getEvents? mf.getEvents(): []))||[];
      for (var k=0;k<evs.length;k++){
        var e3=evs[k]||{}; var st=e3.subtype; var txt=(typeof e3.text==='string')? e3.text.trim(): null; var pt=((e3 && e3.playTime)||0)/1000;
        if (st==='trackName' && txt) meta.trackNames.push(txt);
        else if ((st==='text'||st==='lyrics') && txt) meta.texts.push(txt);
        else if (st==='copyrightNotice' && txt) meta.copyright.push(txt);
        else if (st==='marker' && txt) meta.markers.push(txt);
        else if (st==='cuePoint' && txt) meta.cuePoints.push(txt);
        else if (st==='keySignature'){
          var sf=(e3.scale!=null? e3.scale: (e3.key!=null? e3.key: (e3.param1!=null? e3.param1: 0)));
          var mi=(e3.minor!=null? e3.minor: (e3.param2!=null? e3.param2: 0));
          var name='Key'; try{ var names=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#']; var idx=sf+7; name=(names[idx]||'C') + (mi?'m':''); }catch(_){ }
          meta.keysigs.push({ sf:sf, mi:mi, text:name, playTime:pt });
        }
      }
    }catch(_){ }
    return meta; }
  function currentChannelPatches(){ var rows=[]; try{ if (!window.__MIX16 || typeof __MIX16.getPatch!=='function') return rows; for (var ch=0; ch<16; ch++){ var p=__MIX16.getPatch(ch)||{}; var msb=(p.bankMSB!=null? p.bankMSB:0); var lsb=(p.bankLSB!=null? p.bankLSB:0); var prog=(p.program!=null? p.program:0); var name=(p.name||p.programName||''); rows.push({ ch:ch, msb:msb, lsb:lsb, prog:prog, name:name }); } }catch(_){ } return rows; }

  /* ----- SF2 parser (no optional chaining) ----- */
  function toArrayBufferSync(x){ try{ if (!x) return null; if (x instanceof ArrayBuffer) return x; if (ArrayBuffer.isView(x)) return x.buffer.slice(x.byteOffset||0, (x.byteOffset||0)+x.byteLength); return null; }catch(_){ return null; } }
  function parseSFInfo(ab){ var out={ riff:'', type:'', tags:{}, presets:[], banks:[], presetCount:0, sfver:null, engine:'', counts:{ inst:0, shdr:0, pbag:0, ibag:0, pgen:0, pmod:0, igen:0, imod:0 }, hasSm24:false, sampleRateRange:null };
    if (!ab) return out; try{ var dv=new DataView(ab); var decA=new TextDecoder('ascii'); var decU=new TextDecoder('utf-8'); var str=function(off,len){ return decA.decode(new Uint8Array(ab,off,len)); }; var u32=function(off){ return dv.getUint32(off,true); };
      out.riff=str(0,4); out.type=str(8,4);
      var p=12, pdtaStart=-1, pdtaEnd=-1, sdtaStart=-1, sdtaEnd=-1;
      while(p+8<=dv.byteLength){ var id=str(p,4), len=u32(p+4), dataStart=p+8, dataEnd=dataStart+len;
        if (id==='LIST'){
          var listType=str(dataStart,4);
          if (listType==='INFO'){
            var q=dataStart+4; while(q+8<=dataEnd){ var sid=str(q,4), slen=u32(q+4), sStart=q+8, sEnd=sStart+slen;
              if (sid==='ifil' && slen>=4){ var maj=dv.getUint16(sStart,true), min=dv.getUint16(sStart+2,true); out.sfver = maj+'.'+('0'+min).slice(-2); }
              else { var raw=new Uint8Array(ab,sStart,slen); var val=''; try{ val=decU.decode(raw);}catch(_){ try{val=decA.decode(raw);}catch(_){val='';} } val=val.replace(/\u0000+$/,'').trim(); out.tags[sid]=val; if (sid==='isng') out.engine=val; }
              q=sEnd+(slen&1);
            }
          } else if (listType==='sdta'){
            sdtaStart=dataStart+4; sdtaEnd=dataEnd; var r=sdtaStart; while(r+8<=sdtaEnd){ var sid2=str(r,4), slen2=u32(r+4); if (sid2==='sm24') out.hasSm24=true; r=r+8+slen2+(slen2&1); }
          }
        } else if (id==='pdta'){ pdtaStart=dataStart; pdtaEnd=dataEnd; }
        p=dataEnd+(len&1);
      }
      if (pdtaStart>=0){ var q2=pdtaStart; var sRates=[]; while(q2+8<=pdtaEnd){ var sid3=str(q2,4), slen3=u32(q2+4), sStart2=q2+8, sEnd2=sStart2+slen3;
          if (sid3==='phdr'){ var rec=38, count=Math.floor(slen3/rec); for (var i=0;i<count;i++){ var base=sStart2+i*rec; var name=str(base,20).replace(/\u0000+$/,'').trim(); var wPreset=dv.getUint16(base+20,true), wBank=dv.getUint16(base+22,true); out.presets.push({ name:name, preset:wPreset, bank:wBank }); } if (out.presets.length>0) out.presets.pop(); out.presetCount=out.presets.length; var seen={}, banks=[]; for (var j=0;j<out.presets.length;j++){ var b=out.presets[j].bank; if (!seen[b]){ seen[b]=1; banks.push(b); } } banks.sort(function(a,b){return a-b;}); out.banks=banks; }
          else if (sid3==='inst'){ var recI=22, rawI=Math.floor(slen3/recI); out.counts.inst=Math.max(0, rawI-1); }
          else if (sid3==='shdr'){ var recS=46, rawS=Math.floor(slen3/recS); out.counts.shdr=Math.max(0, rawS-1); for (var k=0;k<rawS-1;k++){ var base2=sStart2+k*recS; var sr=dv.getUint32(base2+20,true); sRates.push(sr); } }
          else if (sid3==='pbag'){ out.counts.pbag=Math.floor(slen3/4); }
          else if (sid3==='ibag'){ out.counts.ibag=Math.floor(slen3/4); }
          else if (sid3==='pgen'){ out.counts.pgen=Math.floor(slen3/4); }
          else if (sid3==='igen'){ out.counts.igen=Math.floor(slen3/4); }
          else if (sid3==='pmod'){ out.counts.pmod=Math.floor(slen3/10); }
          else if (sid3==='imod'){ out.counts.imod=Math.floor(slen3/10); }
          q2=sEnd2;
        }
        if (sRates.length){ var min=Math.min.apply(null,sRates), max=Math.max.apply(null,sRates); out.sampleRateRange={ min:min, max:max }; }
      }
    }catch(_){ }
    return out;
  }

  /* ----- MapperJ + fallback ----- */
  function getMapperCatalogList(){ try{ var M=window.SimpleMapperCatalog||window.SimpleMapper||window.MapperJ||null; if(!M) return null; var list=(typeof M.getInstrumentList==='function')? M.getInstrumentList() : ((typeof M.list==='function')? M.list(): []); if(!list||!list.length) return []; var out=[]; for (var i=0;i<list.length;i++){ var it=list[i]||{}; var name=(it.name? String(it.name).trim(): ''); var msb=(it.bankMSB|0); var lsb=(it.bankLSB|0); var prog=(it.program|0); var sfont=(it.sfont? String(it.sfont).trim(): ''); 
  if (name!=='') out.push({ name:name, msb:msb, lsb:lsb, prog:prog, sfont:sfont }); } return out; }catch(_){ return null; } }
  function groupBySFont(rows){ var map={}; for (var i=0;i<rows.length;i++){ var key=(rows[i].sfont||'').trim()||'(unnamed)'; if(!map[key]) map[key]=[]; map[key].push(rows[i]); } return map; }
  function toArrayBufFromCacheKey(key){ try{ var cache=window.sfCache||{}; return toArrayBufferSync(cache[key]); }catch(_){ return null; } }
  function findSFCacheKeyLike(name){ try{ var cache=window.sfCache||{}; var keys=Object.keys(cache); var n=(name||'').toLowerCase(); for(var i=0;i<keys.length;i++){ if(keys[i].toLowerCase()===n) return keys[i]; } for(var j=0;j<keys.length;j++){ if(keys[j].toLowerCase().indexOf(n)!==-1) return keys[j]; } }catch(_){ } return null; }
  function resolveSFSource(prefName){ var rel=prefName||''; var ab=null; var byName=prefName? findSFCacheKeyLike(prefName): null; if(byName){ rel=byName; ab=toArrayBufFromCacheKey(byName); } if(!ab){ var sel=window.sfSelected||''; if (sel){ rel=sel; ab=toArrayBufFromCacheKey(sel); } } if(!ab && window.__LAST_SF_AB__){ rel=window.__LAST_SF_NAME__||rel; ab=toArrayBufferSync(window.__LAST_SF_AB__); } if(!ab && window.__LAST_SF_BUFFER__){ rel=window.__LAST_SF_NAME__||rel; ab=toArrayBufferSync(window.__LAST_SF_BUFFER__); } return { ab:ab, rel:rel };
  }

  /* ----- Basic Info block with META ----- */
  function basicInfoBlock(info){ var c=info.counts||{}; var srRng=(info.sampleRateRange? (info.sampleRateRange.min+'-'+info.sampleRateRange.max+' Hz') : '—'); var t=info.tags||{}; function addTag(id,label){ return t[id]? rowKV(label, esc(t[id])) : ''; }
    var ver= info.sfver || (t.ifil || '—');
    var eng= info.engine || (t.isng || '—');
    var desc = t.ISBJ || t.ICMT || '';
    var descHTML=''; if (desc){ var normalized=String(desc).replace(/\r\n/g,'\n'); if (/\n/.test(normalized) || normalized.length>120){ descHTML = '<div class="kv"><span class="k">Description</span><span class="v"><pre class="info-pre">'+esc(normalized)+'</pre></span></div>'; } else { descHTML = rowKV('Description', esc(normalized)); } }
    var banksArr=info.banks||[]; var banksStr=(banksArr.length? banksArr.join(', ') : '—'); var banksCount=banksArr.length||0; var drumPresent=false; for (var i=0;i<banksArr.length;i++){ if (banksArr[i]===128){ drumPresent=true; break; } }
    var outHtml='';
    outHtml += rowKV('Version', ver);
    outHtml += rowKV('Engine', eng);
    outHtml += rowKV('Instruments', c.inst||0);
    outHtml += rowKV('Samples', c.shdr||0);
    outHtml += rowKV('Preset Zones', c.pbag||0);
    outHtml += rowKV('Instrument Zones', c.ibag||0);
    outHtml += rowKV('Generators (P/I)', String(c.pgen||0)+' / '+String(c.igen||0));
    outHtml += rowKV('Modulators (P/I)', String(c.pmod||0)+' / '+String(c.imod||0));
    outHtml += rowKV('Sample Rate Range', srRng);
    outHtml += rowKV('Has sm24 (24-bit ext)', info.hasSm24? 'Yes':'No');
    outHtml += rowKV('Banks', banksStr);
    outHtml += rowKV('Banks (count)', String(banksCount));
    outHtml += rowKV('Drum bank present', drumPresent? 'Yes':'No');
    // Popular INFO tags
    outHtml += addTag('INAM','Name');
    outHtml += addTag('ICRD','Date');
    outHtml += addTag('IART','Author');
    outHtml += addTag('ICOP','Copyright');
    outHtml += addTag('ISFT','Software');
    outHtml += addTag('IENG','Engineer');
    outHtml += addTag('IPRD','Product');
    // Extended INFO tags
    outHtml += addTag('IKEY','Keywords');
    outHtml += addTag('IGNR','Genre');
    outHtml += addTag('ISRC','Source');
    outHtml += addTag('ISRF','Source Form');
    outHtml += addTag('IARL','Archival Location');
    outHtml += addTag('ICMS','Commissioned');
    outHtml += addTag('ITCH','Technician');
    outHtml += descHTML;
    if (!t.ISBJ && t.ICMT) outHtml += rowKV('Comments', esc(t.ICMT));
    return outHtml;
  }

  function buildSectionFromMapper(name, rows){ var displayName=(name&&name.trim()) || (window.__LAST_SF_NAME__||window.sfSelected||'(unnamed)'); var src=resolveSFSource(name); var size=0, info={ riff:'—', type:'—', banks:[], presetCount:(rows?rows.length:0), tags:{} }; try{ if (src.ab){ size=src.ab.byteLength; info=parseSFInfo(src.ab); } }catch(_){ }
    var basic=basicInfoBlock(info);
    var grid=''; if(rows && rows.length){ var items=['<div class="sf-grid"><div class="hdr"><span class="b">MSB</span><span class="b">LSB</span><span class="p">Prog</span><span class="n">Name</span></div>']; for (var i=0;i<rows.length;i++){ var r=rows[i]; var drum=((r.msb*128+r.lsb)===128)? 'drum':''; items.push('<div class="sfp '+drum+'"><span class="b">'+r.msb+'</span><span class="b">'+r.lsb+'</span><span class="p">'+r.prog+'</span><span class="n">'+esc(r.name)+'</span></div>'); } items.push('</div>'); grid=items.join(''); } else { grid='<div class="small" style="opacity:.8">No presets found</div>'; }
    return '\n      <h5 style="margin-top:14px">'+esc(displayName)+'</h5>\n      '+rowKV('Size', fmtBytes(size))+'\n      '+rowKV('RIFF', info.riff || '—')+'\n      '+rowKV('Type', info.type || '—')+'\n      '+rowKV('Presets', (rows? rows.length: 0))+'\n      '+rowKV('Source', 'Mapper J • Buffer: '+esc(src.rel||'(none)'))+'\n      '+basic+'\n      <h5>Instrument Catalog (MSB / LSB / Program)</h5>\n      '+grid;
  }

  function buildSectionFromSFCache(rel){ var ab=toArrayBufFromCacheKey(rel); var info=parseSFInfo(ab); var size=ab? ab.byteLength:0; var rows=(info.presets||[]).map(function(p){ var bank=p.bank|0; var msb=(bank/128)|0; var lsb=(bank%128)|0; var prog=p.preset|0; var isDrum=((msb*128+lsb)===128)? 'drum':''; return { msb:msb, lsb:lsb, prog:prog, name:(p.name||'').trim(), isDrum:isDrum }; }); var grid=''; if(rows.length){ var items=['<div class="sf-grid"><div class="hdr"><span class="b">MSB</span><span class="b">LSB</span><span class="p">Prog</span><span class="n">Name</span></div>']; for (var i=0;i<rows.length;i++){ var r=rows[i]; items.push('<div class="sfp '+r.isDrum+'"><span class="b">'+r.msb+'</span><span class="b">'+r.lsb+'</span><span class="p">'+r.prog+'</span><span class="n">'+esc(r.name)+'</span></div>'); } items.push('</div>'); grid=items.join(''); } else { grid='<div class="small" style="opacity:.8">No presets found</div>'; }
    return '\n      <h5 style="margin-top:14px">'+esc(rel || window.__LAST_SF_NAME__ || '(unnamed)')+'</h5>\n      '+rowKV('Size', fmtBytes(size))+'\n      '+rowKV('RIFF', info.riff || '—')+'\n      '+rowKV('Type', info.type || '—')+'\n      '+rowKV('Presets', info.presetCount || rows.length)+'\n      '+rowKV('Source', 'sfCache • Buffer: '+esc(rel||'(none)'))+'\n      '+basicInfoBlock(info)+'\n      <h5>Instrument Catalog (MSB / LSB / Program)</h5>\n      '+grid;
  }

  function htmlSFCatalog(){
    try{
      var list=getMapperCatalogList()||[];
      if (list && list.length){ var groups=groupBySFont(list); var order=Object.keys(groups); var sel=(window.sfSelected||'').trim().toLowerCase(); order.sort(function(a,b){ if (a.toLowerCase()===sel) return -1; if (b.toLowerCase()===sel) return 1; return a.localeCompare(b); }); var out=''; for (var i=0;i<order.length;i++){ var key=order[i]; out += buildSectionFromMapper(key, groups[key]||[]); } return out; }
      var cache=window.sfCache||{}; var keys=Object.keys(cache); var selKey=(window.sfSelected||''); keys.sort(function(a,b){ if (a===selKey) return -1; if (b===selKey) return 1; return a.localeCompare(b); }); if (!keys.length){ var rel=window.sfSelected||''; var ab=toArrayBufFromCacheKey(rel); var info=parseSFInfo(ab); if (!ab || !info.presetCount){ return '<div class="small" style="opacity:.8">No SoundFont loaded. Load an SF2/SF3 to see its catalog here.</div>'; } return buildSectionFromSFCache(rel); }
      var out2=''; for (var j=0;j<keys.length;j++){ out2 += buildSectionFromSFCache(keys[j]); } return out2;
    }catch(e){ try{ console.error('SFCatalog error', e); }catch(_){ } return '<div class="kv"><span class="v">SoundFont panel error</span></div>'; }
  }

  /* ----- Manual tab content (ADDED) ----- */
  function htmlManual(){
    return '\n      <h5>Shortcuts</h5>\n      <ul class="bul">\n        <li><b>Space</b> — Play / Stop</li>\n        <li><b>F</b> — Fullscreen toggle</li>\n        <li><b>L</b> — Lyrics window toggle</li>\n        <li><b>Alt+Click</b> a song — Stop current and play immediately</li>\n        <li><b>Shift+Click</b> a song — Queue next (ahead of others)</li>\n      </ul>\n      <h5>Tips</h5>\n      <ul class="bul">\n        <li>Control Center → <b>SF Policy</b> chooses when SF change applies.</li>\n        <li>Lyrics <b>Glow</b> and <b>AutoHide</b> are in the window bar & CC.</li>\n        <li>Use the micro‑dock to pin lyrics, open panels, or access CC quickly.</li>\n        <li>Backgrounds panel: shuffle videos/images, gradients, or solid colors.</li>\n      </ul>';
  }

  /* ----- Panel shell (manual-only) ----- */
  function ensurePanel(){ if (document.getElementById('infoPanel')) return; var sec=document.createElement('section'); sec.className='panel win'; sec.id='infoPanel'; sec.innerHTML='\n      <h4 class="drag"><span>Info</span><span><button class="close" data-close="info">×</button></span></h4>\n      <div class="list">\n        <div class="tabs">\n          <button class="tab small" data-tab="console">Console</button>\n          <button class="tab small" data-tab="song">Song</button>\n          <button class="tab small" data-tab="soundfont">SoundFont</button>\n          <button class="tab small" data-tab="server">Server</button>\n          <button class="tab small" data-tab="about">About</button>\n          <button class="tab small" data-tab="manual">Manual</button>\n          <span class="small" style="margin-left:auto" id="infoStatus"></span>\n        </div>\n        <div class="info-pane" id="pane-console"></div>\n        <div class="info-pane" id="pane-song"></div>\n        <div class="info-pane" id="pane-soundfont"></div>\n        <div class="info-pane" id="pane-server"></div>\n        <div class="info-pane" id="pane-about"></div>\n        <div class="info-pane" id="pane-manual"></div>\n      </div>'; document.body.appendChild(sec);
    var css=document.createElement('style'); css.textContent='\n      #infoPanel .tabs{ display:flex; gap:6px; padding:8px; border-bottom:1px solid rgba(255,255,255,.06); background:rgba(18,18,18,.6) }\n      #infoPanel .tab.active{ outline:2px solid var(--accent); outline-offset:2px }\n      #infoPanel .info-pane{ display:none; padding:8px 12px }\n      #infoPanel .info-pane.active{ display:block }\n      #infoPanel .kv{ display:grid; grid-template-columns: 160px 1fr; gap:8px; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,.08) }\n      #infoPanel .kv .k{ color:#b7c3cf }\n      #infoPanel .kv .v{ color:#dfe3e8 }\n      #infoPanel h5{ margin:12px 0 6px 0; font-weight:700; color:#cfe7ff }\n      #infoPanel .bul{ margin:6px 0 0 16px }\n      #infoPanel .log-box{ font:12px/1.35 monospace; background:#0f1418; border:1px solid #223; border-radius:8px; padding:8px; max-height:36vh; overflow:auto }\n      #infoPanel .log-row{ display:grid; grid-template-columns: 90px 70px 1fr; gap:8px; padding:2px 0; }\n      #infoPanel .log-row .ts{ color:#9fb3c7 }\n      #infoPanel .log-row .lvl{ color:#cfd7df }\n      #infoPanel .log-row .msg{ color:#e7edf3; white-space:pre-wrap; }\n      #infoPanel .log-row.warn .lvl{ color:#ffd166 }\n      #infoPanel .log-row.error .lvl{ color:#ff6b6b }\n      #infoPanel .tools{ display:flex; gap:6px; margin-bottom:6px; align-items:center }\n      #infoPanel .tools .search{ flex:1; background:#101417; color:var(--fg); border:1px solid rgba(255,255,255,.15); padding:6px 10px; border-radius:8px; outline:none; min-width:120px }\n      #infoPanel .lyrics-pre{ white-space:pre-wrap; background:#0f1418; border:1px solid #223; border-radius:8px; padding:8px; max-height:36vh; overflow:auto }\n      #infoPanel .patch-grid .hdr, #infoPanel .patch-grid .rowp{ display:grid; grid-template-columns: 48px 90px 60px 1fr; gap:8px; padding:2px 0; }\n      #infoPanel .patch-grid .hdr{ color:#cfe7ff; border-bottom:1px dashed rgba(255,255,255,.12); margin-bottom:4px }\n      #infoPanel .sf-grid .hdr, #infoPanel .sf-grid .sfp{ display:grid; grid-template-columns: 64px 64px 64px 1fr; gap:8px; padding:2px 0; }\n      #infoPanel .sf-grid .hdr{ color:#cfe7ff; border-bottom:1px dashed rgba(255,255,255,.12); margin-bottom:4px }\n      #infoPanel .sf-grid .sfp.drum .n{ color:#ffd166 }\n      #infoPanel .info-pre{ white-space:pre-wrap; background:#0f1418; border:1px solid #223; border-radius:8px; padding:8px; max-height:28vh; overflow:auto }'; document.head.appendChild(css);
  }

  function renderPane(id, html){ var el=document.getElementById(id); if (!el) return; el.innerHTML=html; if (id==='pane-console') bindConsoleTools(); }

  /* ----- Console REPL tools ----- */
  function bindConsoleTools(){ var clearBtn=document.getElementById('infLogClear'); var copyBtn=document.getElementById('infLogCopy'); var runBtn=document.getElementById('infRun'); var cmdInp=document.getElementById('infCmd'); var histKey='inf_cmd_hist'; var hist=[]; try{ hist=JSON.parse(localStorage.getItem(histKey)||'[]'); }catch(_){ } var hIndex=hist.length; function pushLog(level,msg){ try{ LOGBUF.push({ t:Date.now(), level:level, msg:msg }); if (LOGBUF.length>2000) LOGBUF.splice(0, LOGBUF.length-2000);}catch(_){ } renderPane('pane-console', htmlConsole()); }
    function runCmd(){ var code=(cmdInp && cmdInp.value || '').trim(); if (!code) return; hist.push(code); hIndex=hist.length; try{ localStorage.setItem(histKey, JSON.stringify(hist).slice(0,20000)); }catch(_){ } try{ var result=(0,eval)(code); if (result && typeof result.then==='function'){ pushLog('info', '▶ '+code); result.then(function(v){ pushLog('log', '✓ '+code+' → '+JSON.stringify(v)); }).catch(function(e){ pushLog('error', '✗ '+code+' → '+(e && e.message || String(e))); }); } else { pushLog('log', '▶ '+code+' → '+JSON.stringify(result)); } }catch(e){ pushLog('error', '✗ '+code+' → '+(e && e.message || String(e))); } cmdInp.value=''; if (cmdInp) cmdInp.focus(); setInfoStatus('Ran command at '+nowTS()); }
    if (cmdInp){ cmdInp.addEventListener('keydown', function(ev){ if (ev.key==='Enter'){ ev.preventDefault(); runCmd(); } else if (ev.key==='ArrowUp'){ ev.preventDefault(); if (hIndex>0){ hIndex--; cmdInp.value=hist[hIndex]||''; cmdInp.selectionStart=cmdInp.selectionEnd=cmdInp.value.length; } } else if (ev.key==='ArrowDown'){ ev.preventDefault(); if (hIndex<hist.length){ hIndex++; cmdInp.value=hist[hIndex]||''; cmdInp.selectionStart=cmdInp.selectionEnd=cmdInp.value.length; } } }); }
    if (runBtn) runBtn.addEventListener('click', runCmd);
    if (clearBtn) clearBtn.addEventListener('click', function(){ LOGBUF.length=0; renderPane('pane-console', htmlConsole()); setInfoStatus('Console cleared at '+nowTS()); });
    if (copyBtn) copyBtn.addEventListener('click', function(){ try{ var text=(LOGBUF||[]).map(function(e){ return '['+(new Date(e.t).toISOString())+'] '+e.level.toUpperCase()+': '+e.msg; }).join('\n'); if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(function(){ setInfoStatus('Console copied at '+nowTS()); }).catch(function(){ setInfoStatus('Clipboard copy failed at '+nowTS()); }); } else { setInfoStatus('Clipboard API unavailable at '+nowTS()); } }catch(_){ setInfoStatus('Clipboard copy failed at '+nowTS()); } });
  }

  function htmlConsole(){ try{ var latest=(LOGBUF||[]).slice(-600).reverse(); var rows=''; for (var i=0;i<latest.length;i++){ var e=latest[i]; var t=new Date(e.t).toLocaleTimeString(); rows += '<div class="log-row '+esc(e.level)+'"><span class="ts">'+esc(t)+'</span><span class="lvl">'+esc(e.level.toUpperCase())+'</span><span class="msg">'+esc(e.msg)+'</span></div>'; } if (!rows) rows='<div class="log-row"><span class="msg">No logs yet</span></div>'; return '\n      <div class="section">\n        <div class="tools">\n          <input id="infCmd" class="search" placeholder="Type a JS expression and press Enter…" />\n          <button id="infRun" class="small">Run</button>\n          <button id="infLogClear" class="small">Clear</button>\n          <button id="infLogCopy" class="small">Copy</button>\n        </div>\n        <div id="infLogBox" class="log-box">'+rows+'</div>\n      </div>'; }catch(_){ return '<div class="kv"><span class="v">Console unavailable</span></div>'; } }

  function lyricsTextFromJSON(j){ try{ if (!j || !j.lines || !j.lines.length) return ''; var out=[]; for (var i=0;i<j.lines.length;i++){ var L=j.lines[i]; if (L && L.words && L.words.length){ var s=''; for (var w=0; w<L.words.length; w++){ s+= (L.words[w] && L.words[w].w) || ''; } out.push(s); } } return out.join('\n').trim(); }catch(_){ return ''; } }
  function htmlSong(){ var rel=window.currentSong||''; var name=(window.lastPlayed && window.lastPlayed.name) || (rel? rel.split('/').pop(): ''); var size=(window.lastMIDIBuf && window.lastMIDIBuf.byteLength) || 0; var dur=midiDurationSeconds(window.lastMIDIBuf); var state=window.isPlaying? 'Playing':'Idle'; var meta=extractMIDIMeta(window.lastMIDIBuf); var patches=currentChannelPatches();
    function listToItems(a){ if(!a||!a.length) return '<li>—</li>'; var s=''; for (var i=0;i<a.length;i++){ s+='<li>'+esc(a[i])+'</li>'; } return s; }
    var tempoStr='—'; if (meta.tempos && meta.tempos.length){ var tArr=[]; for (var i=0;i<meta.tempos.length;i++){ var t=meta.tempos[i]; tArr.push(t.bpm+' BPM @'+fmtSecs(t.playTime)); } tempoStr=tArr.join(', '); }
    var tsStr='—'; if (meta.timesigs && meta.timesigs.length){ var tsA=[]; for (var j=0;j<meta.timesigs.length;j++){ var t2=meta.timesigs[j]; tsA.push(t2.num+'/'+t2.den+' @'+fmtSecs(t2.playTime)); } tsStr=tsA.join(', '); }
    var ksStr='—'; if (meta.keysigs && meta.keysigs.length){ var ksA=[]; for (var k=0;k<meta.keysigs.length;k++){ var k2=meta.keysigs[k]; ksA.push(k2.text+' @'+fmtSecs(k2.playTime)); } ksStr=ksA.join(', '); }
    var lyrText=lyricsTextFromJSON(window.lastLyrics); var lyrHTML=lyrText? '<pre class="lyrics-pre">'+esc(lyrText)+'</pre>' : '<div class="kv"><span class="v">No lyrics</span></div>';
    var patchRows=''; for (var pc=0; pc<patches.length; pc++){ var p=patches[pc]; var ch=p.ch+1; var label=(p.name||'').trim(); patchRows += '<div class="rowp"><span class="c">CH'+ch+'</span><span class="b">'+p.msb+'/'+p.lsb+'</span><span class="p">'+p.prog+'</span><span class="n">'+esc(label||'—')+'</span></div>'; }
    return '\n      '+rowKV('Title', esc(name))+'\n      '+rowKV('Path', esc(rel))+'\n      '+rowKV('Size', fmtBytes(size))+'\n      '+rowKV('Duration', fmtSecs(dur))+'\n      '+rowKV('State', esc(state))+'\n      <h5>MIDI Meta</h5>\n      '+rowKV('PPQN', (meta.header && meta.header.ppqn)!=null? meta.header.ppqn: '—')+'\n      '+rowKV('Tempo', esc(tempoStr))+'\n      '+rowKV('Time Sig', esc(tsStr))+'\n      '+rowKV('Key Sig', esc(ksStr))+'\n      '+rowKV('Tracks', '<ul class="bul">'+listToItems(meta.trackNames)+'</ul>')+'\n      '+rowKV('Copyright', '<ul class="bul">'+listToItems(meta.copyright)+'</ul>')+'\n      '+rowKV('Markers', '<ul class="bul">'+listToItems(meta.markers)+'</ul>')+'\n      '+rowKV('Cue Points', '<ul class="bul">'+listToItems(meta.cuePoints)+'</ul>')+'\n      <h5>Channel Patches (Live)</h5>\n      <div class="patch-grid">\n        <div class="hdr"><span class="c">Ch</span><span class="b">MSB/LSB</span><span class="p">Prog</span><span class="n">Name</span></div>\n        '+patchRows+'\n      </div>\n      <h5>Lyrics (Full)</h5>\n      '+lyrHTML;
  }

  function htmlServer(){ var S=window.SERVER_INFO||{}; return rowKV('URL', esc(location.href))+rowKV('Host', esc(location.host))+rowKV('Protocol', esc(location.protocol))+rowKV('PHP', esc(S.php_version||'—'))+rowKV('Server', esc(S.server_software||'—'))+rowKV('OS', esc(S.os||'—'))+rowKV('Timezone', esc(S.timezone||'—'))+rowKV('Doc Root', esc(S.document_root||'—'))+rowKV('Script', esc(S.script||'—'))+rowKV('upload_max_filesize', esc(S.upload_max_filesize||'—'))+rowKV('post_max_size', esc(S.post_max_size||'—'))+rowKV('memory_limit', esc(S.memory_limit||'—'))+rowKV('max_execution_time', esc(S.max_execution_time||'—')); }
  function htmlAbout(){ var v=window.APP_VERSION||'—'; var modules=[ ['libfluidsynth (WASM)','libfluidsynth-2.4.6-with-libsndfile.js'], ['JS Synthesizer','js-synthesizer.min.js'], ['MIDIFile','MIDIFile.js'], ['SimpleMapper + MIX16','simple_mapper_catalog_bundle_v1.1.4.js / mixer16_patch_v4.2.9f'] ]; var rows=''; for (var i=0;i<modules.length;i++){ rows+=rowKV(modules[i][0], modules[i][1]); } return rowKV('Program','KaraokeHD Player')+rowKV('Version', esc(v))+rowKV('Build', esc(nowTS()))+'<h5>Modules</h5>'+rows+rowKV('', '© Sem Sabiduria. For internal use only.'); }

  /* ----- Tabs + WM (manual-only) ----- */
  function activate(tab){ var tabs=['console','song','soundfont','server','about','manual']; for (var i=0;i<tabs.length;i++){ var t=tabs[i]; var pane=document.getElementById('pane-'+t); var btn=document.querySelector('#infoPanel .tab[data-tab="'+t+'"]'); if (pane){ if (t===tab){ pane.classList.add('active'); pane.style.display='block'; } else { pane.classList.remove('active'); pane.style.display='none'; } } if (btn){ if (t===tab) btn.classList.add('active'); else btn.classList.remove('active'); } } }
  function refreshAll(){ renderPane('pane-console', htmlConsole()); renderPane('pane-song', htmlSong()); renderPane('pane-soundfont', htmlSFCatalog()); renderPane('pane-server', htmlServer()); renderPane('pane-about', htmlAbout()); renderPane('pane-manual', htmlManual()); setInfoStatus('Updated: '+nowTS()); }
  function bindTabs(){ var btns=document.querySelectorAll('#infoPanel .tab'); for (var i=0;i<btns.length;i++){ (function(b){ b.addEventListener('click', function(){ var t=b.getAttribute('data-tab'); try{ localStorage.setItem('inf:lastTab', t);}catch(_){ } activate(t); refreshAll(); }); })(btns[i]); } var last='song'; try{ last=localStorage.getItem('inf:lastTab')||'song'; }catch(_){ } activate(last); }
  function bindClose(){ var x=document.querySelector('#infoPanel .close'); if (x){ x.addEventListener('click', function(){ var el=document.getElementById('infoPanel'); if (el) el.classList.remove('visible'); }); } }
  function bindWM(){ var el=document.getElementById('infoPanel'); window.WM=window.WM||{}; window.WM.info={ element: el, show:function(){ el.classList.add('visible'); refreshAll(); if (window.ZStack && typeof window.ZStack.bring==='function') window.ZStack.bring(el); }, hide:function(){ el.classList.remove('visible'); }, toggle:function(){ el.classList.toggle('visible'); if (el.classList.contains('visible')){ refreshAll(); if (window.ZStack && typeof window.ZStack.bring==='function') window.ZStack.bring(el); } } }; }
  function extendMicroDock(){ var menu=document.getElementById('mdPanelMenu'); if (!menu || menu.querySelector('[data-open="info"]')) return; var btn=document.createElement('button'); btn.className='md-item'; btn.setAttribute('data-open','info'); btn.textContent='Info'; btn.addEventListener('click', function(){ try{ window.WM && WM.info && WM.info.show(); }catch(_){ } menu.classList.remove('open'); var p=document.getElementById('mdPanel'); if (p) p.classList.remove('active'); }); menu.appendChild(btn); }

  /* ----- Init (manual-only; no auto-show) ----- */
  var logTick=0; function init(){ ensurePanel(); bindWM(); extendMicroDock(); bindTabs(); bindClose(); refreshAll(); setInterval(function(){ var panelVisible=(document.getElementById('infoPanel') && document.getElementById('infoPanel').classList.contains('visible')); var consoleActive=(document.getElementById('pane-console') && document.getElementById('pane-console').classList.contains('active')); if (!panelVisible || !consoleActive) return; var nowLen=(LOGBUF||[]).length; if (nowLen!==logTick){ logTick=nowLen; renderPane('pane-console', htmlConsole()); } }, 800); }
  if (document.readyState==='complete' || document.readyState==='interactive'){ setTimeout(init, 0); } else { document.addEventListener('DOMContentLoaded', init); }
})();
