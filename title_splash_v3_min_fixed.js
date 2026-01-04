/* === Title Splash v3 (MIN, FIXED) — Big title at song load; apostrophe-safe ===
 * Changes in this patched build:
 *  - esc() now escapes apostrophe (' → &#39;) and safely falls back (never returns undefined).
 *  - renderBase() and renderAlbumYear() use textContent (no manual HTML escaping needed).
 *  - Rest of logic preserved.
 */
(function(){
  const CFG = {
    zIndex: 120000,
    defaultHideAfterCountdownMs: 2000,
    minVisibleBeforeLyricMs: 1000,
    country: localStorage.getItem('songInfoCountry') || 'US',
    itCacheKey: 'ts_it_cache_v3',
    mbCacheKey: 'ts_mb_cache_v3',
    toFetch: 9000
  };

  let hideTo = null;
  let shownAt = 0;
  let releasedAt = 0;
  let held = false;

  function ensureStyle(){
    if (document.getElementById('tsv3Style')) return;
    const css = `#titleSplashWrap{position:fixed;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;z-index:${CFG.zIndex}}`+
`#titleSplashCard{padding:16px 32px 18px;border-radius:18px;background:rgba(14,17,22,.55);backdrop-filter:blur(14px);box-shadow:0 18px 60px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06) inset;text-align:center;transform:translateY(12px) scale(.98);opacity:0;transition:transform .36s cubic-bezier(.2,.8,.2,1),opacity .36s ease}`+
`#titleSplashWrap.show #titleSplashCard{transform:translateY(0) scale(1);opacity:1}`+
`#tsTitle{font-family:system-ui,Segoe UI,Arial,sans-serif;font-weight:900;line-height:1.04;font-size:clamp(32px,6.6vw,68px);background:linear-gradient(90deg,#ff76b9,#a77dff,#6ecbff);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 18px rgba(255,118,185,.55);word-break:break-word}`+
`#tsArtist{margin-top:6px;color:#dfe6f3;opacity:.9;font-size:clamp(14px,2.4vw,20px);font-weight:700}`+
`#tsAlbumYear{margin-top:6px;color:#a7bacb;opacity:.95;font-size:clamp(13px,2.2vw,18px);font-weight:700}`+
`#tsMeta{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:10px;opacity:.95}`+
`.ts-thumb{width:42px;height:42px;border-radius:8px;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.75)}`+
`.ts-badge{display:inline-flex;align-items:center;gap:.35em;padding:.18em .6em;border-radius:999px;background:rgba(255,255,255,.82);color:#2f3138;font-weight:700;font-size:.8em}`;
    const st = document.createElement('style'); st.id = 'tsv3Style'; st.textContent = css; document.head.appendChild(st);
  }

  function ensureDOM(){
    if (document.getElementById('titleSplashWrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'titleSplashWrap';
    wrap.innerHTML = `
      <div id="titleSplashCard" role="status" aria-live="polite">
        <div id="tsTitle">Loading…</div>
        <div id="tsArtist" hidden></div>
        <div id="tsAlbumYear" hidden></div>
        <div id="tsMeta" hidden>
          <img id="tsCover" class="ts-thumb" alt="" hidden>
          <span id="tsBadgeLabel" class="ts-badge" hidden><span id="tsBadgeLabelText"></span></span>
          <span id="tsBadgeCountry" class="ts-badge" hidden><span id="tsBadgeCountryText"></span></span>
        </div>
      </div>`;
    document.body.appendChild(wrap);
  }

  function esc(s){
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => map[c] || c);
  }

  function stripExt(s){ if(!s) return ''; s = String(s).split('/').pop(); const i = s.lastIndexOf('.'); return i>0? s.slice(0,i) : s; }

  function cleanNoise(s){
    return String(s||'').replace(/\s+/g,' ').replace(/[_]+/g,' ').replace(/[【】]/g,' ')
      .replace(/[\[(].*?(karaoke|instrumental|lyrics|official).*?[\])]*?/gi,'')
      .replace(/\s*(official|lyrics|audio|video|instrumental|minus\s*one|karaoke|remix|cover|hd|hq).*$/i,'')
      .replace(/\s{2,}/g,' ').trim();
  }

  function guessFromFilename(name){
    const raw = cleanNoise(stripExt(name||''));
    let artist='', title='';
    if (raw.includes(' - ')){
      const parts = raw.split(' - ');
      const left = parts[0].trim(), right = parts.slice(1).join(' - ').trim();
      const rightLooksArtist = /(feat\.?|ft\.? )/i.test(right) || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(right);
      if (rightLooksArtist){ title = left; artist = right.replace(/(feat\.?|ft\.? ).*$/i,'').trim(); }
      else { artist = left.replace(/(feat\.?|ft\.? ).*$/i,'').trim(); title = right; }
    } else { title = raw; }
    return { artist, title, q: artist? (artist+' '+title) : title };
  }

  function trim(s){ return String(s||'').trim(); }

  function renderBase(title, artist){
    const elTitle = document.getElementById('tsTitle');
    const elArtist= document.getElementById('tsArtist');
    elTitle.textContent = String(title ?? '');
    if (artist){ elArtist.textContent = String(artist); elArtist.hidden=false; } else { elArtist.hidden=true; }
  }

  function renderAlbumYear(album, year){
    const elAY = document.getElementById('tsAlbumYear');
    const a = String(album||'').trim();
    const y = String(year ||'').trim();
    const line = (a && y) ? (a+' • '+y) : (a || y);
    elAY.textContent = line || '';
    elAY.hidden = !line;
  }

  function renderMeta(label, country, cover){
    const meta = document.getElementById('tsMeta');
    const elLab = document.getElementById('tsBadgeLabel');
    const elLabTxt = document.getElementById('tsBadgeLabelText');
    const elCty = document.getElementById('tsBadgeCountry');
    const elCtyTxt = document.getElementById('tsBadgeCountryText');
    const elCov = document.getElementById('tsCover');

    let any=false;
    if (cover){ elCov.src = cover; elCov.hidden=false; any=true; } else { elCov.hidden=true; }
    if (label){ elLabTxt.textContent = label; elLab.hidden=false; any=true; } else { elLab.hidden=true; }
    if (country){ elCtyTxt.textContent = country; elCty.hidden=false; any=true; } else { elCty.hidden=true; }
    meta.hidden = !any;
  }

  function showHeld(title, artist){
    ensureStyle(); ensureDOM();
    const wrap = document.getElementById('titleSplashWrap');
    renderBase(title, artist); renderAlbumYear('', ''); renderMeta('', '', '');
    clearTimeout(hideTo);
    wrap.style.display = 'flex';
    setTimeout(()=> wrap.classList.add('show'), 50);
    shownAt = Date.now(); releasedAt = 0; held = true;
      // 🔥 Force-hide safety net after 15 seconds
      setTimeout(() => {
        const wrap = document.getElementById('titleSplashWrap');
        if (wrap && wrap.style.display !== 'none') {
          console.warn('[TitleSplash] Force-hide triggered after 15s');
          wrap.classList.remove('show');
          setTimeout(() => { wrap.style.display = 'none'; }, 280);
        }
      }, 15000);

  }

  function hideNow(){
    const wrap = document.getElementById('titleSplashWrap'); if (!wrap) return;
    wrap.classList.remove('show'); setTimeout(()=>{ wrap.style.display='none'; }, 280);
  }

  const API = {
    show(payload){
      const t = typeof payload==='string' ? guessFromFilename(payload) : (payload||{});
      const title = t.title || payload?.title || '';
      const artist= t.artist|| payload?.artist|| '';
      showHeld(title, artist);
    },
    countdownStarted(ms){
      held = false; releasedAt = Date.now();
      const delay = (ms==null? CFG.defaultHideAfterCountdownMs : Number(ms)||CFG.defaultHideAfterCountdownMs);
      clearTimeout(hideTo); hideTo = setTimeout(()=> hideNow(), Math.max(0, delay));
    },
    lyricFirst(){
      if (held) return;
      const elapsedSinceShow = Date.now() - shownAt;
      const need = Math.max(0, CFG.minVisibleBeforeLyricMs - elapsedSinceShow);
      clearTimeout(hideTo);
      hideTo = setTimeout(()=> hideNow(), need);
    }
  };

  window.TitleSplash = API;

  if (typeof window.setNowPlaying==='function' && !window.__TSV3_HOOKED){
    const orig = window.setNowPlaying;
    window.setNowPlaying = function(rel, title){
      try{ orig.apply(this, arguments); }catch{}
      const base = String(title||'').trim();
      if (base){ TitleSplash.show({ title: base }); }
      else { TitleSplash.show(String(rel||'')); }
    };
    window.__TSV3_HOOKED = true;
  }
})();
