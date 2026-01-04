/*!
 * ch16_cache_clear_button_v1.6_microdock.js
 * Clear Cache button — hard-coded for Micro‑dock (#microDock), styled as md-btn, with spinning flush icon.
 * Placement: before the .md-split group so it sits with 📌 ⛶ ⚙.
 * UX: Long-press (1.2s) to confirm; non-intrusive toasts; no alerts.
 */
(function(){
  'use strict';

  var HOLD_MS = 1200;
  var TARGET_SELECTOR = '#microDock';

  // ---------- tiny toast ----------
  function ensureToastHost(){
    var host = document.getElementById('appToastHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'appToastHost';
    host.style.position = 'fixed';
    host.style.zIndex = '9999';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.gap = '8px';
    document.body.appendChild(host);
    return host;
  }
  function showToast(msg, kind){
    var host = ensureToastHost();
    var t = document.createElement('div');
    t.className = 'app-toast ' + (kind||'info');
    t.textContent = msg;
    t.style.maxWidth = '460px';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 4px 16px rgba(0,0,0,.24)';
    t.style.font = '12px/1.4 system-ui';
    t.style.color = '#e9eef6';
    t.style.background = kind==='error' ? 'rgba(200, 70, 70, 0.92)'
                      : kind==='ok' ? 'rgba(40, 140, 90, 0.92)'
                      : 'rgba(40, 80, 120, 0.92)';
    t.style.transition = 'opacity .25s ease';
    t.style.opacity = '0';
    host.appendChild(t);
    requestAnimationFrame(function(){ t.style.opacity = '1'; });
    setTimeout(function(){ t.style.opacity = '0'; setTimeout(function(){ t.remove(); }, 260); }, 3600);
    return t;
  }

  // ---------- clearing ----------
  async function clearAll(){
    var rep = { ls:0, ss:0, caches:0, idb:0, sw:0, cookies:0, errors:[] };
    try { rep.ls = localStorage.length; localStorage.clear(); } catch(e){ rep.errors.push('localStorage: '+(e&&e.message||e)); }
    try { rep.ss = sessionStorage.length; sessionStorage.clear(); } catch(e){ rep.errors.push('sessionStorage: '+(e&&e.message||e)); }
    try { if ('caches' in window){ var keys = await caches.keys(); for (var i=0;i<keys.length;i++){ try { await caches.delete(keys[i]); rep.caches++; } catch(e){ rep.errors.push('caches['+keys[i]+']: '+(e&&e.message||e)); } } } } catch(e){ rep.errors.push('caches: '+(e&&e.message||e)); }
    try { if (window.indexedDB && typeof indexedDB.databases === 'function'){ var dbs = await indexedDB.databases(); for (var j=0;j<dbs.length;j++){ var d=dbs[j]; if(d&&d.name){ await new Promise(function(res,rej){ var rq=indexedDB.deleteDatabase(d.name); rq.onsuccess=function(){res();}; rq.onerror=function(){rej(rq.error||new Error('deleteDatabase error'));}; rq.onblocked=function(){res();}; }); rep.idb++; } } } } catch(e){ rep.errors.push('indexedDB: '+(e&&e.message||e)); }
    try { if ('serviceWorker' in navigator){ var regs = await navigator.serviceWorker.getRegistrations(); for (var k=0;k<regs.length;k++){ try { await regs[k].unregister(); rep.sw++; } catch(e){ rep.errors.push('sw: '+(e&&e.message||e)); } } } } catch(e){ rep.errors.push('sw: '+(e&&e.message||e)); }
    try { var cookies = document.cookie.split(';').map(function(s){ return s.trim(); }).filter(Boolean); for (var c=0;c<cookies.length;c++){ var name=cookies[c].split('=')[0]; document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; } rep.cookies=cookies.length; } catch(e){ rep.errors.push('cookies: '+(e&&e.message||e)); }
    return rep;
  }
  function hardReload(){ try { var u=new URL(location.href); u.searchParams.set('_cacheBust', Date.now()); location.replace(u.toString()); } catch(_) { location.reload(); } }

  // ---------- build/mount ----------
  function ensureStyles(){
    if (document.getElementById('ch16CacheBtnCSS')) return;
    var css = document.createElement('style');
    css.id = 'ch16CacheBtnCSS';
    css.textContent = [
      '@keyframes ch16spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      '#mdFlushBtn.md-btn{min-width:auto}',
      '#mdFlushBtn .ico{font-size:14px;line-height:1;vertical-align:middle;display:inline-block;margin-right:4px}',
      '#mdFlushBtn.spinning .ico{animation:ch16spin .9s linear infinite}',
      '#mdFlushBtn .lab{vertical-align:middle}'
    ].join('');
    document.head.appendChild(css);
  }
  function createBtn(){
    var b = document.createElement('button');
    b.id = 'mdFlushBtn';
    b.className = 'md-btn';
    b.title = 'Hold to clear app caches and reload';
    b.setAttribute('aria-label','Clear app cache');
    b.innerHTML = '<span class="ico" aria-hidden="true">\uD83E\uDDF9</span><span class="lab"></span>';
    return b;
  }
  function mount(){
    ensureStyles();
    var dock = document.querySelector(TARGET_SELECTOR);
    if (!dock) return;
    var btn = document.getElementById('mdFlushBtn');
    if (!btn) btn = createBtn();
    var split = dock.querySelector('.md-split');
    if (split && btn.parentNode !== dock){ dock.insertBefore(btn, split); }
    else if (!btn.parentNode){ dock.appendChild(btn); }
    bind(btn);
  }

  // ---------- interactions (spin + long-press) ----------
  function bind(btn){
    if (btn.__bound) return; btn.__bound = 1;
    var pressT=0, timer=0;
    function start(){ pressT=Date.now(); btn.classList.add('spinning'); showToast('Keep holding to confirm…'); timer=setTimeout(doClear, HOLD_MS); }
    async function doClear(){ showToast('Clearing app caches…'); try{ var rep=await clearAll(); var sum='ls:'+rep.ls+', ss:'+rep.ss+', caches:'+rep.caches+', idb:'+rep.idb+', sw:'+rep.sw+', cookies:'+rep.cookies; if(rep.errors&&rep.errors.length){ showToast('Some items could not be cleared. Proceeding to reload.', 'error'); } else { showToast('Cleared ✓ '+sum, 'ok'); } setTimeout(hardReload, 600); }catch(e){ btn.classList.remove('spinning'); showToast('Clear failed: '+(e&&e.message||e), 'error'); } }
    function end(){ clearTimeout(timer); var dt=Date.now()-pressT; if(dt<HOLD_MS){ btn.classList.remove('spinning'); showToast('Hold for '+(HOLD_MS/1000).toFixed(1)+'s to confirm'); } }
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', function(){ start(); }, {passive:true});
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
    btn.addEventListener('touchend', end);
  }

  // ---------- init (mount after micro-dock exists) ----------
  function init(){
    var tryCount=0; var iv=setInterval(function(){
      if (document.querySelector(TARGET_SELECTOR)) { clearInterval(iv); mount(); }
      if (++tryCount>100) clearInterval(iv);
    }, 60);
  }
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init, {once:true}); }
  else { init(); }
})();
