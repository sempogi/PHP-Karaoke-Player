/*! No-Duration-in-Title Hotfix v1.0.0 — Sem • 2025-10-16
 * Scope: Title Splash + Ticker (non-invasive, add-on only)
 * Goal : Prevent accidental display of full song duration in *title* fields.
 * Load : AFTER your current scripts:
 *   song_info_addons_min.js
 *   song_info_ticker_info_plus_mb.js
 *   title_splash_v3_min_fixed.js
 *   titlesplash_wire_v3_min-1.js
 *   title_splash_theme_pack_v1.js
 *   titlesplash_theme_cc_v1.js
 */
(function(window, document){
  'use strict';
  if (window.__NO_DURATION_TITLE_PATCH__) return; window.__NO_DURATION_TITLE_PATCH__='v1.0.0';

  // Feature toggle: set localStorage['noDurationInTitle']='off' to disable.
  function enabled(){ try{ return (localStorage.getItem('noDurationInTitle')||'on')==='on'; }catch(_){ return true; } }

  // Regexes to remove trailing duration tokens such as:
  //  3:45  •  12:03  •  1:02:33  •  (03:45)  •  [03:45]  •  - 03:45
  var D_RX = /([\s\-•\(\[]*)(\b(?:[0-5]?\d):[0-5]\d(?:\:[0-5]\d)?\b)([\)\]]*)\s*$/; // at end
  var DUR_WORD_RX = /\b(duration|length)\s*[:=]\s*(?:[0-5]?\d:[0-5]\d(?:\:[0-5]\d)?)\b\s*$/i;

  function stripDuration(s){
    try{
      if (!s) return s;
      var out = String(s).trim();
      // Remove explicit 'Duration: mm:ss' at the end
      out = out.replace(DUR_WORD_RX, '').trim();
      // Remove generic trailing time tokens once; loop to be safe (e.g., duplicates)
      var guard=0; while (D_RX.test(out) && guard++<3){ out = out.replace(D_RX, '').trim(); }
      // Collapse leftover separators
      out = out.replace(/[\-•]+\s*$/,'').trim();
      return out;
    }catch(e){ return s; }
  }

  // --- Patch TitleSplash.show() to sanitize payload.title only
  (function wrapTitleSplash(){
    var TS = window.TitleSplash; if (!TS || typeof TS.show!=='function' || TS.show.__noDur) return;
    var _show = TS.show;
    TS.show = function(payload){
      if (!enabled()) return _show.apply(this, arguments);
      try{
        if (payload && typeof payload==='object'){
          var p = Object.assign({}, payload);
          if (p.title) p.title = stripDuration(p.title);
          return _show.call(this, p);
        } else if (typeof payload==='string'){
          return _show.call(this, stripDuration(payload));
        }
      }catch(_){ }
      return _show.apply(this, arguments);
    };
    TS.show.__noDur = 1;
  })();

  // --- If updateTicker/setNowPlaying exist, wrap them to sanitize title
  (function wrapTicker(){
    function wrap(obj, name){
      if (!obj || typeof obj[name] !== 'function' || obj[name].__noDur) return;
      var fn = obj[name];
      obj[name] = function(){
        if (!enabled()) return fn.apply(this, arguments);
        try{
          var a = Array.prototype.slice.call(arguments);
          // Try common shapes: (title, artist, ...) or ({title, artist, ...})
          if (a.length && typeof a[0] === 'string') a[0] = stripDuration(a[0]);
          else if (a.length && a[0] && typeof a[0] === 'object' && a[0].title){ a[0] = Object.assign({}, a[0], { title: stripDuration(a[0].title) }); }
          return fn.apply(this, a);
        }catch(_){ return fn.apply(this, arguments); }
      };
      obj[name].__noDur = 1;
    }
    wrap(window, 'updateTicker');
    wrap(window, 'setNowPlaying');
  })();

  // --- Fallback DOM watcher: sanitize specific nodes if other hooks miss
  (function domFallback(){
    var SEL = [
      '#tsTitle',              // TitleSplash v3 title element (common)
      '#titleSplashWrap #tsTitle',
      '#tickerTitle',          // typical ticker title id
      '.ticker .title',        // generic ticker class
      '.nowplaying .title',    // common np-title
      '#tickerInfo .title'
    ];
    function sanitizeNode(n){ try{ var txt=n.textContent; var out=stripDuration(txt); if (out!==txt) n.textContent=out; }catch(_){}}
    function runOnce(){ SEL.forEach(function(sel){ var el = document.querySelector(sel); if (el) sanitizeNode(el); }); }
    try{
      var mo = new MutationObserver(function(list){
        for (var i=0;i<list.length;i++){
          var m=list[i]; if (m.type==='childList' || m.type==='characterData'){
            SEL.forEach(function(sel){ var el = document.querySelector(sel); if (el) sanitizeNode(el); });
          } else if (m.type==='attributes' && m.attributeName==='class'){
            runOnce();
          }
        }
      });
      mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class'] });
      // initial pass
      if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', runOnce, {once:true}); else runOnce();
    }catch(_){ runOnce(); }
  })();
})(window, document);
