
/* === Song Info (Online) — filename-based heuristics + multi-source search === */
(function(){
  const CC_TOOLS_LABEL = 'Tools';         // reuse your existing Tools row
  const DEFAULT_COUNTRY = (localStorage.getItem('songInfoCountry') || 'US'); // iTunes Search

  // --- UI references (lazy) ---
  const ui = {
    panel: null, q: null, go: null, source: null, online: null, results: null, cacheChk: null,
    btnOpen: null
  };

  // --- Filename → title/artist heuristics ---
  function baseName(p){ try{ return (p||'').split('/').pop(); }catch(_){ return p||''; } }
  function stripExt(n){ const i=n.lastIndexOf('.'); return i>0? n.slice(0,i): n; }
  function cleanNoise(s){
    return (s||'')
      .replace(/\s+/g,' ')
      .replace(/[_]+/g,' ')
      .replace(/[【】]/g,' ')
      .replace(/\s*(official|lyrics|audio|video|instrumental|minus\s*one|karaoke|remix|cover|hd|hq)\b.*$/i,'')
      .replace(/[$$$$].*?(karaoke|instrumental|lyrics|official).*?[$$$$]/gi,'')
      .replace(/\s{2,}/g,' ')
      .trim();
  }
  function splitFeat(s){
    // return [main, featured]; keep main clean
    const m = s.match(/\b(feat\.?|ft\.?)\b(.+)$/i);
    if (!m) return [s, ''];
    const main = cleanNoise(s.replace(m[0], '')).trim();
    const feat = cleanNoise(m[2]).trim();
    return [main, feat];
  }
  function guessFromFilename(name){
    let raw = stripExt(baseName(name||''));
    raw = cleanNoise(raw);

    // Try common "Artist - Title" / "Title - Artist"
    let artist='', title='';
    if (raw.includes(' - ')) {
      const [a,b] = raw.split(' - ').map(x=>x.trim());
      // Heuristic: If 'feat.' is on the right, it's likely Title - Artist
      const rightLooksArtist = /\b(feat\.?|ft\.?)\b/i.test(b) || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(b);
      if (rightLooksArtist) { title = a; [artist] = splitFeat(b); }
      else { [artist] = splitFeat(a); title = b; }
    } else {
      // Fallback: remove tags and prefer multi-word as title
      const tokens = raw.split(/\s+-\s+|\s{2,}|\s\|\s/).map(x=>x.trim()).filter(Boolean);
      if (tokens.length >= 2) {
        [artist] = splitFeat(tokens[0]);
        title = tokens.slice(1).join(' ');
      } else {
        title = raw; artist = '';
      }
    }

    const query = (artist? `${artist} ${title}` : title).trim();
    return { title, artist, query };
  }

  // --- Connectivity + cache ---
  function setOnlineLabel(){
    const on = navigator.onLine;
    if (ui.online){
      ui.online.textContent = on ? 'Online' : 'Offline';
      ui.online.style.color = on ? '#b7f7b7' : '#f7c7c7';
    }
  }
  const CK = 'songInfoCacheV1';
  function loadCache(){ try { return JSON.parse(localStorage.getItem(CK)||'{}'); } catch(_) { return {}; } }
  function saveCache(obj){ try { localStorage.setItem(CK, JSON.stringify(obj||{})); } catch(_){} }

  // --- Helpers ---
  function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function clearResults(){ if(ui.results) ui.results.innerHTML=''; }
  function infoRow(txt){ return '<div class="row"><span class="small">'+escapeHtml(txt)+'</span></div>'; }

  // JSONP fallback (for iTunes Search if CORS blocks)
  function jsonp(url, cbParam='callback'){
    return new Promise(resolve=>{
      const cb = '__ITUNES_CB_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
      window[cb] = function(data){ try{ resolve(data);} finally{ try{ delete window[cb]; }catch(_){}} };
      const s = document.createElement('script');
      s.src = url + (url.includes('?')?'&':'?') + cbParam + '=' + cb;
      s.async = true;
      s.onerror = function(){ resolve(null); };
      document.body.appendChild(s);
      setTimeout(()=>{ try{ s.remove(); }catch(_){} }, 20000);
    });
  }

  async function fetchWithTimeout(url, ms){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms||9000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return res;
    } finally { clearTimeout(t); }
  }

  // --- Sources ---
  async function queryITunes(term){
    const country = DEFAULT_COUNTRY || 'US';
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&country=${encodeURIComponent(country)}&limit=5`;
    try {
      const r = await fetchWithTimeout(url, 9000);
      if (r && r.ok) return await r.json();
      // Fallback to JSONP
      const data = await jsonp(url, 'callback');
      return data || null;
    } catch(_){
      const data = await jsonp(url, 'callback');
      return data || null;
    }
  }

  async function queryMBRecording(title, artist){
    // Prefer structured query when both title and artist exist
    const q = (title && artist)
      ? `recording:"${title}" AND artist:"${artist}"`
      : `"${(title||artist||'').trim()}"`;
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
    const r = await fetchWithTimeout(url, 9000);
    if (!r || !r.ok) return null;
    return await r.json();
  }

  async function queryWikiSummary(title){
    if (!title) return null;
    // REST summary (fast); some titles may need normalization
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const r = await fetchWithTimeout(url, 9000);
    if (r && r.ok) return await r.json();

    // Action API fallback (plain extract) with CORS `origin=*`
    const aurl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`;
    const rr = await fetchWithTimeout(aurl, 9000);
    if (!rr || !rr.ok) return null;
    const data = await rr.json();
    try {
      const pages = data.query && data.query.pages ? data.query.pages : {};
      const first = pages[Object.keys(pages)[0]];
      return { title: first.title, extract: first.extract, content_urls: { desktop:{ page: `https://en.wikipedia.org/wiki/${encodeURIComponent(first.title)}` } } };
    } catch(_){ return null; }
  }

  // --- Rendering ---
  function renderITunes(raw){
    if (!raw || !Array.isArray(raw.results) || !raw.results.length) return '';
    const r = raw.results[0];
    const art = r.artworkUrl100 || r.artworkUrl60 || '';
    const artist = r.artistName || '';
    const track = r.trackName || '';
    const album = r.collectionName || '';
    const date = r.releaseDate ? (new Date(r.releaseDate).getFullYear()) : '';
    const url = r.trackViewUrl || r.collectionViewUrl || '';
    return `
      <div class="row">
        ${art ? `${escapeHtml(art)}` : ''}
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(track)}</div>
          <div class="small">${escapeHtml(artist)}${album? ' • '+escapeHtml(album): ''}${date? ' • '+escapeHtml(String(date)): ''}</div>
          ${url ? `<div>${escapeHtml(url)}View on Apple</a></div>` : ''}
        </div>
      </div>`;
  }

  function renderMB(raw){
    if (!raw || !Array.isArray(raw.recordings) || !raw.recordings.length) return '';
    const r = raw.recordings[0];
    const title = r.title || '';
    const artist = (r['artist-credit'] && r['artist-credit'][0] && r['artist-credit'][0].name) || '';
    const lengthMs = r.length || 0;
    const secs = lengthMs ? Math.round(lengthMs/1000) : '';
    const mbid = r.id || '';
    const url = mbid ? `https://musicbrainz.org/recording/${mbid}` : '';
    return `
      <div class="row">
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(title)}</div>
          <div class="small">${escapeHtml(artist)}${secs? ' • '+escapeHtml(String(secs))+'s': ''}</div>
          ${url ? `<div>${escapeHtml(url)}MusicBrainz</a></div>` : ''}
        </div>
      </div>`;
  }

  function renderWiki(raw){
    if (!raw) return '';
    const title = raw.title || '';
    const extract = raw.extract || raw.description || '';
    const url = (raw.content_urls && raw.content_urls.desktop && raw.content_urls.desktop.page) || '';
    const thumb = (raw.thumbnail && raw.thumbnail.source) || '';
    return `
      <div class="row">
        ${thumb ? `${escapeHtml(thumb)}` : ''}
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(title)}</div>
          ${extract ? `<div class="small">${escapeHtml(extract)}</div>` : ''}
          ${url ? `<div>${escapeHtml(url)}Wikipedia</a></div>` : ''}
        </div>
      </div>`;
  }

  // --- Orchestrator ---
  async function searchSongInfo(usingText){
    clearResults();
    if (!ui.results) return;

    // Pick a sensible default source order: iTunes → MB → Wiki
    ui.results.innerHTML = infoRow('Searching…');

    // Build query from filename if not provided
    let title='', artist='', query='';
    if (usingText && usingText.trim()) {
      const g = guessFromFilename(usingText.trim());
      title = g.title; artist = g.artist; query = g.query;
    } else {
      const name = (window.lastPlayed && lastPlayed.name) ? lastPlayed.name :
                   (window.currentSong || '');
      const g = guessFromFilename(name);
      title = g.title; artist = g.artist; query = g.query;
    }

    const cacheKey = `info:${(title||'')}:${(artist||'')}:${(query||'')}`.toLowerCase();
    const useCache = !!ui.cacheChk?.checked;
    const cache = useCache ? loadCache() : {};
    if (useCache && cache[cacheKey]) {
      ui.results.innerHTML = cache[cacheKey];
      return;
    }

    setOnlineLabel();

    const parts = [];
    try {
      const IT = await queryITunes(query || title || artist);
      if (IT) parts.push(renderITunes(IT));
    } catch(_) {}
    try {
      const MB = await queryMBRecording(title, artist);
      if (MB) parts.push(renderMB(MB));
    } catch(_) {}
    try {
      const WK = await queryWikiSummary(title);
      if (WK) parts.push(renderWiki(WK));
    } catch(_) {}

    if (!parts.length){
      ui.results.innerHTML = infoRow('No matches found. Try editing the filename (remove extra words like “karaoke”, “official”, “lyrics”).');
    } else {
      const html = parts.join('') + infoRow('Tip: toggle “Cache results” to reuse when offline.');
      ui.results.innerHTML = html;
      if (useCache){ cache[cacheKey] = html; saveCache(cache); }
    }
  }

  // --- Build Panel UI ---
  function ensurePanel(){
    if (ui.panel) return ui.panel;

    const host = document.createElement('section');
    host.className = 'panel win'; host.id = 'songInfoPanel';
    host.innerHTML = `
      <h4 class="drag"><span>Song Info (Online)</span><span><button class="close" data-close="songinfo">×</button></span></h4>
      <div class="list" style="display:flex;flex-direction:column;">
        <div class="row searchbar">
          <input type="search" id="songInfoQuery" class="search" placeholder="Use current filename or type a title/artist…">
          <button class="small" id="songInfoGo">Search</button>
          <span class="small" id="songInfoOnline" title="Connectivity"></span>
        </div>
        <div class="row">
          <span class="label">Options</span>
          <label class="small"><input type="checkbox" id="songInfoCache" checked> Cache results</label>
          <label class="small" style="margin-left:8px">Country:
            <select id="songInfoCountry" title="Apple iTunes Search country">
              ${['US','PH','JP','GB','AU','CA'].map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="list" id="songInfoResults"></div>
      </div>`;

    document.body.appendChild(host);
    ui.panel   = host;
    ui.q       = host.querySelector('#songInfoQuery');
    ui.go      = host.querySelector('#songInfoGo');
    ui.online  = host.querySelector('#songInfoOnline');
    ui.results = host.querySelector('#songInfoResults');
    ui.cacheChk= host.querySelector('#songInfoCache');

    const selCountry = host.querySelector('#songInfoCountry');
    if (selCountry) {
      selCountry.value = DEFAULT_COUNTRY;
      selCountry.addEventListener('change', ()=>{
        const c = selCountry.value || 'US';
        localStorage.setItem('songInfoCountry', c);
      });
    }

    // Wire events
    ui.go.addEventListener('click', ()=> searchSongInfo(ui.q.value));
    ui.q.addEventListener('keydown', (e)=>{ if(e.key==='Enter') searchSongInfo(ui.q.value); });
    setOnlineLabel();

    // Integrate into WM (simple show/hide/toggle like others)
    window.WM = window.WM || {};
    WM.songinfo = WM.songinfo || {
      element: host,
      show(){ host.classList.add('visible'); host.classList.remove('minimized'); host.classList.remove('maximized'); host.style.zIndex = String(400); },
      hide(){ host.classList.remove('visible'); },
      toggle(){ host.classList.toggle('visible'); if(host.classList.contains('visible')){ host.style.zIndex = String(400); } }
    };

    // Close button route
    document.addEventListener('click', function(e){
      const btn = e.target.closest('button.close');
      if (!btn) return;
      const which = btn.getAttribute('data-close')||'';
      if (which === 'songinfo') try{ WM.songinfo.hide(); }catch(_){}
    }, true);

    return host;
  }

  // --- Add to Micro-dock menu ---
  function addDockItem(){
    const menu = document.getElementById('mdPanelMenu');
    if (!menu || menu.querySelector('[data-open="songinfo"]')) return;
    const btn = document.createElement('button');
    btn.className = 'md-item'; btn.setAttribute('data-open','songinfo'); btn.textContent = 'Song Info';
    btn.addEventListener('click', function(){
      ensurePanel();
      try { WM && WM.songinfo && WM.songinfo.toggle && WM.songinfo.toggle(); } catch(_) {}
      menu.classList.remove('open');
      document.getElementById('mdPanel')?.classList.remove('active');
      // Auto-fill from current filename
      const name = (window.lastPlayed && lastPlayed.name) ? lastPlayed.name : (window.currentSong||'');
      if (ui.q) ui.q.value = stripExt(baseName(name||''));
      searchSongInfo(ui.q.value);
    });
    menu.appendChild(btn);
  }

  // --- Add to Control Center → Tools ---
  function addCCTool(){
    const cc = document.getElementById('ccPanel'); if (!cc) return;
    const list = cc.querySelector('.list'); if (!list) return;

    let toolsRow = [...list.children].find(el => {
      const lab = el.querySelector('.label'); return lab && /tools/i.test(lab.textContent||'');
    });
    if (!toolsRow){
      toolsRow = document.createElement('div'); toolsRow.className = 'row';
      const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = CC_TOOLS_LABEL;
      toolsRow.appendChild(lab); list.insertBefore(toolsRow, list.firstChild);
    }
    if (toolsRow.querySelector('#btnSongInfo')) return;

    const linkWrap = document.createElement('span');
    const btn = document.createElement('a');
    btn.id='btnSongInfo'; btn.href='#'; btn.className='btn small'; btn.textContent='Song Info (Online)';
    btn.title='Lookup track/artist using filename';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      ensurePanel();
      try { WM && WM.songinfo && WM.songinfo.toggle && WM.songinfo.toggle(); } catch(_){}
      const name = (window.lastPlayed && lastPlayed.name) ? lastPlayed.name : (window.currentSong||'');
      if (ui.q) ui.q.value = stripExt(baseName(name||''));
      searchSongInfo(ui.q.value);
    });
    linkWrap.appendChild(btn);
    toolsRow.appendChild(linkWrap);
  }

  // Init
  ensurePanel();
  addDockItem();
  addCCTool();
})();
