
/* === Title Splash Theme CC v1 — Control Center button for Splash Theme ===
 * Requires: title_splash_theme_pack_v1.js (TitleSplashTheme API)
 * Adds a 'Splash Theme' row in Control Center with:
 *  - A cycle button: cycles dark → neon → warm → mono → glass → pastel
 *  - A 'Follow app theme' checkbox: enables auto (maps html[data-theme])
 */
(function(){
  const KEY_THEME = 'tsThemeV1';           // same keys used by the Theme Pack
  const KEY_FOLLOW= 'tsThemeFollowApp';

  const CYCLE = ['dark','neon','warm','mono','glass','pastel'];

  function getFollow(){
    try { return (localStorage.getItem(KEY_FOLLOW)||'on') === 'on'; } catch(_) { return true; }
  }
  function setFollow(on){
    try { localStorage.setItem(KEY_FOLLOW, on?'on':'off'); } catch(_){ }
    if (window.TitleSplashTheme && typeof TitleSplashTheme.followAppTheme === 'function'){
      TitleSplashTheme.followAppTheme(!!on);
    }
    // Mark auto for saved key so initial apply on reload maps app theme
    if (on){ try{ localStorage.setItem(KEY_THEME, 'auto'); }catch(_){} }
  }

  function getTheme(){
    if (window.TitleSplashTheme && typeof TitleSplashTheme.get === 'function'){
      try { return TitleSplashTheme.get() || 'dark'; } catch(_) { return 'dark'; }
    }
    try { return localStorage.getItem(KEY_THEME) || 'dark'; } catch(_) { return 'dark'; }
  }
  function setTheme(id){
    const next = CYCLE.includes(id) ? id : 'dark';
    try { localStorage.setItem(KEY_THEME, next); }catch(_){}
    if (window.TitleSplashTheme && typeof TitleSplashTheme.apply === 'function'){
      TitleSplashTheme.apply(next);
    }
  }
  function nextTheme(cur){
    const i = CYCLE.indexOf(cur);
    const j = (i >= 0 ? (i+1) : 0) % CYCLE.length;
    return CYCLE[j];
  }

  function labelFor(id, follow){
    if (follow) return 'Splash Theme: Auto';
    const name = id.charAt(0).toUpperCase() + id.slice(1);
    return 'Splash Theme: ' + name;
  }

  function ensureRow(){
    const cc = document.getElementById('ccPanel');
    const list = cc && cc.querySelector('.list');
    if (!list || document.getElementById('ccSplashThemeRow')) return;

    const row = document.createElement('div');
    row.className = 'row';
    row.id = 'ccSplashThemeRow';

    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = 'Splash Theme';

    const btn = document.createElement('button');
    btn.id = 'ccSplashThemeBtn';
    btn.className = 'small';
    btn.title = 'Cycle splash theme';

    const followWrap = document.createElement('label');
    followWrap.className = 'small';
    followWrap.style.marginLeft = '8px';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = 'ccSplashFollow';
    const txt = document.createTextNode(' Follow app theme');
    followWrap.appendChild(chk);
    followWrap.appendChild(txt);

    row.appendChild(lab);
    row.appendChild(btn);
    row.appendChild(followWrap);
    list.appendChild(row);

    // Sync UI state
    function sync(){
      const follow = getFollow();
      const cur    = getTheme();
      chk.checked  = follow;
      btn.textContent = labelFor(cur, follow);
      btn.disabled = follow; // if following app theme, cycling is disabled
      btn.setAttribute('aria-disabled', String(!!follow));
    }

    btn.addEventListener('click', function(){
      // If follow is on, ignore cycling
      if (getFollow()) return;
      const next = nextTheme(getTheme());
      setTheme(next);
      sync();
    });

    chk.addEventListener('change', function(){
      setFollow(chk.checked);
      // If follow was turned on, ensure label refl. Auto
      if (chk.checked){
        // Optional: align splash immediately to current app theme
        if (window.TitleSplashTheme && typeof TitleSplashTheme.followAppTheme === 'function'){
          TitleSplashTheme.followAppTheme(true);
        }
      }
      sync();
    });

    // Initial sync
    sync();

    // If follow is on, reflect app theme updates
    if (window.MutationObserver){
      const root = document.documentElement;
      const mo   = new MutationObserver(()=>{ if (getFollow()) sync(); });
      mo.observe(root, { attributes:true, attributeFilter:['data-theme'] });
    }
  }

  function init(){
    if (document.getElementById('ccPanel')) ensureRow();
    // Also try again when CC shows (in case loaded late)
    const dockBtn = document.getElementById('mdCC');
    if (dockBtn){ dockBtn.addEventListener('click', ()=> ensureRow()); }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
