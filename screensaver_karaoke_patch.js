/*! screensaver_karaoke_panel_display_only_v3.4.10.js
 * Sem • 2025-10-18 (fixed regex edition)
 *
 * Pure Wikipedia + Wild Search Mode + Wikidata fallback (cross-language).
 *  - Phrase-first queries (no n-grams; no stopword drops).
 *  - If nothing found: resolve via Wikidata (QID → sitelink → exact title) and fetch summary.
 *  - Long-form "Trivia" section (Background/Composition/Release/Reception/Legacy…), else long extract.
 *  - Auto-scrolls wiki text when overflowing; no clickable links in wiki area.
 *
 * Branding/UI:
 *  - Header: "KaraokeHD" + version + tagline
 *  - Thumbnail: always show logo.jpg (project root) when no art (never hides)
 *  - Rotation: Phase B (60s topic rotation) → Phase A (random song per minute)
 *
 * Notes in this build:
 *  - Fixed all regexes that accidentally used "$$" to denote parentheses. Replaced with proper \( \) or character classes.
 *  - Tightened badSuffix checks to \b boundaries.
 *  - Kept your behavior intact; no functional flow changes beyond bug fixes.
 */

(function(){
  // ---------- Branding ----------
  var KHD_NAME    = 'KaraokeHD';
  var KHD_VERSION = (typeof window.KHD_VERSION==='string' && window.KHD_VERSION.trim()) ? window.KHD_VERSION.trim() : 'v3.4.10';
  var KHD_TAGLINE = (typeof window.KHD_TAGLINE==='string' && window.KHD_TAGLINE.trim()) ? window.KHD_TAGLINE.trim() : '';
  var LOGO_PATH   = (typeof window.KHD_LOGO   ==='string' && window.KHD_LOGO.trim())    ? window.KHD_LOGO.trim()    : 'logo.jpg';

  // ---------- Config ----------
  var COVERS_BASE = null;                 // optional covers base folder
  var WIKI_TIMEOUT_MS  = 2400;            // wiki calls
  var THUMB_TIMEOUT_MS = 1500;            // thumbnail calls
  var WIKI_MAX_CHARS   = 900;             // normal summary cap
  var TRIVIA_MAX_CHARS = 3200;            // long-form cap
  var WIKI_SCROLL_PPS  = 22;              // auto-scroll speed

  // Rotation
  var B_PHASE_MS = 60000, B_STEP_MS = 12000, A_STEP_MS = 60000;

  // Wikipedia language
  var WIKI_LANG = (typeof window.WIKI_LANG==='string' && window.WIKI_LANG.trim()) ? window.WIKI_LANG.trim() : 'en';
  var WIKI_BASE = 'https://' + WIKI_LANG + '.wikipedia.org';

  // Wild Search Mode
  var WILD_SEARCH = (typeof window.WILD_SEARCH==='string' ? window.WILD_SEARCH : 'on'); // 'on' | 'off'
  var WILD_Q      = clamp(parseInt(window.WILD_Q || 5,10), 1, 8);  // # of query variants
  var WILD_TOP    = clamp(parseInt(window.WILD_TOP || 10,10), 5, 20); // per-query result cap

  // ---------- Helpers ----------
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[c]); }
  function stemFromPath(p){ try{ var fn=String(p||'').split('/').pop(); return fn? fn.replace(/\.[^.]+$/,'') : ''; }catch(_){ return ''; } }
  function pickRandom(arr){ if(!arr||!arr.length) return null; return arr[(Math.random()*arr.length)|0]; }

  if (!window.CSS || typeof CSS.escape!=='function'){
    window.CSS=(window.CSS||{});
    CSS.escape=function(s){ return String(s).replace(/([^\w-])/g,'\\$1'); };
  }

  // ---------- Settings (persist) ----------
  var ssEnable   = (localStorage.getItem('ssEnable')    || 'on')==='on';
  var ssDelayMin = clamp(parseInt(localStorage.getItem('ssDelayMin')||'2',10)||2, 1, 60);
  var ssSpeed    = clamp(parseFloat(localStorage.getItem('ssSpeed')   ||'22')||22, 6, 80);
  var ssMode     = (localStorage.getItem('ssMode')      || 'panel');
  var ssBlur     = clamp(parseInt(localStorage.getItem('ssBlur')      ||'8',10)||8, 0, 20);
  var ssOpacity  = clamp(parseFloat(localStorage.getItem('ssOpacity') ||'0.65')||0.65, 0.35, 0.95);
  var ssInteract = (localStorage.getItem('ssInteract')  || 'interactive');

  // ---------- State ----------
  var tIdle=null, host=null, box=null, view=null, track=null, track2=null;
  var ssArtWrap=null, ssArtImg=null, ssTitleEl=null, ssArtistEl=null, ssFactsEl=null, ssWikiEl=null, ssWikiTopicEl=null, ssWikiBox=null;

  var wikiTimer = null, phaseTimer = null, currentPhase = 'B', ssSessionPick = null, wikiKeyIdx = 0;
  var wikiScrollRAF = null, wikiScrollLoopTmr = null;

  // ---------- CSS ----------
  function injectCSS(){
    if ($('ssp-css-v3-4-10')) return;
    var st=document.createElement('style'); st.id='ssp-css-v3-4-10';
    st.textContent = [
      '#ssHost{position:fixed;inset:0;z-index:350;display:none;}',
      '#ssHost.panel{display:block;}',
      '#ssBox{--ssBlur:'+ssBlur+'px;--ssOpacity:'+ssOpacity+';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1000px,92vw);height:min(78vh,92vh);background:rgba(0,0,0,var(--ssOpacity));backdrop-filter:blur(var(--ssBlur));-webkit-backdrop-filter:blur(var(--ssBlur));border-radius:14px;border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 44px rgba(0,0,0,.38);display:flex;flex-direction:column;overflow:hidden;}',
      '#ssHost.full #ssBox{left:0;top:0;transform:none;width:100vw;height:100vh;border-radius:0;}',
      '#ssHead{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(17,17,17,.45);border-bottom:1px solid rgba(255,255,255,.08)}',
      '#ssTitleBar{font-weight:800;letter-spacing:.02em;color:#bfe5ff}',
      '#ssHint{color:#a9b5c2;font:12px/1.2 system-ui}',
      '#ssCenter{display:grid;grid-template-columns:160px 1fr;gap:16px;align-items:start;padding:16px 18px 8px;}',
      '#ssArtWrap{width:160px;height:160px;border-radius:12px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.1)}',
      '#ssArt{width:100%;height:100%;object-fit:cover;display:block}',
      '#ssMeta{min-width:0;display:flex;flex-direction:column;gap:8px;}',
      '#ssTitleLine{font-weight:800;color:#eaf4ff;line-height:1.15;font-size:clamp(18px,3.8vw,34px);text-wrap:balance;text-shadow:0 1px 2px rgba(0,0,0,.5)}',
      '#ssArtistLine{color:#d4e8ff;opacity:.92;font:600 clamp(14px,2.2vw,18px)/1.2 system-ui}',
      '#ssFacts{display:flex;flex-wrap:wrap;gap:6px}',
      '.fact{font:600 12px/1 system-ui;color:#1b2430;background:#ffffff;opacity:.9;border-radius:999px;padding:.32em .6em}',
      '#ssWikiBox{padding:0 18px 10px;color:#cfe2ff;font:14px/1.5 system-ui;max-height:min(28vh,420px);overflow:hidden;text-wrap:pretty;pointer-events:none}',
      '#ssWikiTopic{display:inline-block;margin:0 0 6px 0}',
      '#ssView{position:relative;flex:1 1 auto;overflow:hidden;background:transparent;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 6%,#000 94%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 6%,#000 94%,transparent 100%)}',
      '#ssTrack,#ssTrack2{position:absolute;left:0;right:0;will-change:transform}',
      '.ssRow{display:flex;gap:12px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)}',
      '.ssIdx{width:3.5em;text-align:right;color:#9fb6c9;font:12px/1.2 monospace}',
      '.ssName{flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media (max-width:720px){#ssCenter{grid-template-columns:1fr}#ssArtWrap{width:128px;height:128px}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- DOM ----------
  function ensureDOM(){
    if (host) return host;
    injectCSS();
    host = document.createElement('div'); host.id='ssHost';
    host.innerHTML =
      '<div id="ssBox">'
    + '  <div id="ssHead"><div id="ssTitleBar"></div><div id="ssHint">Any key = Close • Idle starts after delay</div></div>'
    + '  <div id="ssCenter">'
    + '    <div id="ssArtWrap"><img id="ssArt" alt=""></div>'
    + '    <div id="ssMeta">'
    + '      <div id="ssTitleLine"></div>'
    + '      <div id="ssArtistLine"></div>'
    + '      <div id="ssFacts"></div>'
    + '    </div>'
    + '  </div>'
    + '  <div id="ssWikiBox"><span id="ssWikiTopic" class="fact" style="display:none"></span><div id="ssWikiText"></div></div>'
    + '  <div id="ssView"><div id="ssTrack"></div><div id="ssTrack2"></div></div>'
    + '</div>';
    document.body.appendChild(host);

    box = $('ssBox'); view = $('ssView'); track = $('ssTrack'); track2 = $('ssTrack2');
    ssArtWrap = $('ssArtWrap'); ssArtImg = $('ssArt'); ssTitleEl = $('ssTitleLine');
    ssArtistEl = $('ssArtistLine'); ssFactsEl = $('ssFacts');
    ssWikiBox = $('ssWikiBox'); ssWikiEl = $('ssWikiText'); ssWikiTopicEl = $('ssWikiTopic');

    applyBranding();
    try{ showArt(LOGO_PATH); }catch(_){ }
    return host;
  }

  function applyBranding(){
    var bar = $('ssTitleBar'); if (!bar) return;
    var header = '🎤 ' + KHD_NAME + ' ' + KHD_VERSION + (KHD_TAGLINE ? (' — ' + KHD_TAGLINE) : '');
    bar.textContent = header;
  }

  // ---------- Utilities ----------
  function isVisible(){ return !!(host && host.style.display!=='none' && host.classList.contains('panel')); }

  // ---------- Playlist ----------
  function collectSongs(){
    var list = document.getElementById('playlist');
    if (!list) return [];
    var rows = list.querySelectorAll('.row a.song');
    if (!rows || !rows.length) return [];
    var out=[];
    rows.forEach(function(a){
      var row = a.closest('.row');
      if (row && row.style && row.style.display==='none') return;
      var name=(a.textContent||'').trim();
      var path=a.getAttribute('data-path')||'';
      if(!name) return;
      var hint = a.getAttribute('data-thumb') || a.getAttribute('data-cover') ||
                 (row && (row.querySelector('img[data-thumb], img.cover, img.thumb, img')?.src || null));
      out.push({ name:name, path:path, thumb:hint });
    });
    return out;
  }

  // ---------- Filename / title parsing ----------
  var NOISE_WORDS = [
    'official video','official audio','official lyric','lyric video','lyrics','karaoke','instrumental','minus one',
    'remastered','audio','video','mv','hd','1080p','720p','cover','ver.','version','live','performance','music video'
  ];

  // Keep () for artist detection; strip [] and {}
  var BRACKET_RX = /(\[[^\]]*\]|\{[^}]*\})/g;

  // Remove ANY (...) containing a digit; drop trailing numeric token; normalize spaces.
  function stripNumericNoise(s){
    return String(s||'')
      .replace(/\s*\([^)]*\d[^)]*\)\s*/g, ' ')   // e.g., (218888), (1999), (Live 2012), (v2)
      .replace(/[\s_\-]*\b\d+\b\s*$/,'')         // trailing lone numeric token
      .replace(/\s{2,}/g,' ')
      .trim();
  }

  function cleanNameForSearch(s){
    var x = String(s||'')
      .replace(BRACKET_RX, ' ')
      .replace(/[_]+/g, ' ')        // underscores → spaces
      .replace(/\s+/g, ' ')
      .trim();

    x = x.replace(/\s*-\s*(official|audio|video|lyrics?|karaoke|instrumental)\b/ig, ' ');

    var lowered = x.toLowerCase();
    NOISE_WORDS.forEach(function(w){
      var rx=new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','ig');
      lowered = lowered.replace(rx,' ');
    });
    x = lowered.replace(/\s+/g,' ').trim();

    // Drop numeric tails
    x = stripNumericNoise(x);

    return x;
  }

  function parseArtistTitleFromName(s){
    // Normalize (keep parentheses for artist detection)
    var raw = String(s||'')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove numeric/noisy parentheses right away
    raw = stripNumericNoise(raw);

    // Parentheses we never treat as artist
    var NOISE_PAREN = /(official|lyrics?|lyric video|audio|video|karaoke|instrumental|minus\s*one|remix|cover|live|version|ver\.?|remastered|hd|hq|mv|ost|soundtrack)/i;

    // Artist heuristics: letters-only, no digits, not a noise tag
    function looksArtist(str){
      var x = (str||'').trim();
      if (!x) return false;
      if (/\d/.test(x)) return false;             // block any digits
      if (!/[A-Za-z]/.test(x)) return false;      // must have letters
      if (NOISE_PAREN.test(x)) return false;      // block noise tags

      // obvious artist patterns
      if (/\b(feat\.?|ft\.?)\b/i.test(x)) return true;
      if (/[,&]/.test(x)) return true;
      if (/\band\b/i.test(x)) return true;

      // title-ish tokens
      if (/\b(remix|edit|mix|version|single|song)\b/i.test(x)) return false;

      var capWords = (x.match(/\b[A-Z][a-z]+/g) || []).length;
      if (capWords >= 2) return true;            // e.g., "Jose Mari Chan"
      if (/^[A-Za-z][A-Za-z .'-]{3,}$/.test(x)) return true; // e.g., "Madonna"
      return false;
    }

    // Case 1: hyphen-like separators present
    var sep = null; [' — ',' – ',' - '].some(function(t){ if (raw.indexOf(t)>=0){ sep=t; return true; } return false; });
    if (sep){
      var parts = raw.split(sep).map(function(p){ return p.trim(); });
      var left  = parts[0] || '';
      var right = parts.slice(1).join(' '+sep.trim()+' ') || '';

      // Unwrap "(Artist)" on the right if present
      var rightBare = right.replace(/^\((.+)\)$/,'$1').trim();

      var rightLooksArtist = looksArtist(rightBare);
      var leftLooksArtist  = looksArtist(left);

      if (rightLooksArtist && !leftLooksArtist){
        var artist = stripNumericNoise(rightBare);
        var title  = stripNumericNoise(left).replace(/\s*\([^)]*\)\s*$/,'').trim();
        return { artist: artist, title: title };
      } else if (leftLooksArtist && !rightLooksArtist){
        var artist = stripNumericNoise(left);
        var title  = stripNumericNoise(right).replace(/\s*\([^)]*\)\s*$/,'').trim();
        return { artist: artist, title: title };
      } else {
        // Ambiguous: prefer side that looks less like title suffix
        var rightLooksTitle = /\b(remix|mix|edit|radio|acoustic|version|single|song)\b/i.test(right);
        return rightLooksTitle
          ? { artist: stripNumericNoise(left),  title: stripNumericNoise(right).replace(/\s*\([^)]*\)\s*$/,'').trim() }
          : { artist: stripNumericNoise(rightBare), title: stripNumericNoise(left).replace(/\s*\([^)]*\)\s*$/,'').trim() };
      }
    }

    // Case 2: no hyphen → trailing "(Artist)" (letters only, no digits)
    var m = raw.match(/\(([^()]+)\)\s*$/);
    if (m){
      var tail = m[1].trim();
      if (!/\d/.test(tail) && !NOISE_PAREN.test(tail) && looksArtist(tail)){
        var title  = stripNumericNoise(raw.replace(/\([^()]+\)\s*$/, '').trim());
        var artist = stripNumericNoise(tail);
        return { artist: artist, title: title };
      }
    }

    // Fallback: treat all as title
    return { title: stripNumericNoise(raw), artist: '' };
  }

  // ---------- Local meta ----------
  function getLocalMeta(){
    var si={};
    try{ if(window.SongInfo && typeof SongInfo.getCurrent==='function') si = SongInfo.getCurrent()||{}; }catch(_){ }
    si.title       = si.title       || window.nowTitle  || window.nowPlayingTitle || '';
    si.artist      = si.artist      || window.nowArtist || window.nowPlayingArtist || '';
    si.album       = si.album       || window.nowAlbum  || '';
    si.year        = si.year        || window.nowYear   || '';
    si.genre       = si.genre       || window.nowGenre  || '';
    si.label       = si.label       || window.nowLabel  || '';
    si.country     = si.country     || window.nowCountry|| '';
    si.trackNumber = si.trackNumber || window.nowTrackNo|| null;
    si.trackCount  = si.trackCount  || window.nowTrackCount || null;
    si.bpm         = si.bpm         || window.nowBPM    || null;
    si.key         = si.key         || window.nowKey    || '';
    var d=null;
    try{ if (typeof window.songDurationSec==='number') d=Math.floor(window.songDurationSec);}catch(_){ }
    try{ if (typeof window.songDurationMs==='number') d=Math.floor(window.songDurationMs/1000);}catch(_){ }
    try{ if (typeof window.totalMs==='number')        d=Math.floor(window.totalMs/1000);}catch(_){ }
    si.durationSec = d;
    return si;
  }
  function fmtDur(sec){ if(sec==null) return ''; sec=Math.max(0,sec|0); var h=sec/3600|0,m=(sec%3600)/60|0,s=sec%60; var mm=h?String(m).padStart(2,'0'):String(m), ss=String(s).padStart(2,'0'); return h?(`${h}:${mm}:${ss}`):(`${mm}:${ss}`); }

  // ---------- Facts (local + Wikidata merge) ----------
  function mergeAndRenderFacts(localFacts, wd){
    var facts = [];
    if (localFacts.album)                        facts.push(['Album', localFacts.album]);
    if (localFacts.year)                         facts.push(['Year',  localFacts.year]);
    if (localFacts.genre)                        facts.push(['Genre', localFacts.genre]);
    if (localFacts.label)                        facts.push(['Label', localFacts.label]);
    if (localFacts.country)                      facts.push(['Country', localFacts.country]);
    if (localFacts.trackNumber && localFacts.trackCount) facts.push(['Track',  localFacts.trackNumber+' / '+localFacts.trackCount]);
    else if (localFacts.trackNumber)             facts.push(['Track',  String(localFacts.trackNumber)]);
    if (localFacts.bpm)                          facts.push(['Tempo',  localFacts.bpm+' BPM']);
    if (localFacts.key)                          facts.push(['Key',    localFacts.key]);
    if (localFacts.durationSec!=null)            facts.push(['Duration', fmtDur(localFacts.durationSec)]);
    if (wd){
      function lacks(name){ return !facts.some(f=>f[0]===name); }
      if (wd.album && lacks('Album'))        facts.push(['Album', wd.album]);
      if (wd.label && lacks('Label'))        facts.push(['Label', wd.label]);
      if (wd.genre && lacks('Genre'))        facts.push(['Genre', wd.genre]);
      if (wd.release && lacks('Released'))   facts.push(['Released', wd.release]);
      if (wd.length && lacks('Duration')) { var sec=parseInt(wd.length,10); if(!isNaN(sec)) facts.push(['Duration', fmtDur(sec)]); }
      if (wd.composer) facts.push(['Composer', wd.composer]);
      if (wd.lyricist) facts.push(['Lyricist', wd.lyricist]);
    }
    ssFactsEl.innerHTML = facts.map(function(f){ return '<span class="fact">'+esc(f[0]+': '+f[1])+'</span>'; }).join('');
  }
  function renderAllFacts(meta, qid){
    if (!qid){ mergeAndRenderFacts(meta, null); return; }
    fetchWikidataFacts(qid).then(function(wd){ mergeAndRenderFacts(meta, wd); });
  }

  // ---------- Fetch with timeout ----------
  function fetchTO(url, ms){
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function(){ try{ ctrl.abort(); }catch(_){ } }, ms || WIKI_TIMEOUT_MS);
      return fetch(url, { signal: ctrl.signal }).finally(function(){ clearTimeout(t); });
    } catch(_){ return Promise.resolve(null); }
  }

  // ---------- Derive title/artist ----------
  function deriveTitleArtist(pick, meta){
    var fromName = pick?.name ? parseArtistTitleFromName(pick.name) : { title:'', artist:'' };
    var stem  = pick?.path ? stemFromPath(pick.path) : '';
    if (!fromName.title && stem){
      var guess = parseArtistTitleFromName(stem.replace(/[_\.]+/g,' '));
      fromName.title  = guess.title  || fromName.title;
      fromName.artist = guess.artist || fromName.artist;
    }
    var title  = (meta?.title  || fromName.title  || stem || 'Now Playing').trim();
    var artist = (meta?.artist || fromName.artist || '').trim();

    // Final scrub: underscores → spaces, numeric tags removed
    title  = stripNumericNoise(title).replace(/[_\.]+/g,' ').trim();
    artist = stripNumericNoise(artist).replace(/[_\.]+/g,' ').trim();

    return { title, artist };
  }

  // ---------- Wikipedia helpers ----------
  function parseWikiSummaryJson(j){
    if (!j) return '';
    var text = j.extract || '';
    if (!text && j.extract_html){ var tmp=document.createElement('div'); tmp.innerHTML=j.extract_html; text = tmp.textContent || ''; }
    text = String(text||'').trim(); if (!text) return '';
    var para = text.split(/\n{2,}/)[0].trim();
    return (para.length > WIKI_MAX_CHARS) ? (para.slice(0, WIKI_MAX_CHARS-1)+'…') : para;
  }

  // Summary object: { text, title, url, type, qid, description }
  function wikiSummaryByKey(key){
    var u = WIKI_BASE + '/api/rest_v1/page/summary/' + encodeURIComponent(key);
    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return { text:'', title:key||'', url:'', type:'', qid:'', description:'' };
      return r.json().then(function(j){
        var text = parseWikiSummaryJson(j);
        var title = (j && (j.titles?.normalized || j.title)) || key || '';
        var url   = (j && j.content_urls?.desktop?.page) || '';
        var type  = (j && j.type) || '';
        var qid   = (j && j.wikibase_item) || '';
        var desc  = (j && j.description) || '';
        return { text:text, title:title, url:url, type:type, qid:qid, description:desc };
      }).catch(function(){ return { text:'', title:key||'', url:'', type:'', qid:'', description:'' }; });
    }).catch(function(){ return { text:'', title:key||'', url:'', type:'', qid:'', description:'' }; });
  }

  function wikiSearchBasic(query, limit){
    var u = WIKI_BASE + '/w/api.php?action=query&list=search&format=json&origin=*'
          + '&srsearch=' + encodeURIComponent(query)
          + '&srlimit=' + clamp(limit||10,1,50)
          + '&srprop=snippet%7Ctitlesnippet';
    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return [];
      return r.json().then(function(j){
        return j && j.query && j.query.search || [];
      }).catch(function(){ return []; });
    }).catch(function(){ return []; });
  }

  // Pick best page title from MediaWiki search results
  function wikiSearchBestTitle(query, topicLabel, artist){
    if (!query) return Promise.resolve(null);

    return wikiSearchBasic(query, 10).then(function(arr){
      if (!arr || !arr.length) return null;

      var norm = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
      var base = norm(query);
      var artistN = normalizeWild(artist||'');
      var badSuffix = /\b(film|tv series|novel|book|company|video game|disambiguation)\b/i;

      function score(hit){
        var t = hit.title || '';
        var tn = norm(t);
        var snip = String(hit.snippet||'');
        var s = 0;

        if (tn === base) s += 100;
        if (tn.indexOf(base) >= 0) s += 40;

        if (/\bsong\b/i.test(t))   s += 60;
        if (/\bsingle\b/i.test(t)) s += 50;
        if (topicLabel === 'Album' && /\balbum\b/i.test(t)) s += 60;
        if (topicLabel === 'Label' && /\brecord label\b/i.test(t)) s += 60;

        if (artistN){
          if (tn.indexOf(artistN) >= 0) s += 25;
          if (normalizeWild(snip).indexOf(artistN) >= 0) s += 20;
        }

        if (badSuffix.test(t)) s -= 40;
        return s;
      }

      arr.sort(function(a,b){ return score(b) - score(a); });
      return arr[0] && arr[0].title ? arr[0].title : null;
    });
  }

  // ---------- Wild Search (phrase-first; no stopwords dropped) ----------
  var STOPWORDS = []; // intentionally empty

  function normalizeWild(s){
    return String(s||'')
      .toLowerCase()
      .replace(/[_\-]+/g,' ')
      .replace(/[^\w\s']/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function normalizeForWiki(s){
    return String(s||'')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function buildWildQueries(title, artist){
    var base = normalizeWild(title);           // phrase
    var a    = artist ? normalizeWild(artist) : '';

    var out = [];
    if (base){
      out.push('"' + base + '"' + (a ? (' ' + a) : ''));   // exact phrase + artist
      out.push('"' + base + '"');                           // exact phrase
      out.push(base + ' (song)');                            // disambiguation
      out.push(base + (a ? (' ' + a) : ''));                 // phrase + artist
      out.push(base);                                        // phrase
    }
    if (a) out.push(a);                                     // artist alone as last resort

    // Dedupe & cap
    var seen = Object.create(null), uniq = [];
    for (var i=0;i<out.length;i++){ var q=out[i]; if(!q||seen[q]) continue; seen[q]=1; uniq.push(q); }
    return uniq.slice(0, WILD_Q);
  }

  function aggregateWildSearch(queries, perQueryLimit, artist, topicLabel){
    var all=[]; var ps = queries.map(q => wikiSearchBasic(q, perQueryLimit||WILD_TOP).then(arr=>{
      arr.forEach(h => all.push({ q, hit:h }));
    }));
    return Promise.all(ps).then(function(){
      var byTitle={};
      all.forEach(function(e){
        var t=e.hit.title; if(!t) return;
        if(!byTitle[t]) byTitle[t]= { title:t, snippets:[], sourceQueries:[], raw:e.hit };
        byTitle[t].snippets.push(e.hit.snippet||'');
        byTitle[t].sourceQueries.push(e.q);
      });

      var entries = Object.keys(byTitle).map(function(t){ return byTitle[t]; });
      var badSuffix = /\b(film|tv series|novel|book|company|video game|disambiguation)\b/i;
      var artistN = normalizeWild(artist||'');
      var titlePhrase = normalizeWild(queries[0]||''); // phrase-first

      function coverageScore(str){
        var s = 0; var strN = normalizeWild(str||'');
        if (titlePhrase && strN.indexOf(titlePhrase)>=0) s += 16;
        return s;
      }
      function scoreEntry(ent){
        var s = 0, t=ent.title||'', tn = normalizeWild(t), snips = ent.snippets||[];
        if (/\bsong\b/i.test(t))   s += 60;
        if (/\bsingle\b/i.test(t)) s += 50;
        if (topicLabel==='Album' && /\balbum\b/i.test(t)) s += 60;
        if (topicLabel==='Label' && /\brecord label\b/i.test(t)) s += 60;
        s += coverageScore(t);
        snips.forEach(sn => s += coverageScore(sn));
        if (artistN){
          if (tn.indexOf(artistN)>=0) s += 25;
          snips.forEach(sn => { if (normalizeWild(sn).indexOf(artistN)>=0) s += 20; });
        }
        if (badSuffix.test(t)) s -= 40;
        s += Math.min(20, ent.sourceQueries.length*5);
        return s;
      }
      entries.sort(function(a,b){ return scoreEntry(b)-scoreEntry(a); });
      return entries.length ? entries[0].title : null;
    });
  }

  // ---------- Long-form Trivia / Long Extract ----------
  var TRIVIA_SECTION_PREFER = [
    'Trivia','Background and composition','Background','Composition','Recording','Production',
    'Release','Reception','Legacy','Personnel','Track listing'
  ];

  function stripHtmlToText(html){
    var tmp=document.createElement('div'); tmp.innerHTML = html || '';
    tmp.querySelectorAll('sup,table,style,script').forEach(n=>n.remove());
    var text = tmp.textContent || '';
    text = text.replace(/\n{3,}/g,'\n\n').trim();
    return text;
  }

  function fetchBestSectionIndex(title){
    var u = WIKI_BASE + '/w/api.php?action=parse&format=json&origin=*'
          + '&prop=sections&page=' + encodeURIComponent(title);
    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return null;
      return r.json().then(function(j){
        var secs = j && j.parse && j.parse.sections || [];
        if (!secs.length) return null;
        for (var i=0;i<TRIVIA_SECTION_PREFER.length;i++){
          var target = TRIVIA_SECTION_PREFER[i].toLowerCase();
          var hit = secs.find(s => String(s.line||'').toLowerCase() === target);
          if (hit) return hit.index;
        }
        for (var k=0;k<TRIVIA_SECTION_PREFER.length;k++){
          var t = TRIVIA_SECTION_PREFER[k].toLowerCase();
          var hit2 = secs.find(s => String(s.line||'').toLowerCase().indexOf(t)>=0);
          if (hit2) return hit2.index;
        }
        return null;
      }).catch(function(){ return null; });
    }).catch(function(){ return null; });
  }

  function fetchSectionText(title, index){
    if (!index) return Promise.resolve('');
    var u = WIKI_BASE + '/w/api.php?action=parse&format=json&origin=*'
          + '&prop=text&section=' + encodeURIComponent(index)
          + '&page=' + encodeURIComponent(title);
    return fetchTO(u, Math.max(WIKI_TIMEOUT_MS, 2600)).then(function(r){
      if (!r || !r.ok) return '';
      return r.json().then(function(j){
        var html = j && j.parse && j.parse.text && j.parse.text['*'] || '';
        var text = stripHtmlToText(html);
        if (text.length > TRIVIA_MAX_CHARS) text = text.slice(0, TRIVIA_MAX_CHARS-1)+'…';
        return text;
      }).catch(function(){ return ''; });
    }).catch(function(){ return ''; });
  }

  function fetchLongExtract(title){
    var u = WIKI_BASE + '/w/api.php?action=query&prop=extracts&format=json&origin=*'
          + '&explaintext=1&titles=' + encodeURIComponent(title);
    return fetchTO(u, Math.max(WIKI_TIMEOUT_MS, 2600)).then(function(r){
      if (!r || !r.ok) return '';
      return r.json().then(function(j){
        var pages = j && j.query && j.query.pages || {};
        var pid = Object.keys(pages)[0]; if (!pid) return '';
        var full = pages[pid].extract || '';
        full = full.replace(/\n{3,}/g,'\n\n').trim();
        if (full.length > TRIVIA_MAX_CHARS) full = full.slice(0, TRIVIA_MAX_CHARS-1)+'…';
        return full;
      }).catch(function(){ return ''; });
    }).catch(function(){ return ''; });
  }

  function fetchTriviaForTitle(title){
    return fetchBestSectionIndex(title).then(function(idx){
      if (idx) return fetchSectionText(title, idx);
      return fetchLongExtract(title);
    });
  }

  // ---------- Wikidata fallback (search QID → sitelinks → summary by lang) ----------
  function wikiSummaryByTitleLang(title, lang){
    var base = 'https://' + (lang||WIKI_LANG) + '.wikipedia.org';
    var u = base + '/api/rest_v1/page/summary/' + encodeURIComponent(title);
    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return { text:'', title:title||'', url:'', type:'', qid:'', description:'' };
      return r.json().then(function(j){
        var text = parseWikiSummaryJson(j);
        var t = (j && (j.titles?.normalized || j.title)) || title || '';
        var url = (j && j.content_urls?.desktop?.page) || '';
        var type= (j && j.type) || '';
        var qid = (j && j.wikibase_item) || '';
        var desc= (j && j.description) || '';
        return { text:text, title:t, url:url, type:type, qid:qid, description:desc };
      }).catch(function(){ return { text:'', title:title||'', url:'', type:'', qid:'', description:'' }; });
    }).catch(function(){ return { text:'', title:title||'', url:'', type:'', qid:'', description:'' }; });
  }

  function wikidataSearchBestQID(query, artist){
    var q = normalizeForWiki(query);
    var a = normalizeForWiki(artist||'');
    var u = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*'
          + '&language=en&type=item&limit=12&search=' + encodeURIComponent(q + (a?(' '+a):''));

    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return null;
      return r.json().then(function(j){
        var arr = j && j.search || [];
        if (!arr.length) return null;

        var bad = /(film|television|video game|company|novel)/i;
        function score(it){
          var s=0, lbl = normalizeForWiki(it.label||''), desc = normalizeForWiki(it.description||'');
          if (/\bsong\b|\bsingle\b|\balbum\b|\bmusical work\b|\brecord label\b/i.test(desc)) s+=60;
          normalizeWild(q).split(' ').forEach(tok => { if (tok && lbl.indexOf(tok)>=0) s+=8; if (tok && desc.indexOf(tok)>=0) s+=6; });
          if (a){ if (lbl.indexOf(a)>=0) s+=25; if (desc.indexOf(a)>=0) s+=20; }
          if (bad.test(desc)) s-=40;
          return s;
        }

        arr.sort((x,y)=>score(y)-score(x));
        return arr[0] && arr[0].id || null; // QID
      }).catch(function(){ return null; });
    }).catch(function(){ return null; });
  }

  function wikidataResolveSitelinkTitle(qid){
    if (!qid) return Promise.resolve(null);
    var u = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*'
          + '&ids=' + encodeURIComponent(qid) + '&props=sitelinks';
    return fetchTO(u, WIKI_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) return null;
      return r.json().then(function(j){
        var ent = j && j.entities && j.entities[qid];
        var sl  = ent && ent.sitelinks || {};
        var keyPreferred = WIKI_LANG.toLowerCase() + 'wiki';
        var keyEn        = 'enwiki';

        if (sl[keyPreferred] && sl[keyPreferred].title) return { title: sl[keyPreferred].title, lang: WIKI_LANG };
        if (sl[keyEn] && sl[keyEn].title)               return { title: sl[keyEn].title,       lang: 'en' };

        var any = Object.keys(sl).find(k => /wiki$/.test(k) && sl[k].title);
        if (any) return { title: sl[any].title, lang: any.replace(/wiki$/,'') };
        return null;
      }).catch(function(){ return null; });
    }).catch(function(){ return null; });
  }

  function wikidataFallbackSummary(title, artist){
    return wikidataSearchBestQID(title, artist).then(function(qid){
      if (!qid) return { text:'', title:title, url:'', type:'', qid:'', description:'' };
      return wikidataResolveSitelinkTitle(qid).then(function(sl){
        if (!sl || !sl.title) return { text:'', title:title, url:'', type:'', qid:'', description:'' };
        return wikiSummaryByTitleLang(sl.title, sl.lang).then(function(obj){
          if (obj && !obj.qid) obj.qid = qid;
          return obj || { text:'', title:sl.title, url:'', type:'', qid:qid, description:'' };
        });
      });
    });
  }

  // ---------- Resolve topic (keys → basic search → wild search → Wikidata fallback) ----------
  function resolveTopicPureWiki(topicLabel, keys, artist, onDone){
    setTopicBadge(topicLabel);
    if (!keys || !keys.length){ onDone({ text:'', title:'', url:'', type:'', qid:'', description:'' }); return; }

    (function tryKey(i){
      if (i>=keys.length){
        // Basic search first
        var q = keys[0];
        wikiSearchBestTitle(q, topicLabel, artist).then(function(best){
          if (best){ return chooseAndMaybeLong(best, topicLabel, onDone); }
          // Wild search fallback
          if (WILD_SEARCH === 'on'){
            var queries = buildWildQueries(q, artist);
            aggregateWildSearch(queries, WILD_TOP, artist, topicLabel).then(function(bestWild){
              if (bestWild){ chooseAndMaybeLong(bestWild, topicLabel, onDone); }
              else {
                // Wikidata fallback
                wikidataFallbackSummary(q, artist).then(function(obj){
                  if (obj && obj.text) return onDone(obj);
                  return onDone({ text:'', title:q, url:'', type:'', qid:'', description:'' });
                });
              }
            });
          } else {
            // Directly try Wikidata fallback
            wikidataFallbackSummary(q, artist).then(function(obj){
              if (obj && obj.text) return onDone(obj);
              return onDone({ text:'', title:q, url:'', type:'', qid:'', description:'' });
            });
          }
        });
        return;
      }
      var key = keys[i];
      var hit = Wiki.cache[key];
      if (hit != null){
        if (topicLabel==='Trivia' && hit && hit.title) return doTriviaLong(hit, onDone);
        onDone(hit || { text:'', title:key, url:'', type:'', qid:'', description:'' });
        if (!hit || !hit.text) tryKey(i+1);
        return;
      }
      wikiSummaryByKey(key).then(function(obj){
        Wiki.cache[key] = obj || { text:'', title:key, url:'', type:'', qid:'', description:'' };
        if (obj && obj.text){
          if (topicLabel==='Trivia') return doTriviaLong(obj, onDone);
          onDone(obj);
        } else tryKey(i+1);
      });
    })(0);

    function chooseAndMaybeLong(title, topicLabel, onDone){
      var hit = Wiki.cache[title];
      if (hit != null){
        if (topicLabel==='Trivia' && hit && hit.title) return doTriviaLong(hit, onDone);
        onDone(hit); return;
      }
      wikiSummaryByKey(title).then(function(obj){
        Wiki.cache[title] = obj || { text:'', title:title, url:'', type:'', qid:'', description:'' };
        if (topicLabel==='Trivia') return doTriviaLong(Wiki.cache[title], onDone);
        onDone(Wiki.cache[title]);
      });
    }

    function doTriviaLong(summaryObj, onDone){
      if (summaryObj && summaryObj.type === 'disambiguation'){
        var baseT = summaryObj.title || keys[0];
        wikiSearchBestTitle(baseT, 'Trivia', artist).then(function(best){
          if (!best){
            if (WILD_SEARCH==='on'){
              var qs = buildWildQueries(baseT, artist);
              aggregateWildSearch(qs, WILD_TOP, artist, 'Trivia').then(function(bestWild){
                if (!bestWild) {
                  wikidataFallbackSummary(baseT, artist).then(function(obj){
                    if (obj && obj.text) return onDone(obj);
                    onDone(summaryObj);
                  });
                  return;
                }
                wikiSummaryByKey(bestWild).then(function(newSum){
                  fetchTriviaForTitle(newSum.title).then(function(txt){
                    if (txt) newSum.text = txt; onDone(newSum);
                  });
                });
              });
            } else {
              wikidataFallbackSummary(baseT, artist).then(function(obj){
                if (obj && obj.text) return onDone(obj);
                onDone(summaryObj);
              });
            }
            return;
          }
          wikiSummaryByKey(best).then(function(newSum){
            fetchTriviaForTitle(newSum.title).then(function(txt){
              if (txt) newSum.text = txt; onDone(newSum);
            });
          });
        });
        return;
      }
      // Summary OK → upgrade to long-form text
      fetchTriviaForTitle(summaryObj.title).then(function(txt){
        if (txt) summaryObj.text = txt;
        onDone(summaryObj);
      });
    }
  }

  var Wiki={cache:{}, inflight:{}};

  // ---------- Wikidata facts ----------
  function fetchWikidataFacts(qid){
    if (!qid) return Promise.resolve(null);
    var u = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*'
          + '&props=claims&ids=' + encodeURIComponent(qid);
    function getVal(c,p){ return (c[p] && c[p][0] && c[p][0].mainsnak) ? c[p][0].mainsnak : null; }
    function snakText(snak){
      if (!snak) return null;
      var dv = snak.datavalue && snak.datavalue.value; if (!dv) return null;
      if (snak.datatype === 'time'){ var m=String(dv.time||'').match(/\+?(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); if(!m) return null; return [m[1],m[2],m[3]].filter(Boolean).join('-'); }
      if (snak.datatype === 'quantity') return (dv.amount||'').replace(/^\+/,'');
      if (snak.datatype === 'wikibase-item') return (dv.id || null);
      if (snak.datatype === 'string' || snak.datatype === 'external-id' ) return String(dv);
      if (snak.datatype === 'url') return String(dv);
      if (typeof dv === 'string') return dv;
      return null;
    }
    return fetchTO(u, 2500).then(function(r){
      if (!r || !r.ok) return null;
      return r.json().then(function(j){
        var ent = j && j.entities && j.entities[qid]; if (!ent || !ent.claims) return null;
        var c = ent.claims, facts = {};
        facts.release = snakText(getVal(c, 'P577'));
        facts.label   = snakText(getVal(c, 'P264'));
        facts.album   = snakText(getVal(c, 'P361'));
        facts.genre   = snakText(getVal(c, 'P136'));
        facts.length  = snakText(getVal(c, 'P2047')) || snakText(getVal(c, 'P2045'));
        facts.composer= snakText(getVal(c, 'P86'));
        facts.lyricist= snakText(getVal(c, 'P676'));

        function labelFromQ(q){
          if (!q || !/^Q\d+$/i.test(q)) return Promise.resolve(null);
          var url = 'https://www.wikidata.org/wiki/Special:EntityData/'+q+'.json';
          return fetchTO(url, 2000).then(function(r){
            if (!r || !r.ok) return null;
            return r.json().then(function(data){
              var ent = data.entities && data.entities[q];
              var lbl = ent && ent.labels && (ent.labels[WIKI_LANG]?.value || ent.labels.en?.value);
              return lbl || null;
            }).catch(function(){ return null; });
          }).catch(function(){ return null; });
        }
        var labelPromises = [];
        ['label','album','genre','composer','lyricist'].forEach(function(k){
          if (facts[k] && /^Q\d+$/i.test(facts[k])){
            labelPromises.push(labelFromQ(facts[k]).then(function(lbl){ if (lbl) facts[k]=lbl; }));
          }
        });
        return Promise.all(labelPromises).then(function(){ return facts; });
      }).catch(function(){ return null; });
    }).catch(function(){ return null; });
  }

  // ---------- Wiki block formatting (NO clickable link) ----------
  function formatWikiBlock(res){
    if (!res) return '';
    var desc = res.description ? ('<div style="color:#99c2ff;opacity:.9;font:600 12px/1.2 system-ui;margin-bottom:4px">'+esc(res.description)+'</div>') : '';
    return desc + '<div>'+esc(res.text || '')+'</div>';
  }

  // ---------- Album art (ALWAYS show; default to logo.jpg) ----------
  function loadImgCandidates(img, urls){
    if (!img || !urls || !urls.length){ showArt(LOGO_PATH); return; }
    var i=0; (function next(){
      if (i>=urls.length){ showArt(LOGO_PATH); return; }
      var u=urls[i++]; if(!u){ next(); return; }
      var tmp=new Image(); tmp.onload=function(){ showArt(u); }; tmp.onerror=next; tmp.src=u;
    })();
  }
  function showArt(src){
    if(!ssArtImg||!ssArtWrap) return;
    ssArtImg.src = src || LOGO_PATH;
    ssArtWrap.style.display = ''; // never hide
  }
  function hideArt(){ showArt(LOGO_PATH); }

  function resolveArtFor(pick){
    if (!pick){ showArt(LOGO_PATH); return; }
    if (pick.thumb){ loadImgCandidates(ssArtImg,[pick.thumb]); return; }
    if (pick.path){
      var link=document.querySelector('#playlist a.song[data-path="'+CSS.escape(pick.path)+'"]');
      var row = link && link.closest('.row');
      var rowImg = row && (row.querySelector('img[data-thumb], img.cover, img.thumb, img')?.src || null);
      if (rowImg){ loadImgCandidates(ssArtImg,[rowImg]); return; }
    }
    if (COVERS_BASE && pick.path){
      var stem=stemFromPath(pick.path), base=COVERS_BASE.replace(/\/$/,'');
      loadImgCandidates(ssArtImg,[base+'/'+stem+'.webp', base+'/'+stem+'.jpg', base+'/'+stem+'.png']); return;
    }
    var AT=parseArtistTitleFromName(pick.name);
    var t=String(AT.title||'').trim();
    if (!t){ showArt(LOGO_PATH); return; }
    var u=WIKI_BASE+'/api/rest_v1/page/summary/'+encodeURIComponent(t);
    fetchTO(u, THUMB_TIMEOUT_MS).then(function(r){
      if (!r || !r.ok) { showArt(LOGO_PATH); return; }
      r.json().then(function(j){
        var src = j && (j.originalimage?.source || j.thumbnail?.source);
        showArt(src || LOGO_PATH);
      }).catch(function(){ showArt(LOGO_PATH); });
    }).catch(function(){ showArt(LOGO_PATH); });
  }

  // ---------- Auto-scroll for wiki box ----------
  function stopWikiAutoScroll(){
    if (wikiScrollRAF){ cancelAnimationFrame(wikiScrollRAF); wikiScrollRAF=null; }
    if (wikiScrollLoopTmr){ clearTimeout(wikiScrollLoopTmr); wikiScrollLoopTmr=null; }
    if (ssWikiBox) ssWikiBox.scrollTop = 0;
  }
  function restartWikiAutoScroll(){
    stopWikiAutoScroll();
    if (!ssWikiBox) return;
    var overflow = ssWikiBox.scrollHeight - ssWikiBox.clientHeight;
    if (overflow <= 2) return;
    var last = performance.now();
    function step(now){
      var dt = (now - last) / 1000; last = now;
      var delta = WIKI_SCROLL_PPS * dt;
      ssWikiBox.scrollTop += delta;
      if (ssWikiBox.scrollTop >= overflow - 1){
        wikiScrollLoopTmr = setTimeout(function(){
          ssWikiBox.scrollTop = 0; last = performance.now();
          wikiScrollRAF = requestAnimationFrame(step);
        }, 1200);
        return;
      }
      wikiScrollRAF = requestAnimationFrame(step);
    }
    wikiScrollRAF = requestAnimationFrame(step);
  }

  // ---------- Scrolling list ----------
  function buildListHTML(){
    var songs=collectSongs();
    if (!songs.length) return '<div class="ssRow"><div class="ssName">No songs found. Put files under /midi/</div></div>';
    var html='',i=0;
    songs.forEach(function(s){ i++; html+='<div class="ssRow"><div class="ssIdx">'+String(i).padStart(3,'0')+'.</div><div class="ssName">'+esc(s.name)+'</div></div>'; });
    return html;
  }

  function startScroll(){
    if(!host) return;
    var built = buildListHTML();
    track.innerHTML  = built;
    track2.innerHTML = built;

    var contentH = track.scrollHeight || track.getBoundingClientRect().height || 1000;
    track.style.top  = '0px'; track2.style.top = contentH + 'px';

    var pps    = Math.max(6, ssSpeed);
    var durSec = Math.max(10, Math.round(contentH / pps));
    var dur    = durSec + 's';

    var st = document.getElementById('ss-marquee-dyn');
    if (!st){ st = document.createElement('style'); st.id='ss-marquee-dyn'; document.head.appendChild(st); }
    var NAME = 'vmarquee_px';
    st.textContent = '@keyframes '+NAME+'{ from{ transform:translateY(0) } to{ transform:translateY(-'+contentH+'px) } }';
    track.style.animation  = NAME+' '+dur+' linear infinite';
    track2.style.animation = NAME+' '+dur+' linear infinite';
  }

  // ---------- Look & show/hide ----------
  function applyLook(){
    if(!box) return;
    box.style.setProperty('--ssBlur', ssBlur+'px');
    box.style.setProperty('--ssOpacity', String(ssOpacity));
    host.classList.toggle('full', ssMode==='full');
    applyBranding();
  }

  // ---------- Rotation engine ----------
  function stopWikiRotation(){ if (wikiTimer){ clearInterval(wikiTimer); wikiTimer=null; } }
  function stopPhaseTimer(){ if (phaseTimer){ clearTimeout(phaseTimer); phaseTimer=null; } }

  function stepOptionB(){
    if (!isVisible()){ stopWikiRotation(); stopPhaseTimer(); return; }

    var songs = collectSongs();
    if (!ssSessionPick) ssSessionPick = pickRandom(songs);
    var pick  = ssSessionPick;
    var meta  = getLocalMeta();
    var TA    = deriveTitleArtist(pick, meta);

    ssTitleEl.textContent  = TA.title || 'Unknown Title';
    ssArtistEl.textContent = TA.artist || '';
    mergeAndRenderFacts(meta, null);
    resolveArtFor(pick);

    var topics = buildTopicKeys(TA.title, TA.artist, meta);
    if (!topics.length){ setTopicBadge(''); ssWikiEl.textContent=''; stopWikiAutoScroll(); return; }

    var tIdx  = wikiKeyIdx % topics.length;
    var topic = topics[tIdx];
    wikiKeyIdx++;

    ssWikiEl.textContent = 'Fetching wiki…';
    stopWikiAutoScroll();
    resolveTopicPureWiki(topic.label, topic.keys, TA.artist, function(res){
      if (!isVisible()) return;

      if (res && res.type === 'disambiguation'){
        wikiSearchBestTitle(res.title || topic.keys[0], topic.label, TA.artist).then(function(best){
          if (!best){
            if (WILD_SEARCH==='on'){
              var qs = buildWildQueries(topic.keys[0], TA.artist);
              aggregateWildSearch(qs, WILD_TOP, TA.artist, topic.label).then(function(bestWild){
                if (!bestWild){
                  wikidataFallbackSummary(topic.keys[0], TA.artist).then(function(obj){
                    if (obj && obj.text){
                      ssWikiEl.innerHTML = formatWikiBlock(obj);
                      renderAllFacts(meta, obj.qid);
                      restartWikiAutoScroll();
                      return;
                    }
                    ssWikiEl.innerHTML = formatWikiBlock(res);
                    renderAllFacts(meta, res.qid);
                    restartWikiAutoScroll();
                  });
                  return;
                }
                wikiSummaryByKey(bestWild).then(function(final){
                  ssWikiEl.innerHTML = formatWikiBlock(final);
                  renderAllFacts(meta, final.qid);
                  restartWikiAutoScroll();
                });
              });
            } else {
              wikidataFallbackSummary(topic.keys[0], TA.artist).then(function(obj){
                if (obj && obj.text){
                  ssWikiEl.innerHTML = formatWikiBlock(obj);
                  renderAllFacts(meta, obj.qid);
                  restartWikiAutoScroll();
                  return;
                }
                ssWikiEl.innerHTML = formatWikiBlock(res);
                renderAllFacts(meta, res.qid);
                restartWikiAutoScroll();
              });
            }
            return;
          }
          wikiSummaryByKey(best).then(function(final){
            ssWikiEl.innerHTML = formatWikiBlock(final);
            renderAllFacts(meta, final.qid);
            restartWikiAutoScroll();
          });
        });
        return;
      }
      ssWikiEl.innerHTML = formatWikiBlock(res);
      renderAllFacts(meta, res && res.qid);
      restartWikiAutoScroll();
    });
  }

  function stepOptionA(){
    if (!isVisible()){ stopWikiRotation(); stopPhaseTimer(); return; }

    var songs = collectSongs();
    var pick  = pickRandom(songs);
    var meta  = getLocalMeta();
    var TA    = deriveTitleArtist(pick, meta);

    ssTitleEl.textContent  = TA.title || 'Unknown Title';
    ssArtistEl.textContent = TA.artist || '';
    mergeAndRenderFacts(meta, null);
    resolveArtFor(pick);

    setTopicBadge('');

    var keys = [];
    if (TA.title)  keys.push(TA.title + ' (song)', TA.title);
    if (TA.artist) keys.push(TA.artist);

    ssWikiEl.textContent = 'Fetching wiki…';
    stopWikiAutoScroll();
    resolveTopicPureWiki('Info', keys, TA.artist, function(res){
      if (!isVisible()) return;

      if (res && res.type === 'disambiguation'){
        wikiSearchBestTitle(res.title || keys[0], 'Info', TA.artist).then(function(best){
          if (!best){
            if (WILD_SEARCH==='on'){
              var qs = buildWildQueries(keys[0], TA.artist);
              aggregateWildSearch(qs, WILD_TOP, TA.artist, 'Info').then(function(bestWild){
                if (!bestWild){
                  wikidataFallbackSummary(keys[0], TA.artist).then(function(obj){
                    if (obj && obj.text){
                      ssWikiEl.innerHTML = formatWikiBlock(obj);
                      renderAllFacts(meta, obj.qid);
                      restartWikiAutoScroll();
                      return;
                    }
                    ssWikiEl.innerHTML = formatWikiBlock(res);
                    renderAllFacts(meta, res.qid);
                    restartWikiAutoScroll();
                  });
                  return;
                }
                wikiSummaryByKey(bestWild).then(function(final){
                  ssWikiEl.innerHTML = formatWikiBlock(final);
                  renderAllFacts(meta, final.qid);
                  restartWikiAutoScroll();
                });
              });
            } else {
              wikidataFallbackSummary(keys[0], TA.artist).then(function(obj){
                if (obj && obj.text){
                  ssWikiEl.innerHTML = formatWikiBlock(obj);
                  renderAllFacts(meta, obj.qid);
                  restartWikiAutoScroll();
                  return;
                }
                ssWikiEl.innerHTML = formatWikiBlock(res);
                renderAllFacts(meta, res.qid);
                restartWikiAutoScroll();
              });
            }
            return;
          }
          wikiSummaryByKey(best).then(function(final){
            ssWikiEl.innerHTML = formatWikiBlock(final);
            renderAllFacts(meta, final.qid);
            restartWikiAutoScroll();
          });
        });
        return;
      }
      ssWikiEl.innerHTML = formatWikiBlock(res);
      renderAllFacts(meta, res && res.qid);
      restartWikiAutoScroll();
    });
  }

  function startPhaseBThenA(){
    stopWikiRotation(); stopPhaseTimer();
    currentPhase = 'B'; wikiKeyIdx = 0; ssSessionPick = null;
    stepOptionB();
    wikiTimer = setInterval(stepOptionB, B_STEP_MS);
    phaseTimer = setTimeout(function(){
      if (!isVisible()) { stopWikiRotation(); return; }
      currentPhase = 'A';
      stopWikiRotation();
      stepOptionA();
      wikiTimer = setInterval(stepOptionA, A_STEP_MS);
    }, B_PHASE_MS);
  }

  function showOverlay(){
    cancelIdle(); ensureDOM(); applyLook();
    startPhaseBThenA();
    host.classList.add('panel');
    host.style.display='';
    startScroll();
  }

  function hideOverlay(force){
    if (host) { host.classList.remove('panel'); host.style.display='none'; }
    if (force){ cancelIdle(); }
    stopWikiRotation(); stopPhaseTimer(); stopWikiAutoScroll();
    ssSessionPick = null; wikiKeyIdx = 0;
  }

  // ---------- Topics ----------
  function buildTopicKeys(title, artist, meta){
    title  = String(title||'').trim();
    artist = String(artist||'').trim();
    var topics = [];
    if (title)                topics.push({ label: 'Song',   keys: [title+' (song)', title+' (single)', title] });
    if (meta && meta.label)   topics.push({ label: 'Label',  keys: [meta.label+' (record label)', meta.label] });
    if (meta && meta.album)   topics.push({ label: 'Album',  keys: [meta.album+' (album)', meta.album] });
    if (title)                topics.push({ label: 'Trivia', keys: [title+' (song)', title] }); // long-form
    if (artist)               topics.push({ label: 'Artist', keys: [artist] });
    if (!topics.length && (title || artist)) topics.push({label:'Info', keys:[title||artist]});
    return topics;
  }

  // ---------- Idle ----------
  function cancelIdle(){ if(tIdle){ clearTimeout(tIdle); tIdle=null; } }
  function scheduleIdle(){
    cancelIdle();
    if(!ssEnable) return;
    try{ if(window.isPlaying) return; }catch(_){ }
    if (isVisible()) return;
    tIdle = setTimeout(function(){
      try{ if(!window.isPlaying && !isVisible()) showOverlay(); }
      catch(_){ if(!isVisible()) showOverlay(); }
    }, ssDelayMin*60*1000);
  }
  function markActive(){
    if (ssInteract === 'strict') hideOverlay(true);
    scheduleIdle();
  }

  // ---------- Status hook ----------
  function hookStatus(){
    if (typeof window.setStatus!=='function') return;
    if (window.__origSetStatusSSP_v3_4_10) return; window.__origSetStatusSSP_v3_4_10 = window.setStatus;
    window.setStatus = function(msg){
      try{ window.__origSetStatusSSP_v3_4_10 && window.__origSetStatusSSP_v3_4_10(msg); }catch(_){ }
      try{
        if (msg==='PLAYING'){ hideOverlay(true); cancelIdle(); }
        else if (msg==='IDLE'){ if(ssEnable && !isVisible()) scheduleIdle(); }
      }catch(_){ }
    };
  }

  // ---------- Activity listeners ----------
  function bindActivity(){
    ['mousemove','keydown','click','touchstart','wheel'].forEach(function(ev){
      document.addEventListener(ev, markActive, {passive:true});
    });

    if (ssInteract === 'interactive') {
      document.addEventListener('keydown', function(){
        if(!host || host.style.display==='none') return;
        hideOverlay(true);
      }, true);

      document.addEventListener('mousedown', function(e){
        if(!host || host.style.display==='none') return;
        if (box && !box.contains(e.target)) hideOverlay(true);
      }, true);
      document.addEventListener('touchstart', function(e){
        if(!host || host.style.display==='none') return;
        if (box && !box.contains(e.target)) hideOverlay(true);
      }, {passive:true, capture:true});
    }
  }

  // ---------- Topic badge ----------
  function setTopicBadge(label){
    if (!ssWikiTopicEl) return;
    if (!label){ ssWikiTopicEl.style.display='none'; ssWikiTopicEl.textContent=''; return; }
    ssWikiTopicEl.style.display=''; ssWikiTopicEl.textContent = label;
  }

  // ---------- Control Center ----------
  function injectCC(){
    var cc=$('ccPanel'); if(!cc) return;
    var list=cc.querySelector('.list'); if(!list) return;
    if($('ccSSRow')) return;

    var row=document.createElement('div'); row.className='row'; row.id='ccSSRow';
    row.innerHTML =
      '<span class="label">Screensaver</span>'+
      '<label class="small"><input type="checkbox" id="ccSSOn"> Enable</label>'+
      '<div class="chips" style="margin-left:8px" id="ccSSMode">'+
        '<button class="small" data-mode="panel">Panel</button>'+
        '<button class="small" data-mode="full">Full</button>'+
      '</div>'+
      '<label class="small" style="margin-left:8px">After <input type="range" id="ccSSDelay" min="1" max="15" step="1" style="width:120px"> <span id="ccSSDelayLbl" class="small"></span> min</label>'+
      '<label class="small" style="margin-left:8px">Speed <input type="range" id="ccSSSpeed" min="6" max="80" step="1" style="width:120px"> <span id="ccSSSpeedLbl" class="small"></span> px/s</label>'+
      '<label class="small" style="margin-left:8px">Blur <input type="range" id="ccSSBlur" min="0" max="20" step="1" style="width:100px"> <span id="ccSSBlurLbl" class="small"></span></label>'+
      '<label class="small" style="margin-left:8px">Opacity <input type="range" id="ccSSOp" min="35" max="95" step="1" style="width:100px"> <span id="ccSSOpLbl" class="small"></span>%</label>'+
      '<div class="chips" style="margin-left:8px" id="ccSSInteract">'+
        '<button class="small" data-interact="interactive" title="Any key/outside click hides">Interactive</button>'+
        '<button class="small" data-interact="strict" title="Hide on any activity">Strict</button>'+
      '</div>'+
      '<button id="ccSSStart" class="small" style="margin-left:8px" title="Start now">Start Now</button>'+
      '<button id="ccSSStop"  class="small" title="Stop">Stop</button>';
    list.appendChild(row);

    var on=$('ccSSOn'), d=$('ccSSDelay'), dl=$('ccSSDelayLbl'),
        sp=$('ccSSSpeed'), spl=$('ccSSSpeedLbl'),
        bm=$('ccSSMode'), bl=$('ccSSBlur'), bll=$('ccSSBlurLbl'),
        op=$('ccSSOp'),  opl=$('ccSSOpLbl');
    var go=$('ccSSStart'), stop=$('ccSSStop');
    var inter=$('ccSSInteract');

    function paint(){
      if(on) on.checked=ssEnable;
      if(d){ d.value=String(ssDelayMin); dl.textContent=String(ssDelayMin); }
      if(sp){ sp.value=String(ssSpeed);  spl.textContent=String(ssSpeed); }
      if(bm){ bm.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-mode')===ssMode); }); }
      if(bl){ bl.value=String(ssBlur);   bll.textContent=ssBlur+'px'; }
      if(op){ op.value=String(Math.round(ssOpacity*100)); opl.textContent=String(Math.round(ssOpacity*100)); }
      if(inter){ inter.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-interact')===ssInteract); }); }
    }
    paint();

    on.addEventListener('change', function(){ ssEnable = on.checked; try{ localStorage.setItem('ssEnable', ssEnable?'on':'off'); }catch(_){ } if(!ssEnable) hideOverlay(true); else scheduleIdle(); });
    d.addEventListener('input',  function(){ var v=parseInt(d.value,10)||2; v=clamp(v,1,15); dl.textContent=String(v); });
    d.addEventListener('change', function(){ var v=parseInt(d.value,10)||2; v=clamp(v,1,15); ssDelayMin=v; try{ localStorage.setItem('ssDelayMin', String(v)); }catch(_){ } scheduleIdle(); });
    sp.addEventListener('input', function(){ var v=parseInt(sp.value,10)||22; v=clamp(v,6,80); spl.textContent=String(v); });
    sp.addEventListener('change',function(){ var v=parseInt(sp.value,10)||22; v=clamp(v,6,80); ssSpeed=v; try{ localStorage.setItem('ssSpeed', String(ssSpeed)); }catch(_){ } if(host && host.style.display!=='none') startScroll(); });
    bm.addEventListener('click', function(e){ var b=e.target.closest('button[data-mode]'); if(!b) return; ssMode=b.getAttribute('data-mode')||'panel'; try{ localStorage.setItem('ssMode', ssMode); }catch(_){ } applyLook(); paint(); });
    bl.addEventListener('input',  function(){ var v=parseInt(bl.value,10)||8; v=clamp(v,0,20); bll.textContent=v+'px'; });
    bl.addEventListener('change', function(){ var v=parseInt(bl.value,10)||8; v=clamp(v,0,20); ssBlur=v; try{ localStorage.setItem('ssBlur', String(ssBlur)); }catch(_){ } applyLook(); });
    op.addEventListener('input',  function(){ var v=parseInt(op.value,10)||65; v=clamp(v,35,95); opl.textContent=String(v); });
    op.addEventListener('change', function(){ var v=parseInt(op.value,10)||65; v=clamp(v,35,95); ssOpacity=v/100; try{ localStorage.setItem('ssOpacity', String(ssOpacity)); }catch(_){ } applyLook(); });

    go.addEventListener('click',  function(){ showOverlay(); cancelIdle(); });
    stop.addEventListener('click',function(){ hideOverlay(true); });
  }

  // ---------- Init ----------
  onReady(function(){ ensureDOM(); bindActivity(); hookStatus(); injectCSS(); injectCC(); scheduleIdle(); });

  window.ssPanel = {
    show: () => showOverlay(),
    hide: () => hideOverlay(true),
    idle: () => scheduleIdle(),
    phase: () => currentPhase
  };
})();
