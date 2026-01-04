
/* === Title Splash Theme Pack v1 ===
 * Works with: title_splash_v3_min.js
 * Purpose: Provide visual themes for the Title Splash (card + title gradient + badges)
 * API:
 *   TitleSplashTheme.apply(id)          // 'auto' | 'dark' | 'neon' | 'warm' | 'mono' | 'glass' | 'pastel'
 *   TitleSplashTheme.followAppTheme(on) // if true, watch html[data-theme] (dark/neon/warm/mono)
 *   TitleSplashTheme.get()
 *   TitleSplashTheme.list()
 */
(function(){
  const KEY   = 'tsThemeV1';
  const KEY_F = 'tsThemeFollowApp';

  const THEMES = {
    // Baseline (your current look)
    dark: {
      cardBg: 'rgba(14,17,22,.55)',
      blur: 14,
      titleGrad: 'linear-gradient(90deg,#ff76b9,#a77dff,#6ecbff)',
      titleGlow: '0 0 18px rgba(255,118,185,.55)',
      artist: '#dfe6f3',
      album:  '#a7bacb',
      badgeBg: 'rgba(255,255,255,.82)',
      badgeFg: '#2f3138',
      thumbRing: 'rgba(255,255,255,.75)'
    },
    // Bright neon vibe
    neon: {
      cardBg: 'rgba(6,10,18,.58)',
      blur: 16,
      titleGrad: 'linear-gradient(90deg,#00f5d4,#7b2ff7,#ff0ea1)',
      titleGlow: '0 0 22px rgba(255,14,161,.6)',
      artist: '#eaf6ff',
      album:  '#9bd1ff',
      badgeBg: 'rgba(255,255,255,.9)',
      badgeFg: '#16222e',
      thumbRing: 'rgba(255,255,255,.9)'
    },
    // Warm cozy amber/orange
    warm: {
      cardBg: 'rgba(22,16,10,.58)',
      blur: 14,
      titleGrad: 'linear-gradient(90deg,#ff8e72,#ffd166,#ffb86b)',
      titleGlow: '0 0 18px rgba(255,177,101,.55)',
      artist: '#f3eadd',
      album:  '#d7c7ad',
      badgeBg: 'rgba(255,248,235,.88)',
      badgeFg: '#332515',
      thumbRing: 'rgba(255,248,235,.9)'
    },
    // Minimalist grayscale
    mono: {
      cardBg: 'rgba(16,16,16,.54)',
      blur: 12,
      titleGrad: 'linear-gradient(90deg,#fafafa,#dcdcdc,#bcbcbc)',
      titleGlow: '0 0 14px rgba(240,240,240,.45)',
      artist: '#f0f0f0',
      album:  '#cfcfcf',
      badgeBg: 'rgba(255,255,255,.85)',
      badgeFg: '#1f1f1f',
      thumbRing: 'rgba(255,255,255,.75)'
    },
    // Glass (light frosted card; great over dark bgs)
    glass: {
      cardBg: 'rgba(255,255,255,.10)',
      blur: 18,
      titleGrad: 'linear-gradient(90deg,#a18cd1,#fbc2eb,#fad0c4)',
      titleGlow: '0 0 22px rgba(250,208,196,.55)',
      artist: '#ffffff',
      album:  '#f1f1f1',
      badgeBg: 'rgba(255,255,255,.92)',
      badgeFg: '#1e1e1e',
      thumbRing: 'rgba(255,255,255,.95)'
    },
    // Pastel candy
    pastel: {
      cardBg: 'rgba(25,28,36,.50)',
      blur: 16,
      titleGrad: 'linear-gradient(90deg,#ffd6e0,#cde7ff,#d6ffd6)',
      titleGlow: '0 0 18px rgba(205,231,255,.55)',
      artist: '#eef3ff',
      album:  '#d2e0f2',
      badgeBg: 'rgba(255,255,255,.9)',
      badgeFg: '#2a2d37',
      thumbRing: 'rgba(255,255,255,.85)'
    }
  };

  // Map app theme → splash theme
  const APP_MAP = { dark:'dark', neon:'neon', warm:'warm', mono:'mono' };

  function cssFor(theme){
    const t = THEMES[theme] || THEMES.dark;
    return `/* Title Splash Theme: ${theme} */\n`+
      `#titleSplashCard{background:${t.cardBg};backdrop-filter:blur(${t.blur}px)}\n`+
      `#tsTitle{background:${t.titleGrad};-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:${t.titleGlow}}\n`+
      `#tsArtist{color:${t.artist}}\n`+
      `#tsAlbumYear{color:${t.album}}\n`+
      `.ts-badge{background:${t.badgeBg};color:${t.badgeFg}}\n`+
      `.ts-thumb{box-shadow:0 0 0 2px ${t.thumbRing}}`;
  }

  let styleEl = null;
  function ensureStyle(){
    if (styleEl) return styleEl;
    styleEl = document.createElement('style');
    styleEl.id = 'tsThemePackV1';
    document.head.appendChild(styleEl);
    return styleEl;
  }

  function setTheme(id){
    const key = (id||'').toLowerCase();
    const final = THEMES[key] ? key : 'dark';
    ensureStyle().textContent = cssFor(final);
    try{ localStorage.setItem(KEY, final); }catch(_){ }
    return final;
  }

  function getSaved(){
    try{ return localStorage.getItem(KEY) || 'auto'; }catch(_){ return 'auto'; }
  }
  function getFollow(){
    try{ return (localStorage.getItem(KEY_F)||'on') === 'on'; }catch(_){ return true; }
  }
  function setFollow(on){
    try{ localStorage.setItem(KEY_F, on?'on':'off'); }catch(_){ }
  }

  // Observe app theme attribute changes if follow is on
  let appObs = null;
  function watchAppTheme(){
    if (appObs) return;
    const root = document.documentElement;
    appObs = new MutationObserver(()=>{
      if (!getFollow()) return;
      const appId = root.getAttribute('data-theme')||'dark';
      const map = APP_MAP[appId] || 'dark';
      setTheme(map);
    });
    appObs.observe(root, { attributes:true, attributeFilter:['data-theme'] });
  }

  function applyInitial(){
    const saved = getSaved();
    if (saved === 'auto'){
      const appId = document.documentElement.getAttribute('data-theme')||'dark';
      setTheme(APP_MAP[appId] || 'dark');
      watchAppTheme();
    } else {
      setTheme(saved);
      if (getFollow()) watchAppTheme();
    }
  }

  // Public API
  const API = {
    apply: function(id){ setTheme(id==='auto'?'dark':id); return this; },
    followAppTheme: function(on){ setFollow(!!on); if (on) watchAppTheme(); return this; },
    get: function(){ return getSaved(); },
    list: function(){ return Object.keys(THEMES).concat(['auto']); }
  };

  // Expose and apply
  window.TitleSplashTheme = API;

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyInitial);
  } else { applyInitial(); }
})();
