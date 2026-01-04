/*!
 * simple_mapper_catalog_bundle_v1.1.4.js
 * Add-on for SimpleMapper v1.x
 *  NEW in v1.1.4:
 *   - UI wraps neatly on small screens + optional Compact mode
 *   - "SF Only" scope: search only presets parsed from CURRENT in-memory SF buffer (default ON)
 *   - "Strict" mode: apply is allowed ONLY if preset exists in current SF buffer (default ON)
 *   - "Disable LS" option: ignore persisted localStorage catalog so empty search until you load SF
 *   - "Refresh SF" button + SF name/size indicator
 *   - Keeps lock/queue and applyWithRetry from v1.1.3
 * 2025-09-28
 */
(function(){
  if (window.__SM_CATALOG_BUNDLE_V114__) return; window.__SM_CATALOG_BUNDLE_V114__=true;

  function log(){ try{ if(localStorage.getItem('sm:debug')==='on') console.log.apply(console, ['[SM-Bundle]'].concat([].slice.call(arguments))); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function clamp(v,a,b){ v=+v||0; return Math.max(a, Math.min(b, v)); }
  function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[c];}); }

  // ---------- Inline notifier ----------
  var DOM={}; var LAST_RES=[]; var SEL_IDX=-1; var DEBOUNCE=null; var hideNoteT=null;
  function ensureNoteHost(){ if (DOM.note) return DOM.note; var panel=el('smPanel'); if(!panel) return null; var n=document.createElement('div'); n.id='smCatNote'; n.setAttribute('aria-live','polite'); n.style.cssText='display:none;margin-top:6px;'; panel.appendChild(n);
    if(!$('#smCatNoteStyle')){ var st=document.createElement('style'); st.id='smCatNoteStyle'; st.textContent='\
      #smCatNote{ font:12px/1.35 system-ui; }\
      .sm-note{ display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; border:1px solid transparent; background:#121a21; color:#dfe8f3; }\
      .sm-note.ok{ border-color:#2f5; background:rgba(60,255,120,.12); }\
      .sm-note.warn{ border-color:#fc6; background:rgba(255,200,100,.12); }\
      .sm-note.err{ border-color:#f77; background:rgba(255,120,120,.12); }\
      .sm-note .tag{ font:11px/1.2 monospace; opacity:.8 }\
    '; document.head.appendChild(st);} DOM.note=n; return n; }
  function note(msg,kind){ try{ var host=ensureNoteHost(); if(!host) return; clearTimeout(hideNoteT); var box=document.createElement('div'); box.className='sm-note '+(kind||''); var tag=document.createElement('span'); tag.className='tag'; tag.textContent=(kind==='ok'?'OK':kind==='warn'?'NOTE':kind==='err'?'ERR':'INFO'); var txt=document.createElement('span'); txt.textContent=String(msg||''); box.appendChild(tag); box.appendChild(txt); host.innerHTML=''; host.appendChild(box); host.style.display='block'; hideNoteT=setTimeout(function(){ host.style.display='none'; }, 3200);}catch(e){} }

  // ---------- Catalog stores ----------
  var LS_KEY='sm:catalog';
  var CATALOG_PERSIST=[]; // from localStorage (optional)
  var CATALOG_SF=[];      // from current in-memory SF buffer

  function normalizeOne(x, sfont){ if(!x) return null; var name=x.name||x.title||x.label||x.n||x.presetName||''; var msb=(x.bankMSB!=null?x.bankMSB:(x.msb!=null?x.msb:x.bank_msb)); var lsb=(x.bankLSB!=null?x.bankLSB:(x.lsb!=null?x.lsb:x.bank_lsb)); var prog=(x.program!=null?x.program:(x.pgm!=null?x.pgm:(x.preset!=null?x.preset:x.pc))); if(name&&(msb!=null)&&(lsb!=null)&&(prog!=null)){ return { name:String(name), bankMSB:clamp(msb,0,127), bankLSB:clamp(lsb,0,127), program:clamp(prog,0,127), sfont:sfont||x.sfont||x.soundfont||'' }; } return null; }
  function walkAny(obj,acc,sfont){ try{ if(!obj) return; if(Array.isArray(obj)){ for(var i=0;i<obj.length;i++){ var r=normalizeOne(obj[i],sfont); if(r) acc.push(r); else walkAny(obj[i],acc,sfont);} return; } if(typeof obj==='object'){ if(Array.isArray(obj.instruments)){ walkAny(obj.instruments,acc,obj.sfont||sfont||obj.name||obj.title); return; } if(Array.isArray(obj.presets)){ walkAny(obj.presets,acc,obj.sfont||sfont||obj.name||obj.title); return; } var keys=Object.keys(obj), objs=0; for(var k=0;k<keys.length;k++){ if(obj[keys[k]] && typeof obj[keys[k]]==='object') objs++; } if(objs){ for(var k2=0;k2<keys.length;k2++){ var v=obj[keys[k2]]; var r2=normalizeOne(v,sfont||obj.sfont||obj.name||obj.title); if(r2) acc.push(r2); else walkAny(v,acc,sfont||obj.sfont||obj.name||obj.title);} return; } var r3=normalizeOne(obj,sfont); if(r3) acc.push(r3);} }catch(e){ log('walkAny error',e);} }
  function normalizeCatalog(any){ var out=[]; walkAny(any,out,''); return out; }

  function keyOf(it){ return (String(it.name||'').trim().toLowerCase())+'|'+(it.bankMSB|0)+'|'+(it.bankLSB|0)+'|'+(it.program|0); }

  function loadFromLocal(){ try{ var disabled = (localStorage.getItem('sm:cat:disableLS')==='on'); if(disabled){ CATALOG_PERSIST=[]; return; } var j=localStorage.getItem(LS_KEY); if(!j) return; var a=JSON.parse(j); if(Array.isArray(a)) CATALOG_PERSIST=a.map(function(x){ return normalizeOne(x,x.sfont)||x; }).filter(Boolean); }catch(e){} }
  function saveToLocal(){ try{ var disabled = (localStorage.getItem('sm:cat:disableLS')==='on'); if(disabled) return; var merged = mergeUnique(CATALOG_PERSIST, CATALOG_SF); localStorage.setItem(LS_KEY, JSON.stringify(merged)); }catch(e){} }

  function mergeUnique(a,b){ var out=[], seen={}; function addOne(x){ var k=keyOf(x); if(!seen[k]){ seen[k]=1; out.push(x);} } if(Array.isArray(a)) a.forEach(addOne); if(Array.isArray(b)) b.forEach(addOne); return out; }

  function getActiveCatalog(){ var sfOnly = DOM.sfOnly && DOM.sfOnly.checked; if(sfOnly) return CATALOG_SF; // strict SF scope
    // else union of SF + PERSIST
    return mergeUnique(CATALOG_SF, CATALOG_PERSIST);
  }

  // ---------- UI ----------
  function ensureUI(){ if(DOM.panel) return true; var panel = el('smPanel'); if(!panel) return false;
    var style=document.createElement('style'); style.id='smCat114Style'; style.textContent='\
      #smCatRow{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; width:100%; }\
      #smCatRow .grp{ display:flex; gap:8px; align-items:center; }\
      #smCatRow .right{ margin-left:auto; display:flex; gap:8px; align-items:center; }\
      #smCatRow input[type="search"]{ flex:1; min-width:180px; background:#10161c; color:#e7eef8; border:1px solid #3a5166; border-radius:8px; padding:6px 8px }\
      #smCatResults{ display:none; max-height:36vh; overflow:auto; background:rgba(16,22,28,.95); border:1px solid #31485e; border-radius:10px; margin-top:6px; padding:6px; }\
      .sm-cat-item{ display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid transparent; border-radius:8px; cursor:pointer }\
      .sm-cat-item:hover{ background:rgba(255,255,255,.06); border-color:#3a5166 }\
      .sm-cat-item.sel{ background:rgba(80,160,255,.15); border-color:#4f82ff }\
      .sm-cat-name{ flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }\
      .sm-cat-meta{ font:12px/1.2 monospace; color:#9fb6c9 }\
      .sm-badge{ font:11px/1.2 monospace; color:#9fb6c9; opacity:.9 }\
      .sm-compact #smCatRow input[type="search"]{ padding:4px 6px; }\
      .sm-compact #smCatRow .grp>button, .sm-compact #smCatRow label { transform:scale(.95); transform-origin:left center; }\
    '; if(!$('#smCat114Style')) document.head.appendChild(style);

    var row=document.createElement('div'); row.className='row'; row.id='smCatRow';
    row.innerHTML='\
      <span class="small" style="min-width:60px;color:#b7c8d9">Catalog</span>\
      <div class="grp" style="flex:1 1 280px">\
        <input id="smCatQuery" type="search" placeholder="Search… (msb:1 lsb:0 pg:40 sfont:Bank)  •  Ctrl+Enter = apply best"/>\
      </div>\
      <div class="grp">\
        <button id="smCatFromSF" class="small" title="Import current SoundFont (memory)">From SF</button>\
        <button id="smCatRefreshSF" class="small" title="Re-scan current SF">Refresh SF</button>\
        <button id="smCatImport" class="small" title="Import JSON">Import</button>\
        <button id="smCatExport" class="small" title="Export catalog JSON">Export</button>\
        <button id="smCatClear" class="small" title="Clear catalog (LS)">Clear</button>\
      </div>\
      <div class="grp">\
        <label class="small"><input id="smCatSFOnly" type="checkbox"> SF Only</label>\
        <label class="small"><input id="smCatStrict" type="checkbox"> Strict</label>\
        <label class="small" title="Ignore persisted catalog in localStorage"><input id="smCatDisableLS" type="checkbox"> Disable LS</label>\
        <label class="small"><input id="smCatCompact" type="checkbox"> Compact</label>\
        <label class="small" style="display:flex; align-items:center; gap:6px"><input id="smCatAutoApply" type="checkbox"> Auto-apply</label>\
        <button id="smCatApplyNow" class="small" title="Apply MSB/LSB/PG to channel">Apply</button>\
      </div>\
      <div class="right"><span id="smCatSFInfo" class="sm-badge">SF: (none)</span></div>';

    var results=document.createElement('div'); results.id='smCatResults';

    panel.appendChild(row); panel.appendChild(results);

    DOM={ panel:panel, row:row, results:results,
      query: el('smCatQuery'), importBtn: el('smCatImport'), fromSF: el('smCatFromSF'), refreshSF: el('smCatRefreshSF'),
      exportBtn: el('smCatExport'), clearBtn: el('smCatClear'), applyNowBtn: el('smCatApplyNow'),
      autoApply: el('smCatAutoApply'), sfOnly: el('smCatSFOnly'), strict: el('smCatStrict'), disableLS: el('smCatDisableLS'), compact: el('smCatCompact'), sfInfo: el('smCatSFInfo'),
      msb: el('smMSB'), lsb: el('smLSB'), pg: el('smProg'), chSel: el('smChan'), note:null };

    // Restore toggles (defaults: SFOnly=ON, Strict=ON, DisableLS=OFF, Compact=OFF)
    try{ var a=localStorage.getItem('sm:cat:auto'); if(a) DOM.autoApply.checked=(a==='on'); }catch(e){}
    try{ var sfonly=localStorage.getItem('sm:cat:sfonly'); DOM.sfOnly.checked = (sfonly? sfonly==='on': true); }catch(e){ DOM.sfOnly.checked=true; }
    try{ var strict=localStorage.getItem('sm:cat:strict'); DOM.strict.checked = (strict? strict==='on': true); }catch(e){ DOM.strict.checked=true; }
    try{ var disLS=localStorage.getItem('sm:cat:disableLS'); DOM.disableLS.checked=(disLS==='on'); }catch(e){}
    try{ var cmp=localStorage.getItem('sm:cat:compact'); DOM.compact.checked=(cmp==='on'); }catch(e){}

    DOM.autoApply.addEventListener('change', function(){ try{ localStorage.setItem('sm:cat:auto', DOM.autoApply.checked?'on':'off'); }catch(e){} });
    DOM.sfOnly.addEventListener('change', function(){ try{ localStorage.setItem('sm:cat:sfonly', DOM.sfOnly.checked?'on':'off'); }catch(e){} updateSFInfo(); runSearch(); });
    DOM.strict.addEventListener('change', function(){ try{ localStorage.setItem('sm:cat:strict', DOM.strict.checked?'on':'off'); }catch(e){} });
    DOM.disableLS.addEventListener('change', function(){ try{ localStorage.setItem('sm:cat:disableLS', DOM.disableLS.checked?'on':'off'); }catch(e){} loadFromLocal(); runSearch(); });
    DOM.compact.addEventListener('change', function(){ try{ localStorage.setItem('sm:cat:compact', DOM.compact.checked?'on':'off'); }catch(e){} toggleCompact(); });

    DOM.importBtn.addEventListener('click', showImporter);
    DOM.fromSF.addEventListener('click', importFromMemory);
    DOM.refreshSF.addEventListener('click', function(){ importFromMemory(true); });
    DOM.exportBtn.addEventListener('click', exportCatalog);
    setupClearButton(DOM.clearBtn);

    DOM.applyNowBtn.addEventListener('click', function(){ var ch=parseInt(DOM.chSel && DOM.chSel.value || '1',10)||1; var req={channel:ch, bankMSB:(DOM.msb&&+DOM.msb.value)||0, bankLSB:(DOM.lsb&&+DOM.lsb.value)||0, program:(DOM.pg&&+DOM.pg.value)||0}; guardedApply(req); });

    DOM.query.addEventListener('input', function(){ clearTimeout(DEBOUNCE); DEBOUNCE=setTimeout(runSearch, 120); });
    DOM.query.addEventListener('keydown', onQueryKey);
    DOM.results.addEventListener('mousedown', function(e){ var item=e.target.closest('.sm-cat-item'); if(!item) return; var idx=parseInt(item.getAttribute('data-idx'),10); selectByIndex(idx, true); });

    toggleCompact(); updateSFInfo();
    return true;
  }

  function toggleCompact(){ try{ if(DOM.compact && DOM.compact.checked) DOM.panel.classList.add('sm-compact'); else DOM.panel.classList.remove('sm-compact'); }catch(e){} }
  function updateSFInfo(){ var name=getSFName(); var n=CATALOG_SF.length|0; if(DOM.sfInfo) DOM.sfInfo.textContent = 'SF: '+(name?name:'(none)')+' • '+n; }

  function showImporter(){ var choose=window.prompt('Import instrument catalog\n\nPaste a JSON URL (http/https) or paste raw JSON data here.\nOr leave blank to choose a local .json file.',''); if(choose && /^https?:\/\//i.test(choose.trim())) return fetchURL(choose.trim()); if(choose && (choose.trim().startsWith('{') || choose.trim().startsWith('['))){ try{ ingestPersist(JSON.parse(choose)); }catch(e){ note('Invalid JSON: '+e.message,'err'); } return; } var inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=function(){ if(!inp.files||!inp.files[0]) return; var f=inp.files[0]; var r=new FileReader(); r.onload=function(){ try{ ingestPersist(JSON.parse(r.result)); }catch(e){ note('Invalid JSON: '+e.message,'err'); } }; r.readAsText(f); }; inp.click(); }
  async function fetchURL(url){ try{ var res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); ingestPersist(await res.json()); }catch(e){ note('Fetch failed: '+e.message,'err'); } }

  function ingestPersist(obj){ var add=normalizeCatalog(obj); if(!add.length){ note('No instruments found in JSON. Expected fields: name, bankMSB, bankLSB, program.','warn'); return; } var seen={}; CATALOG_PERSIST.forEach(function(x){ seen[keyOf(x)]=1; }); var added=0; for(var j=0;j<add.length;j++){ var it=add[j], k=keyOf(it); if(!seen[k]){ CATALOG_PERSIST.push(it); seen[k]=1; added++; } } saveToLocal(); note('Catalog updated. Added '+added+' • Persist '+CATALOG_PERSIST.length,'ok'); runSearch(); }

  // ---------- Search ----------
  function parseFilters(q){ var f={}; var parts=String(q||'').split(/\s+/).filter(Boolean); var rest=[]; for(var i=0;i<parts.length;i++){ var m=parts[i].match(/^(msb|lsb|pg|program|sfont):(.+)$/i); if(m){ var k=m[1].toLowerCase(), v=m[2]; if(k==='program') k='pg'; if(k==='sfont'){ f.sfont=(v||'').toLowerCase(); } else { var n=parseInt(v,10); if(!isNaN(n)) f[k]=n; } } else rest.push(parts[i]); } f.free=rest.join(' ').trim().toLowerCase(); return f; }

  function runSearch(){ if(!DOM.results) return; var raw=(DOM.query.value||'').trim(); var list=getActiveCatalog(); if(!raw){ DOM.results.style.display='none'; DOM.results.innerHTML=''; LAST_RES=[]; SEL_IDX=-1; return; } var filters=parseFilters(raw); var ch=parseInt(DOM.chSel && DOM.chSel.value || '1',10)||1; var isDrums=(ch===10); var res=[]; for(var i=0;i<list.length;i++){ var it=list[i]; var name=(it.name||''); var nameL=name.toLowerCase(); var sfontL=(it.sfont||'').toLowerCase(); if(filters.msb!=null && (it.bankMSB|0)!==(filters.msb|0)) continue; if(filters.lsb!=null && (it.bankLSB|0)!==(filters.lsb|0)) continue; if(filters.pg!=null && (it.program|0)!==(filters.pg|0)) continue; if(filters.sfont && sfontL.indexOf(filters.sfont)===-1) continue; if(filters.free){ if(nameL.indexOf(filters.free)===-1 && sfontL.indexOf(filters.free)===-1) continue; } if(isDrums){ if(it.bankMSB!==128 && !/drum|kit|percuss|808|909/i.test(name)) continue; } res.push(it); if(res.length>=300) break; } if(!res.length){ DOM.results.style.display='none'; DOM.results.innerHTML=''; LAST_RES=[]; SEL_IDX=-1; // helpful note
      if(DOM.sfOnly && DOM.sfOnly.checked && !CATALOG_SF.length){ note('No SF data yet. Use "From SF" or "Refresh SF" to load current SoundFont.','warn'); }
      return; }
    var html=''; for(var j=0;j<res.length;j++){ var r=res[j]; html += '<div class="sm-cat-item" data-idx="'+j+'">'+ '<div class="sm-cat-name">'+escapeHtml(r.name)+'</div>'+ '<div class="sm-cat-meta">MSB '+r.bankMSB+'  LSB '+r.bankLSB+'  PGM '+r.program+(r.sfont?('  •  '+escapeHtml(String(r.sfont))):'')+'</div>'+ '</div>'; }
    DOM.results.innerHTML=html; DOM.results.style.display='block'; LAST_RES=res; SEL_IDX=0; paintSelection(); }

  function paintSelection(){ if(!DOM.results) return; var items=DOM.results.querySelectorAll('.sm-cat-item'); for(var i=0;i<items.length;i++){ if(i===SEL_IDX) items[i].classList.add('sel'); else items[i].classList.remove('sel'); } if(items[SEL_IDX]){ var box=items[SEL_IDX]; var rTop=box.offsetTop, rBot=rTop+box.offsetHeight; var sTop=DOM.results.scrollTop, sBot=sTop+DOM.results.clientHeight; if(rTop<sTop) DOM.results.scrollTop=rTop-6; else if(rBot>sBot) DOM.results.scrollTop=rBot-DOM.results.clientHeight+6; } }

  function onQueryKey(e){ if(e.key==='Enter' && e.ctrlKey){ var q=(DOM.query&&DOM.query.value||'').trim(); if(!q) return; var ch=parseInt(DOM.chSel && DOM.chSel.value || '1',10)||1; withLock(function(){ return applyByName(q,{channel:ch}); }).then(function(ok){ if(!ok) note('No close match to apply.','warn'); }); e.preventDefault(); return; } if(!LAST_RES.length || DOM.results.style.display==='none') return; if(e.key==='ArrowDown'){ e.preventDefault(); SEL_IDX=Math.min(LAST_RES.length-1, Math.max(0, SEL_IDX+1)); paintSelection(); return; } if(e.key==='ArrowUp'){ e.preventDefault(); SEL_IDX=Math.max(0, SEL_IDX-1); paintSelection(); return; } if(e.key==='Enter'){ e.preventDefault(); selectByIndex(SEL_IDX, true); return; } if(e.key==='Escape'){ e.preventDefault(); DOM.results.style.display='none'; return; } }

  function selectByIndex(idx, applyNow){ var r=LAST_RES[idx]; if(!r) return; try{ if(DOM.msb) DOM.msb.value=r.bankMSB; if(DOM.lsb) DOM.lsb.value=r.bankLSB; if(DOM.pg) DOM.pg.value=r.program; }catch(_){ } if(applyNow && DOM.autoApply && DOM.autoApply.checked){ var ch=parseInt(DOM.chSel && DOM.chSel.value || '1',10)||1; guardedApply({ channel: ch, bankMSB:r.bankMSB, bankLSB:r.bankLSB, program:r.program }); } }

  // ---------- Guarded apply (Strict mode) ----------
  function guardedApply(req){ if(DOM.strict && DOM.strict.checked){ var ok=inSFBuffer(req); if(!ok){ note('Strict mode: preset not found in CURRENT SF. Apply blocked.','err'); return; } } withLock(function(){ return applyWithRetry(req); }).then(function(ok){ if(!ok) note('Apply failed after retries.','err'); }); }
  function inSFBuffer(req){ var k=(req.bankMSB|0)+'|'+(req.bankLSB|0)+'|'+(req.program|0); for(var i=0;i<CATALOG_SF.length;i++){ var it=CATALOG_SF[i]; if(((it.bankMSB|0)+'|'+(it.bankLSB|0)+'|'+(it.program|0))===k) return true; } return false; }

  // ---------- Export / Clear ----------
  function exportCatalog(){ try{ var list=mergeUnique(CATALOG_PERSIST, CATALOG_SF); var blob=new Blob([JSON.stringify(list, null, 2)],{type:'application/json'}); var a=document.createElement('a'); a.download='simplemapper_catalog.json'; a.href=URL.createObjectURL(blob); document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 50); note('Exported '+list.length+' items','ok'); }catch(e){ note('Export failed: '+e.message,'err'); } }
  function setupClearButton(btn){ var pending=false,t; btn.addEventListener('click', function(){ if(!pending){ pending=true; note('Click CLEAR again within 4s to confirm','warn'); clearTimeout(t); t=setTimeout(function(){ pending=false; },4000); return; } pending=false; clearTimeout(t); try{ localStorage.removeItem(LS_KEY); CATALOG_PERSIST=[]; DOM.results.style.display='none'; DOM.results.innerHTML=''; note('Catalog cleared','ok'); }catch(e){ note('Clear failed: '+e.message,'err'); } }); }

  // ---------- From-SF (memory) importer ----------
  function parseSF2Presets(arrayBuf){ if(!arrayBuf || arrayBuf.byteLength<64) return []; var u8=new Uint8Array(arrayBuf), v=new DataView(arrayBuf); var tag=(o)=>String.fromCharCode(u8[o],u8[o+1],u8[o+2],u8[o+3]); if(tag(0)!=='RIFF' || String.fromCharCode(u8[8],u8[9],u8[10],u8[11])!=='sfbk') return []; var o=12, pdtaOff=-1, pdtaSize=0; while(o+8<=u8.length){ var id=tag(o), sz=v.getUint32(o+4,true); var next=o+8+sz+(sz&1); if(id==='LIST'){ var type=String.fromCharCode(u8[o+8],u8[o+9],u8[o+10],u8[o+11]); if(type==='pdta'){ pdtaOff=o+12; pdtaSize=sz-4; break; } } o=next; } if(pdtaOff<0) return []; var p=pdtaOff, end=pdtaOff+pdtaSize, phdrOff=-1, phdrSize=0; while(p+8<=end){ var id2=tag(p), sz2=v.getUint32(p+4,true); var next2=p+8+sz2+(sz2&1); if(id2==='phdr'){ phdrOff=p+8; phdrSize=sz2; break; } p=next2; } if(phdrOff<0 || phdrSize<38) return []; var rec=38, n=Math.floor(phdrSize/rec); function readName(off,len){ var s=''; for(var i=0;i<len;i++){ var c=u8[off+i]; if(!c) break; s+=String.fromCharCode(c);} return s.trim(); } var out=[]; for(var i=0;i<n;i++){ var base=phdrOff+i*rec; var name=readName(base,20); var program=v.getUint16(base+20,true); var bank=v.getUint16(base+22,true); if(!name||name==='EOP') break; out.push({ name:name, bankMSB:(bank>>>7)&0x7F, bankLSB:bank&0x7F, program:program }); } return out; }

  function getSFName(){ return (window.sfSelected || window.__LAST_SF_NAME__ || '').toString() || ''; }

  function importFromMemory(isRefresh){ var sfSelected=(window.sfSelected||''); var sfCache=(window.sfCache||{}); var buf=sfCache && sfCache[sfSelected]; if(!buf) buf=window.__LAST_SF_BUFFER__||null; if(!buf || !(buf instanceof ArrayBuffer)){ note('Current SF buffer not found in memory.','warn'); return; } var list=parseSF2Presets(buf);
  // Ensure each preset carries the current SoundFont name.
// This helps downstream consumers (Info window) enrich RIFF/Type/Size/Banks and group properly.
var sfName = getSFName(); // uses window.sfSelected or window.__LAST_SF_NAME__
list = list.map(function(it){
  return Object.assign({}, it, { sfont: sfName });
});
  if(!list.length){ note('No presets found (phdr missing or unsupported SF).','warn'); return; } // update CATALOG_SF
    CATALOG_SF=list; updateSFInfo(); // optionally also merge into persist (so exported includes them)
    var seen={}; CATALOG_PERSIST.forEach(function(x){ seen[keyOf(x)]=1; }); var added=0; for(var j=0;j<list.length;j++){ var it=list[j], k=keyOf(it); if(!seen[k]){ CATALOG_PERSIST.push(it); seen[k]=1; added++; } }
    saveToLocal();
    note((isRefresh?'Refreshed':'Imported')+' from current SF • '+list.length+' presets • '+(getSFName()||'')+(added?(' • Persist+ '+added):''),'ok');
    try{ DOM.query && DOM.query.dispatchEvent(new Event('input')); }catch(e){}
  }

  // ---------- Lock/queue + retry + fuzzy (from v1.1.3) ----------
  var __LOCK_ACTIVE=false, __LOCK_Q=[]; function withLock(fn){ return new Promise(function(resolve){ __LOCK_Q.push({fn:fn, resolve:resolve}); if(!__LOCK_ACTIVE) runNext(); }); } function runNext(){ if(__LOCK_Q.length===0){ __LOCK_ACTIVE=false; return; } __LOCK_ACTIVE=true; var job=__LOCK_Q.shift(); Promise.resolve().then(job.fn).then(function(res){ job.resolve(res); runNext(); }).catch(function(){ job.resolve(false); runNext(); }); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  async function applyWithRetry(req){ try{ if(!window.SimpleMapper || typeof SimpleMapper.apply!=='function'){ log('applyWithRetry: SimpleMapper.apply not ready, retrying…'); var spins=0; while((!window.SimpleMapper || typeof SimpleMapper.apply!=='function') && spins<5){ await sleep(25); spins++; } if(!window.SimpleMapper || typeof SimpleMapper.apply!=='function') return false; } var ch=Math.max(1, Math.min(16, (req && req.channel)|0 || 1)); var msb=Math.max(0, Math.min(127,(req && req.bankMSB)|0)); var lsb=Math.max(0, Math.min(127,(req && req.bankLSB)|0)); var pg=Math.max(0, Math.min(127,(req && req.program)|0)); var attempt=0, delays=[0,25,50]; while(attempt<delays.length){ try{ var payload={channel:ch, bankMSB:msb, bankLSB:lsb, program:pg}; log('apply attempt',attempt+1,payload); var r=SimpleMapper.apply(payload); if(r && typeof r.then==='function') await r; await sleep(0); var r2=SimpleMapper.apply(payload); if(r2 && typeof r2.then==='function') await r2; return true; }catch(e){ log('apply error',e);} attempt++; await sleep(delays[attempt]||0);} return false; }catch(err){ log('applyWithRetry fatal', err); return false; } }

  function normStr(s){ return (s||'').toLowerCase().replace(/[_\-]/g,' ').replace(/[^a-z0-9\s]+/g,'').replace(/\s+/g,' ').trim(); }
  var ALIASES={ 'ep':'electric piano','rhodes':'electric piano','wurli':'wurly wurli wurlitzer electric piano','saw':'saw lead','lead':'lead','pad':'pad','str':'strings','string':'strings','kick':'drum kick','snare':'drum snare','hh':'hi hat hihat','tom':'tom','perc':'percussion','gm1':'general midi','gm':'general midi','pno':'piano','pf':'piano','grand':'grand piano' };
  function expandAliases(q){ var toks=q.split(' '), out=[]; for(var i=0;i<toks.length;i++){ var t=toks[i]; out.push(t); if(ALIASES[t]) out.push(ALIASES[t]); } return out.join(' '); }
  function levenshtein(a,b){ var m=a.length,n=b.length; if(m===0) return n; if(n===0) return m; var dp=new Array(n+1); for(var j=0;j<=n;j++) dp[j]=j; for(var i=1;i<=m;i++){ var prev=dp[0], tmp; dp[0]=i; for(var j=1;j<=n;j++){ tmp=dp[j]; var cost=(a.charCodeAt(i-1)===b.charCodeAt(j-1))?0:1; dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost); prev=tmp; } } return dp[n]; }
  function fuzzyScore(name,q){ var a=normStr(name), b=normStr(q); if(!a||!b) return 0; if(a===b) return 100; var at=a.split(' '), bt=b.split(' '); var aset={},bset={},inter=0; for(var i=0;i<at.length;i++) aset[at[i]]=1; for(var j=0;j<bt.length;j++){ bset[bt[j]]=1; if(aset[bt[j]]) inter++; } var union=Object.keys(aset).length + Object.keys(bset).length - inter; var jacc=union?(inter/union):0; var substr=a.indexOf(b)!==-1?1:0; var starts=a.startsWith(b)?1:0; var lev=levenshtein(a,b); var levNorm=Math.max(a.length,b.length); var levScore=(1-(lev/Math.max(1,levNorm))); var score=(jacc*0.45 + substr*0.25 + starts*0.10 + levScore*0.20)*100; return Math.round(score); }

  function bestMatchByName(name,opts){ opts=opts||{}; var q=expandAliases(normStr(name)); var ch=Math.max(1, Math.min(16,(opts.channel|0)||1)); var isDrums=(ch===10); var list=getActiveCatalog(); var top=null, topScore=0, best=null; for(var i=0;i<list.length;i++){ var it=list[i]; if(opts.msb!=null && (it.bankMSB|0)!==(opts.msb|0)) continue; if(opts.lsb!=null && (it.bankLSB|0)!==(opts.lsb|0)) continue; if(opts.pg!=null && (it.program|0)!==(opts.pg|0)) continue; if(opts.sfont){ var sf=(it.sfont||'').toLowerCase(); if(sf.indexOf(String(opts.sfont).toLowerCase())===-1) continue; } if(isDrums){ if(it.bankMSB!==128 && !/drum|kit|percuss|808|909/i.test(it.name||'')) continue; } var s=fuzzyScore(it.name,q); if(s>topScore){ topScore=s; top=it; } } if(top){ best={ item: top, score: topScore, channel: ch }; } return best; }

  async function applyAny(reqs, opts){ opts=opts||{}; var ch=opts.channel|0; var threshold=(opts.threshold==null?60:opts.threshold); for(var i=0;i<reqs.length;i++){ var r=reqs[i]; if(typeof r==='string'){ var m=bestMatchByName(r,{channel: ch||undefined, sfont: opts.sfont}); if(m && m.score>=threshold){ var ok= await applyWithRetry({channel:(ch||m.channel), bankMSB:m.item.bankMSB, bankLSB:m.item.bankLSB, program:m.item.program}); if(ok){ note('Applied best: '+m.item.name+' (score '+m.score+')','ok'); return true; } } } else if(r && typeof r==='object'){ var req={ channel:(r.channel||ch||1), bankMSB:r.bankMSB|0, bankLSB:r.bankLSB|0, program:r.program|0 }; var ok2= await applyWithRetry(req); if(ok2) return true; } } return false; }
  async function applyByName(name, opts){ opts=opts||{}; var threshold=(opts.threshold==null?60:opts.threshold); var m=bestMatchByName(name, opts); if(!m || m.score<threshold) return false; var req={ channel:(opts.channel||m.channel), bankMSB:m.item.bankMSB, bankLSB:m.item.bankLSB, program:m.item.program }; if(DOM.strict && DOM.strict.checked && !inSFBuffer(req)) return false; var ok= await applyWithRetry(req); if(ok){ if(localStorage.getItem('sm:debug')==='on') note('Applied best: '+m.item.name+' (score '+m.score+')','ok'); } return ok; }

  // ---------- Startup ----------
  function startNow(){ if(ensureUI()){ loadFromLocal(); updateSFInfo(); runSearch(); } }
  function start(){ if(el('smPanel')){ startNow(); return; } var obs=new MutationObserver(function(){ if(el('smPanel')){ try{ obs.disconnect(); }catch(e){} startNow(); } }); try{ obs.observe(document.documentElement||document.body, {childList:true, subtree:true}); }catch(e){} setTimeout(function(){ if(el('smPanel')){ try{ obs.disconnect(); }catch(_e){} startNow(); } }, 250); }
  if(document.readyState!=='loading') start(); else document.addEventListener('DOMContentLoaded', start, {once:true});

  // ---------- Public API ----------
  window.SimpleMapperCatalog = {
    list: function(){ return getActiveCatalog().slice(); },
    search: function(q){ var prevQ=DOM.query.value; DOM.query.value=String(q||''); runSearch(); DOM.query.value=prevQ; return LAST_RES.slice(); },
    applyWithRetry: function(req){ return withLock(function(){ return applyWithRetry(req); }); },
    applyByName: function(name, opts){ return withLock(function(){ return applyByName(name, opts); }); },
    applyAny: function(reqs, opts){ return withLock(function(){ return applyAny(reqs, opts); }); },
    refreshSF: function(){ importFromMemory(true); },
    sfOnly: function(on){ if(DOM.sfOnly){ DOM.sfOnly.checked=!!on; localStorage.setItem('sm:cat:sfonly', on?'on':'off'); runSearch(); } },
    strict: function(on){ if(DOM.strict){ DOM.strict.checked=!!on; localStorage.setItem('sm:cat:strict', on?'on':'off'); } },
    disableLS: function(on){ if(DOM.disableLS){ DOM.disableLS.checked=!!on; localStorage.setItem('sm:cat:disableLS', on?'on':'off'); loadFromLocal(); runSearch(); } }
  };

// === Fast preset name resolver (MSB/LSB/PG -> name) ===
(function(){
  function buildKey(msb,lsb,pg){ return (msb|0)+'\n'+(lsb|0)+'\n'+(pg|0); }
  var _IDX=null, _SIG='';
  function ensureIndex(){
    var list=getActiveCatalog();
    var sig='len:'+list.length;
    if(_IDX && _SIG===sig) return;
    _IDX=new Map();
    for(var i=0;i<list.length;i++){
      var it=list[i];
      _IDX.set(buildKey(it.bankMSB|0,it.bankLSB|0,it.program|0), String(it.name||''));
    }
    _SIG=sig;
  }
  function resolveName(msb,lsb,pg,opts){
    ensureIndex();
    var n=_IDX.get(buildKey(msb,lsb,pg));
    if(n) return n;
    // Optional: prefer sfont match if provided
    if(opts && opts.sfont){
      var q=String(opts.sfont).toLowerCase();
      var list=getActiveCatalog();
      for(var i=0;i<list.length;i++){
        var it=list[i];
        if((it.bankMSB|0)===(msb|0)&&(it.bankLSB|0)===(lsb|0)&&(it.program|0)===(pg|0)){
          if(String(it.sfont||'').toLowerCase().indexOf(q)!==-1) return it.name;
        }
      }
    }
    return null;
  }
  window.SimpleMapperCatalog.resolveName=resolveName;
  window.SimpleMapperCatalog.getInstrumentList=function(){ return getActiveCatalog().slice(); };

})()
})();
