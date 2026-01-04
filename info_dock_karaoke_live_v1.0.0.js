/*! karaoke_trivia_bg_v1.1.9.js
 * Sem • 2025-10-19
 *
 * Purpose: Background-only trivia overlay while karaoke is playing.
 *
 * Changes in v1.1.9 (from v1.1.8):
 *  - Slower default scroll (12 px/s) + gentle sine easing for smoothness.
 *  - Fade-in transition when new text renders.
 *  - Comprehensive copyright disclaimer appended at the end of text.
 *  - Control Center: tiny Disclaimer toggle; API to set/override disclaimer text.
 */

(function(){
  'use strict';

  var CFG = { zIndex:120, scrollPPS:12, wikiTimeout:2800, triviaMax:3800, enabled:false };
  var WIKI_BASE = 'https://en.wikipedia.org';

  var host=null, textBox=null; var scrollRAF=null, scrollLoopTmr=null; var __easeT=0;
  var __lastName = '';

  // ----- Themes (from v1.1.8) -----
  var THEMES = {
    cool: { label:'Cool Blue',  color:'#cfe2ff', glow:true },
    amber:{ label:'Warm Amber', color:'#ffd54f', glow:true },
    mono: { label:'Mono White', color:'#ffffff', glow:false }
  };

  // ----- Disclaimer -----
  var DEFAULT_DISCLAIMER = (
    'Disclaimer: This karaoke overlay shows informational summaries gathered from public sources. '+
    'All soundfonts, music tracks, MIDI files/sequences, and MIDI JavaScript libraries used here are the property of their respective owners. '+
    'No ownership is claimed over any audio content or musical compositions; materials are used solely for personal demonstration and testing. '+
    'If you are a rights holder and believe any material should not appear here, please notify the operator for prompt removal. '+
    'Where the overlay displays Wikipedia excerpts, those texts are available under the Creative Commons Attribution-ShareAlike (CC BY-SA) license (and may also be available under GFDL for older content).'
  );

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function lsGet(k, d){ try{ var v = localStorage.getItem(k); return (v==null)? d : v; }catch(_){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

  // ---------- Filename helpers ----------
  function stripExt(s){ if(!s) return ''; s=String(s).split('/').pop(); var i=s.lastIndexOf('.'); return (i>0)? s.slice(0,i): s; }
  function cleanNoise(s){ return String(s||'')
    .replace(/\s+/g,' ')
    .replace(/[_]+/g,' ')
    .replace(/[【】]/g,' ')
    // remove bracketed tokens that contain karaoke/instrumental/lyrics/official
    .replace(/[\[(][^\])]*(?:karaoke|instrumental|lyrics|official)[^\])]*[\])]/gi,' ')
    // remove numeric-only parentheses or brackets like (12345) or [12345]
    .replace(/(?:\(|\[])\s*\d+\s*(?:\)|\])/g, '')
    // strip trailing noise tags
    .replace(/\s*(official|lyrics|audio|video|instrumental|minus\s*one|karaoke|remix|cover|hd|hq)\b.*$/i,'')
    .replace(/\s{2,}/g,' ')
    .trim(); }
  function guessFromFilename(name){ var raw=cleanNoise(stripExt(name||'')); var artist='', title=''; if(raw.includes(' - ')){ var parts=raw.split(' - '); var left=parts[0].trim(), right=parts.slice(1).join(' - ').trim(); var rightLooksArtist=/\b(feat\.?|ft\.? )\b/i.test(right) || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(right) || /^[A-Z][\w'.&-]+$/.test(right); if(rightLooksArtist){ title=left; artist=right.replace(/\b(feat\.?|ft\.?)[^)]*$/i,'').trim(); } else { artist=left.replace(/\b(feat\.?|ft\.?)[^)]*$/i,'').trim(); title=right; } } else { title=raw; } return { title:title, artist:artist }; }

  function getCurrentFilename(){
    var name=(window.lastPlayed&&window.lastPlayed.name)?window.lastPlayed.name:(window.currentSong||'');
    return stripExt(name||'').trim();
  }

  function buildTitleArtistCandidates(){
    var name=(window.lastPlayed&&window.lastPlayed.name)?window.lastPlayed.name:(window.currentSong||'');
    var raw=cleanNoise(stripExt(name)); if(!raw) return [];
    var cands=[];
    if(raw.includes(' - ')){
      var parts=raw.split(' - '); var left=parts[0].trim(), right=parts.slice(1).join(' - ').trim();
      left  = left.replace(/(?:\(|\[])\s*\d+\s*(?:\)|\])/g, '').replace(/\s{2,}/g,' ').trim();
      right = right.replace(/(?:\(|\[])\s*\d+\s*(?:\)|\])/g, '').replace(/\s{2,}/g,' ').trim();
      cands.push({ title:right, artist:left });
      cands.push({ title:left, artist:right });
    } else {
      cands.push({ title:raw, artist:'' });
      cands.push({ title:'', artist:raw });
    }
    var g=guessFromFilename(name); var gt=String(g.title||'').trim(), ga=String(g.artist||'').trim();
    if(gt||ga) cands.push({ title:gt, artist:ga });
    var seen={}; var uniq=[]; cands.forEach(function(t){ var k=JSON.stringify([t.title,t.artist]); if(!seen[k]){ seen[k]=1; uniq.push(t);} });
    return uniq;
  }

  // ---------- Fetch helpers ----------
  function fetchTO(url, ms){ try{ var c=new AbortController(); var t=setTimeout(function(){ try{c.abort();}catch(_){ } }, ms||CFG.wikiTimeout); return fetch(url,{signal:c.signal}).finally(function(){ clearTimeout(t); }); }catch(_){ return Promise.resolve(null); } }
  function fetchTOjson(url, ms){ return fetchTO(url, ms).then(function(r){ if(!r||!r.ok) return null; return r.json().catch(function(){ return null; }); }); }
  function stripHtmlToText(html){ var tmp=document.createElement('div'); tmp.innerHTML=html||''; tmp.querySelectorAll('sup,table,style,script').forEach(function(n){ n.remove(); }); var text=tmp.textContent||''; return text.replace(/\n{3,}/g,'\n\n').trim(); }

  var PREF_SONG_SECTIONS=['Trivia','Background and composition','Background','Composition','Recording','Production','Release','Reception','Legacy'];
  var PREF_ARTIST_SECTIONS=['Background','History','Career','Biography','Reception','Legacy'];

  function fetchBestSectionIndex(title){ var u=WIKI_BASE+'/w/api.php?action=parse&format=json&origin=*'+'&prop=sections&page='+encodeURIComponent(title); return fetchTO(u,CFG.wikiTimeout).then(function(r){ if(!r||!r.ok) return null; return r.json().then(function(j){ var secs=j&&j.parse&&j.parse.sections||[]; if(!secs.length) return null; function findFrom(list){ for(var i=0;i<list.length;i++){ var t=list[i].toLowerCase(); var hit=secs.find(function(s){ return String(s.line||'').toLowerCase()===t; }); if(hit) return hit.index; } for(var k=0;k<list.length;k++){ var t2=list[k].toLowerCase(); var hit2=secs.find(function(s){ return String(s.line||'').toLowerCase().indexOf(t2)>=0; }); if(hit2) return hit2.index; } return null; } return findFrom(PREF_SONG_SECTIONS); }).catch(function(){ return null; }); }).catch(function(){ return null; }); }
  function fetchSectionText(title,index){ if(!index) return Promise.resolve(''); var u=WIKI_BASE+'/w/api.php?action=parse&format=json&origin=*'+'&prop=text&section='+encodeURIComponent(index)+'&page='+encodeURIComponent(title); return fetchTO(u,Math.max(CFG.wikiTimeout,3000)).then(function(r){ if(!r||!r.ok) return ''; return r.json().then(function(j){ var html=j&&j.parse&&j.parse.text&&j.parse.text['*']||''; var text=stripHtmlToText(html); return text; }).catch(function(){ return ''; }); }).catch(function(){ return ''; }); }
  function fetchLongExtract(title){ var u=WIKI_BASE+'/w/api.php?action=query&prop=extracts&format=json&origin=*'+'&explaintext=1&titles='+encodeURIComponent(title); return fetchTO(u,Math.max(CFG.wikiTimeout,3000)).then(function(r){ if(!r||!r.ok) return ''; return r.json().then(function(j){ var pages=j&&j.query&&j.query.pages||{}; var pid=Object.keys(pages)[0]; if(!pid) return ''; var full=pages[pid].extract||''; full=full.replace(/\n{3,}/g,'\n\n').trim(); return full; }).catch(function(){ return ''; }); }).catch(function(){ return ''; }); }

  function norm(s){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 '&]+/g,' ').replace(/\s{2,}/g,' ').trim(); }

  function wikipediaSearchBestSongTitle(title, artist){ var query=('"'+title+'" (song) '+(artist||'')).trim(); if(!query) return Promise.resolve(null); var u=WIKI_BASE+'/w/api.php?action=query&list=search&format=json&origin=*'+'&srsearch='+encodeURIComponent(query)+'&srlimit=12&srprop=snippet|titlesnippet'; return fetchTOjson(u,Math.max(CFG.wikiTimeout,3000)).then(function(j){ var arr=j&&j.query&&j.query.search||[]; if(!arr.length) return null; var nT=norm(title), nA=norm(artist||''); function score(hit){ var t=String(hit.title||''), s=String(hit.snippet||''); var nt=norm(t), ns=norm(s); var sc=0; if(/\bdisambiguation\b/i.test(t)) sc-=80; if(/\bsong\b|\bsingle\b/i.test(t)) sc+=50; if(nt===nT) sc+=60; if(nt.indexOf(nT)>=0) sc+=25; if(nA){ if(nt.indexOf(nA)>=0) sc+=20; if(ns.indexOf(nA)>=0) sc+=15; } return sc; } arr.sort(function(a,b){ return score(b)-score(a); }); return arr[0]&&arr[0].title||null; }); }

  function wikipediaSearchBestArtistTitle(artist){ var query=('"'+artist+'" (singer OR band OR musician OR group)'); var u=WIKI_BASE+'/w/api.php?action=query&list=search&format=json&origin=*'+'&srsearch='+encodeURIComponent(query)+'&srlimit=12&srprop=snippet|titlesnippet'; return fetchTOjson(u,Math.max(CFG.wikiTimeout,3000)).then(function(j){ var arr=j&&j.query&&j.query.search||[]; if(!arr.length) return null; var nA=norm(artist); function score(hit){ var t=String(hit.title||''), s=String(hit.snippet||''); var nt=norm(t), ns=norm(s); var sc=0; if(/\bdisambiguation\b/i.test(t)) sc-=60; if(/\b(singer|band|musician|group|rapper|artist)\b/i.test(t)) sc+=40; if(/\((singer|band|musician|group|rapper)\)/i.test(t)) sc+=40; if(nt===nA) sc+=50; if(nt.indexOf(nA)>=0) sc+=20; if(ns.indexOf(nA)>=0) sc+=15; return sc; } arr.sort(function(a,b){ return score(b)-score(a); }); return arr[0]&&arr[0].title||null; }); }

  // ---------- UI ----------
  function injectCSS(){ if(document.getElementById('ktBG-css')) return; var st=document.createElement('style'); st.id='ktBG-css'; st.textContent=[
    '#ktBGHost{position:fixed;left:16px;top:50%;transform:translateY(-50%);width:28vw;max-width:640px;min-width:280px;height:60vh;min-height:220px;display:none;pointer-events:none;z-index:'+CFG.zIndex+'}',
    '#ktBGBox{height:100%;background:transparent;display:flex;flex-direction:column;overflow:hidden;pointer-events:none}',
    '#ktBGText{padding:0 8px 0 6px;color:'+ (lsGet('ktbg.color','#cfe2ff')) +';font:14px/1.55 system-ui,Segoe UI,Arial,sans-serif;opacity:.92;overflow:hidden;white-space:pre-wrap;flex:1;transition:opacity .3s ease;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 5%,#000 95%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 5%,#000 95%,transparent 100%)}',
    '#ktBGHost.glow #ktBGText{text-shadow:0 0 6px rgba(0,0,0,.55)}',
    '.ktbg-row{display:flex;align-items:center;gap:8px}',
    '.ktbg-row .label{min-width:110px;opacity:.9}',
    '.ktbg-row .small{display:flex;align-items:center;gap:6px}'
  ].join('\n');
    document.head.appendChild(st);
  }

  function ensureDOM(){ if(host) return host; injectCSS(); host=document.createElement('div'); host.id='ktBGHost'; host.innerHTML='<div id="ktBGBox"><div id="ktBGText"></div></div>'; document.body.appendChild(host); textBox=document.getElementById('ktBGText');
    if (lsGet('ktbg.glow','0')==='1') host.classList.add('glow');
    var zi = parseInt(lsGet('ktbg.z', String(CFG.zIndex)),10); if(!isNaN(zi)){ CFG.zIndex=zi; host.style.zIndex=String(zi); }
    var sp = parseFloat(lsGet('ktbg.scroll', String(CFG.scrollPPS))); if(!isNaN(sp)){ CFG.scrollPPS=clamp(sp,6,80); }
    return host; }

  // ---------- Scroll (slower + smooth easing) ----------
  function stopScroll(){ if(scrollRAF){ cancelAnimationFrame(scrollRAF); scrollRAF=null; } if(scrollLoopTmr){ clearTimeout(scrollLoopTmr); scrollLoopTmr=null; } if(textBox) textBox.scrollTop=0; __easeT=0; }
  function restartScroll(){ stopScroll(); if(!textBox) return; var overflow=textBox.scrollHeight-textBox.clientHeight; if(overflow<=2) return; var last=performance.now();
    function step(now){ var dt=(now-last)/1000; last=now; __easeT += dt; var ease = 0.85 + 0.15*Math.sin(__easeT*0.8); // gentle sine modulation
      textBox.scrollTop += (CFG.scrollPPS * ease * dt);
      if (textBox.scrollTop >= overflow - 1){ scrollLoopTmr = setTimeout(function(){ textBox.scrollTop = 0; last = performance.now(); __easeT=0; scrollRAF = requestAnimationFrame(step); }, 1400); return; }
      scrollRAF = requestAnimationFrame(step);
    }
    scrollRAF = requestAnimationFrame(step);
  }

  // ---------- Pipelines ----------
  function trySongPair(T,A,done){ if(!T){ done(false); return; }
    fetchBestSectionIndex(T+' (song)').then(function(idx){ if(idx){ fetchSectionText(T+' (song)', idx).then(function(txt){ if(txt&&txt.trim()){ render(txt); done(true);} else step2(); }); } else step2(); });
    function step2(){ if(!A){ step3(); return; } var page=T+' ('+A.replace(/\s+/g,' ').trim()+' song)'; fetchBestSectionIndex(page).then(function(idx){ if(idx){ fetchSectionText(page, idx).then(function(txt){ if(txt&&txt.trim()){ render(txt); done(true);} else step3(); }); } else step3(); }); }
    function step3(){ fetchBestSectionIndex(T).then(function(idx){ if(idx){ fetchSectionText(T, idx).then(function(txt){ if(txt&&txt.trim()){ render(txt); done(true);} else step4(); }); } else step4(); }); }
    function step4(){ wikipediaSearchBestSongTitle(T,A).then(function(best){ if(!best){ step5(); return; } fetchBestSectionIndex(best).then(function(idx){ if(idx){ fetchSectionText(best, idx).then(function(txt){ if(txt&&txt.trim()){ render(txt); done(true);} else step5best(best); }); } else step5best(best); }); }); }
    function step5best(best){ fetchLongExtract(best).then(function(full){ if(full&&full.trim()){ render(full); done(true);} else step5(); }); }
    function step5(){ fetchLongExtract(T).then(function(full){ render(full||''); done(!!full); }); }
  }

  function tryArtistOnly(A,done){ if(!A){ done(false); return; } var a=A.replace(/\s+/g,' ').trim(); var page1=a+' (band)'; var page2=a+' (singer)';
    fetchArtistSections(page1, function(ok){ if(ok){ done(true); return; } fetchArtistSections(page2, function(ok2){ if(ok2){ done(true); return; } wikipediaSearchBestArtistTitle(a).then(function(best){ if(!best){ done(false); return; } fetchArtistSections(best, function(ok3){ if(ok3){ done(true); } else { fetchLongExtract(best).then(function(full){ render(full||''); done(!!full); }); } }); }); }); });
  }

  function fetchArtistSections(title, cb){ if(!title){ cb(false); return; } var u=WIKI_BASE+'/w/api.php?action=parse&format=json&origin=*'+'&prop=sections&page='+encodeURIComponent(title); fetchTO(u,CFG.wikiTimeout).then(function(r){ if(!r||!r.ok){ cb(false); return; } r.json().then(function(j){ var secs=j&&j.parse&&j.parse.sections||[]; if(!secs.length){ cb(false); return; } var idx=null; for(var i=0;i<PREF_ARTIST_SECTIONS.length;i++){ var t=PREF_ARTIST_SECTIONS[i].toLowerCase(); var hit=secs.find(function(s){ return String(s.line||'').toLowerCase()===t; }); if(hit){ idx=hit.index; break; } } if(idx==null){ for(var k=0;k<PREF_ARTIST_SECTIONS.length;k++){ var t2=PREF_ARTIST_SECTIONS[k].toLowerCase(); var hit2=secs.find(function(s){ return String(s.line||'').toLowerCase().indexOf(t2)>=0; }); if(hit2){ idx=hit2.index; break; } } } if(idx==null){ cb(false); return; } fetchSectionText(title, idx).then(function(txt){ if(txt&&txt.trim()){ render(txt); cb(true); } else { cb(false); } }); }).catch(function(){ cb(false); }); }).catch(function(){ cb(false); }); }

  // ---------- Render (fade-in + disclaimer) ----------
  function withDisclaimer(text){ var on = lsGet('ktbg.disclaimer','1')==='1'; var msg = lsGet('ktbg.disclaimer.text', DEFAULT_DISCLAIMER);
    var joined = on ? (String(text||'').trim() + (text? '\n\n' : '') + msg) : String(text||'');
    if (joined.length > CFG.triviaMax) joined = joined.slice(0, CFG.triviaMax - 1) + '…';
    return joined; }

  function render(txt){ if(!textBox) return;
    textBox.style.opacity = '0';
    var finalText = withDisclaimer(txt);
    textBox.textContent = finalText;
    // next frame → fade to target opacity
    requestAnimationFrame(function(){ textBox.style.opacity = '0.92'; });
    restartScroll(); }

  // ---------- Overlay control ----------
  function updateContent(){ if(!host||!textBox) return; textBox.textContent='Fetching trivia…'; textBox.style.opacity='0.5';
    var pairs=buildTitleArtistCandidates(); if(!pairs.length){ render(''); return; }
    var i=0; function next(){ if(i>=pairs.length){ render(''); return; } var T=pairs[i].title, A=pairs[i].artist; i++;
      if(T){ trySongPair(T,A,function(ok){ if(ok) return; if(A && !T){ tryArtistOnly(A, function(okA){ if(okA) return; next(); }); } else { next(); }
      }); }
      else if(A){ tryArtistOnly(A, function(ok){ if(ok) return; next(); }); }
      else { next(); }
    } next(); }

  function show(){ ensureDOM(); host.style.display='block'; updateContent(); }
  function hide(){ if(!host) return; host.style.display='none'; stopScroll(); }

  // ---------- UI wiring ----------
  function addCCToggle(){ var cc=document.getElementById('ccPanel'); if(!cc) return; var list=cc.querySelector('.list'); if(!list) return; if(document.getElementById('ktBG-toggle')) return; var row=document.createElement('div'); row.className='row ktbg-row';
    var themeKey = lsGet('ktbg.theme','cool'); if(!THEMES[themeKey]) themeKey='cool';
    row.innerHTML=''
      + '<span class="label">Trivia (BG)</span>'
      + '<label class="small"><input type="checkbox" id="ktBG-toggle"> Enable</label>'
      + '<label class="small">Color <input type="color" id="ktBG-color" value="'+ (lsGet('ktbg.color', THEMES[themeKey].color)) +'"/></label>'
      + '<label class="small">Theme '
      + '  <select id="ktBG-theme">'
      +       Object.keys(THEMES).map(function(k){ var t=THEMES[k]; var sel=(k===themeKey)?' selected':''; return '<option value="'+k+'"'+sel+'>'+t.label+'</option>'; }).join('')
      + '  </select>'
      + '</label>'
      + '<label class="small"><input type="checkbox" id="ktBG-disc"> Disclaimer</label>'
      + '<span class="small" style="opacity:.7">Center-left overlay</span>';
    list.appendChild(row);

    var chk=row.querySelector('#ktBG-toggle');
    var persistedEnabled = lsGet('ktbg.enabled','0')==='1'; CFG.enabled = persistedEnabled; chk.checked=!!CFG.enabled;
    chk.addEventListener('change', function(){ CFG.enabled=!!chk.checked; lsSet('ktbg.enabled', CFG.enabled? '1':'0'); if (CFG.enabled) show(); else hide(); });

    var col=row.querySelector('#ktBG-color'); col.addEventListener('input', function(){ setColor(col.value); });

    var sel=row.querySelector('#ktBG-theme'); sel.addEventListener('change', function(){ applyTheme(sel.value); var th = THEMES[lsGet('ktbg.theme','cool')]||THEMES.cool; col.value = lsGet('ktbg.color', th.color); });

    var dchk=row.querySelector('#ktBG-disc'); dchk.checked = (lsGet('ktbg.disclaimer','1')==='1');
    dchk.addEventListener('change', function(){ lsSet('ktbg.disclaimer', dchk.checked? '1':'0'); updateContent(); });
  }

  function hookStatus(){ if(typeof window.setStatus!=='function') return; if(window.__origSetStatusKTBG_v1_1_9) return; window.__origSetStatusKTBG_v1_1_9=window.setStatus; window.setStatus=function(msg){ try{ window.__origSetStatusKTBG_v1_1_9 && window.__origSetStatusKTBG_v1_1_9(msg); }catch(_){ } try{
      if (String(msg).toUpperCase()==='PLAYING'){
        var nm = getCurrentFilename(); if (nm && nm !== __lastName){ __lastName = nm; lsSet('ktbg.last', __lastName); }
        if (CFG.enabled){ if (host && host.style.display!=='none') updateContent(); }
      }
    }catch(_){ } };
  }

  // ---------- Icing API ----------
  function setColor(hex){ ensureDOM(); var c = String(hex||'').trim(); if (!c) return; if (c[0] !== '#') c = '#' + c; if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return; textBox.style.color = c; lsSet('ktbg.color', c); }
  function setGlow(on){ ensureDOM(); if (on) host.classList.add('glow'); else host.classList.remove('glow'); lsSet('ktbg.glow', on? '1':'0'); }
  function applyTheme(name){ var t = THEMES[name] || THEMES.cool; lsSet('ktbg.theme', name); setColor(t.color); setGlow(!!t.glow); }
  function setDisclaimer(on){ lsSet('ktbg.disclaimer', on? '1':'0'); updateContent(); }
  function setDisclaimerText(txt){ lsSet('ktbg.disclaimer.text', String(txt||'').trim() || DEFAULT_DISCLAIMER); updateContent(); }

  // ---------- Public API ----------
  window.kTriviaBG = {
    enable:function(){ CFG.enabled=true; lsSet('ktbg.enabled','1'); show(); },
    disable:function(){ CFG.enabled=false; lsSet('ktbg.enabled','0'); hide(); },
    show: show,
    hide: hide,
    refresh: updateContent,
    setZIndex: function(z){ z=parseInt(z,10)||CFG.zIndex; CFG.zIndex=z; if (host) host.style.zIndex=String(z); lsSet('ktbg.z', String(CFG.zIndex)); },
    setScrollSpeed: function(pxps){ CFG.scrollPPS=clamp(parseFloat(pxps||12)||12, 6, 80); lsSet('ktbg.scroll', String(CFG.scrollPPS)); restartScroll(); },
    setGlow: setGlow,
    setColor: setColor,
    applyTheme: applyTheme,
    setDisclaimer: setDisclaimer,
    setDisclaimerText: setDisclaimerText
  };

  // ---------- Init ----------
  onReady(function(){
    ensureDOM();
    CFG.enabled = lsGet('ktbg.enabled','0')==='1';
    __lastName = lsGet('ktbg.last','');
    var themeKey = lsGet('ktbg.theme','cool'); if(!THEMES[themeKey]) themeKey='cool';
    applyTheme(themeKey);
    var persistedColor = lsGet('ktbg.color',''); if (persistedColor) setColor(persistedColor);
    if (lsGet('ktbg.disclaimer', '1')!=='1') lsSet('ktbg.disclaimer','1');
    if (!lsGet('ktbg.disclaimer.text','')) lsSet('ktbg.disclaimer.text', DEFAULT_DISCLAIMER);

    addCCToggle();
    hookStatus();
    if (CFG.enabled) show();
  });
})();
