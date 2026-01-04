
/* === Song Info — Ticker Info-Plus (iTunes + MusicBrainz + CAA; candy pop) ===
 * Purpose: append Artist • Album • Year + MB Release info + CAA thumb to BOTH marquee copies
 *          AFTER your updateTicker() rebuilds html+html. Safe, post-rebuild injection.
 * Design: candy pop — gradient pill, sparkle dot, tiny cover thumb.
 */
(function(){
  /* ---------------- Config ---------------- */
  var CFG = {
    MAX_LEN: 100,
    SEP: ' — ',
    COUNTRY: (localStorage.getItem('songInfoCountry') || 'US'),
    CAA_THUMB: 50,   // use 250 or 500 when available; will scale down
    DELAY_MS: 40     // delay after rebuild before injecting
  };

  /* ---------------- Style (candy pop) ---------------- */
  function ensureStyle(){
    if (document.getElementById('siTickerPopStyle')) return;
    var css = [
      '.si-info-pop{display:inline-flex;align-items:center;gap:.35em; padding:.1em .5em; border-radius:999px;',
      'background:linear-gradient(90deg,#ff76b9,#ffd86a); color:#081018; box-shadow:0 2px 10px rgba(255,118,185,.35);',
      'font-weight:600; font-size:.85em; vertical-align:middle;}',
      '.si-info-pop .si-thumb{width:18px;height:18px;border-radius:4px;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.7);}',
      '.si-info-pop .si-badge{display:inline-flex;align-items:center;gap:.25em;background:rgba(255,255,255,.75);color:#3a3a3a;',
      'border-radius:999px;padding:.05em .35em;font-size:.75em;font-weight:700;}',
      '.si-info-pop .si-spark{display:inline-block;width:.45em;height:.45em;border-radius:50%;',
      'background:radial-gradient(circle,#fff,#ffeaa5 60%,#ff7cc4 100%);box-shadow:0 0 8px #ff7cc4;}',
      '.si-info-pop .si-text{white-space:nowrap;}',
    ].join('');
    var el = document.createElement('style'); el.id='siTickerPopStyle'; el.textContent = css; document.head.appendChild(el);
  }

  /* ---------------- Helpers ---------------- */
  function findTrack(){ try{ if(window.ui && ui.tickerTrack) return ui.tickerTrack; }catch(_){} return document.querySelector('#tickerTrack')||document.querySelector('.ticker .ticker-track')||document.querySelector('.ticker'); }
  function stripExt(s){ if(!s) return ''; s=String(s).split('/').pop(); var i=s.lastIndexOf('.'); return (i>0? s.slice(0,i): s); }
  function cleanNoise(s){ return String(s||'').replace(/\s+/g,' ').replace(/[_]+/g,' ').replace(/[【】]/g,' ').replace(/[\[(].*?(karaoke|instrumental|lyrics|official).*?[\])]*/gi,'').replace(/\s*(official|lyrics|audio|video|instrumental|minus\s*one|karaoke|remix|cover|hd|hq)\b.*$/i,'').replace(/\s{2,}/g,' ').trim(); }
  function guess(base){ var raw=cleanNoise(stripExt(base||'')); var artist='', title=''; if(raw.indexOf(' - ')>=0){ var parts=raw.split(' - '); var left=parts[0].trim(), right=parts.slice(1).join(' - ').trim(); var rightArtist=/\b(feat\.?|ft\.? )\b/i.test(right)||/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(right); if(rightArtist){ title=left; artist=right.replace(/\b(feat\.?|ft\.? )\b.*$/i,'').trim(); } else { artist=left.replace(/\b(feat\.?|ft\.? )\b.*$/i,'').trim(); title=right; } } else { title=raw; } return { q: (artist? artist+' '+title: title), artist:artist, title:title }; }
  function readBase(){ try{ return (window.lastPlayed && lastPlayed.name) ? lastPlayed.name : (window.currentSong ? stripExt(String(window.currentSong)) : ''); }catch(_){ return ''; } }

  /* ---------------- Net + Cache ---------------- */
  function fetchTO(url, ms){ var ctrl=new AbortController(); var t=setTimeout(function(){ try{ctrl.abort();}catch(_){ } }, ms||10000); return fetch(url,{signal:ctrl.signal}).finally(function(){ clearTimeout(t); }); }
  function jsonp(url, cbParam){ return new Promise(function(resolve){ var cb='__IT_CB_'+Date.now()+'_'+(Math.random()*1e6|0); window[cb]=function(d){ try{ resolve(d); } finally{ try{ delete window[cb]; }catch(_){ } } }; var s=document.createElement('script'); s.src=url+(url.indexOf('?')>=0?'&':'?')+(cbParam||'callback')+'='+cb; s.async=true; s.onerror=function(){ resolve(null); }; document.body.appendChild(s); setTimeout(function(){ try{ s.remove(); }catch(_){ } }, 20000); }); }
  function qITunes(term){ var url='https://itunes.apple.com/search?term='+encodeURIComponent(term)+'&media=music&entity=song&country='+encodeURIComponent(CFG.COUNTRY)+'&limit=3'; return fetchTO(url,10000).then(function(r){ if(r&&r.ok) return r.json(); return jsonp(url,'callback'); }).catch(function(){ return jsonp(url,'callback'); }); }
  function qMBRecording(title, artist){ var q=(title&&artist)? 'recording:"'+title+'" AND artist:"'+artist+'"' : '"'+String(title||artist||'').trim()+'"'; var url='https://musicbrainz.org/ws/2/recording?query='+encodeURIComponent(q)+'&fmt=json&limit=5'; return fetchTO(url,10000).then(function(r){ return r&&r.ok? r.json(): null; }); }
  function mbRecordingReleases(recID){ var url='https://musicbrainz.org/ws/2/recording/'+encodeURIComponent(recID)+'?inc=releases&fmt=json'; return fetchTO(url,10000).then(function(r){ return r&&r.ok? r.json(): null; }); }
  function qCAARelease(relMBID){ var url='https://coverartarchive.org/release/'+encodeURIComponent(relMBID)+'/'; return fetchTO(url,10000).then(function(r){ return r&&r.ok? r.json(): null; }).then(function(d){ if(!d||!Array.isArray(d.images)||!d.images.length) return null; var pick=d.images.find(function(x){return x.front;})||d.images[0]; var tn=pick.thumbnails||{}; return { small: tn['250']||tn.small||pick.image, large: tn['500']||tn.large||pick.image, full: pick.image||'', types: pick.types||[] }; }); }

  var CK_IT = 'songInfoTickerInfoCacheV1';
  var CK_MB = 'songInfoTickerMBCacheV1';
  function load(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}'); }catch(_){ return {}; } }
  function save(k,o){ try{ localStorage.setItem(k, JSON.stringify(o||{})); }catch(_){ } }

  /* ---------------- Inject (post-rebuild) ---------------- */
  function injectCandy(infoObj){ // infoObj: { text, label, country, thumb }
    ensureStyle();
    var track = findTrack(); if(!track) return;
    var nodes = track.querySelectorAll('.ticker-item.playing'); if(!nodes||!nodes.length) return;
    var text = String(infoObj.text||'').trim();
    if (CFG.MAX_LEN>0 && text.length>CFG.MAX_LEN) text = text.slice(0, CFG.MAX_LEN-1)+'…';

    for (var i=0;i<nodes.length;i++){
      var node = nodes[i];
      var infoSpan = node.querySelector('.si-info-pop');
      if(!infoSpan){ infoSpan = document.createElement('span'); infoSpan.className='si-info-pop'; node.appendChild(infoSpan); }
      // build inner
      var html = '';
      if(infoObj.thumb){ html += '<img class="si-thumb" src="'+infoObj.thumb+'" alt="">'; }
      html += '<span class="si-text">'+text+'</span>';
      if(infoObj.label){ html += '<span class="si-badge">'+escapeHtml(infoObj.label)+'</span>'; }
      if(infoObj.country){ html += '<span class="si-badge">'+escapeHtml(infoObj.country)+'</span>'; }
      html += '<span class="si-spark"></span>';
      infoSpan.innerHTML = html;
    }
  }
  function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]); }); }
  function reapplyAfterRedraw(infoObj){ requestAnimationFrame(function(){ setTimeout(function(){ injectCandy(infoObj||{}); }, CFG.DELAY_MS); }); }

  /* ---------------- Compose Info ---------------- */
  function composeFromIT(IT){ if(!IT||!Array.isArray(IT.results)||!IT.results.length) return ''; var top=IT.results[0]; var artist=top.artistName||''; var album=top.collectionName||''; var year=''; try{ year=top.releaseDate? (new Date(top.releaseDate).getFullYear()):''; }catch(_){} var parts=[]; if(artist) parts.push(artist); if(album) parts.push(album); if(year) parts.push(String(year)); return parts.join(' • '); }
  function pickRelease(det){ var rels = det && det.releases || []; if(!rels.length) return null; // prefer Official with date
    rels.sort(function(a,b){ var sa=(a.status==='Official'?0:1), sb=(b.status==='Official'?0:1); var da=(a.date||''), db=(b.date||''); return sa-sb || String(da).localeCompare(String(db)); });
    return rels[0]; }

  function autoInfoPlus(){
    var base = readBase(); if(!base){ reapplyAfterRedraw({ text:'' }); return; }
    var itCache = load(CK_IT), mbCache = load(CK_MB);
    var key = base.toLowerCase();

    var infoText = itCache[key] || '';
    var g = guess(base);

    function finalize(label, country, thumb){ reapplyAfterRedraw({ text: infoText || (g.artist? (g.artist+' • '+g.title): g.title), label: label||'', country: country||'', thumb: thumb||'' }); }

    // 1) iTunes fast
    if (!infoText){ qITunes(g.q||g.title).then(function(IT){ infoText = composeFromIT(IT) || infoText; if(infoText){ itCache[key]=infoText; save(CK_IT,itCache); } }).finally(function(){ proceedMB(); }); }
    else { proceedMB(); }

    // 2) MusicBrainz + CAA
    function proceedMB(){
      var mb = mbCache[key]; if(mb){ finalize(mb.label, mb.country, mb.thumb); return; }
      qMBRecording(g.title, g.artist).then(function(MB){ if(!MB||!Array.isArray(MB.recordings)||!MB.recordings.length){ finalize('', '', ''); return; }
        var rec = MB.recordings[0]; return mbRecordingReleases(rec.id).then(function(det){ var rel = pickRelease(det); if(!rel){ finalize('', '', ''); return; }
          var label=''; try{ var li = rel['label-info']||[]; if(li.length && li[0].label && li[0].label.name) label = li[0].label.name; }catch(_){}
          var country = rel.country || (rel['release-events'] && rel['release-events'][0] && rel['release-events'][0].area && rel['release-events'][0].area.name) || '';
          return qCAARelease(rel.id).then(function(caa){ var thumb = caa && (caa.small||caa.large||caa.full) || ''; mbCache[key] = { label: label, country: country, thumb: thumb }; save(CK_MB, mbCache); finalize(label, country, thumb); });
        });
      }).catch(function(){ finalize('', '', ''); });
    }
  }

  /* ---------------- Hooks ---------------- */
  (function hookSP(){ if(typeof window.setNowPlaying==='function' && !window.__SI_TICKER_POP_SP){ var orig=window.setNowPlaying; window.setNowPlaying=function(rel,title){ try{ orig.apply(this, arguments); }catch(_){} autoInfoPlus(); }; window.__SI_TICKER_POP_SP=true; } })();
  (function hookUT(){ if(typeof window.updateTicker==='function' && !window.__SI_TICKER_POP_UT){ var orig=window.updateTicker; window.updateTicker=function(){ try{ orig.apply(this, arguments); }catch(_){} autoInfoPlus(); }; window.__SI_TICKER_POP_UT=true; } })();

  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', autoInfoPlus); }
  else { autoInfoPlus(); }

  /* ---------------- Manual API ---------------- */
  window.__SI_TICKER_INFO_PLUS = {
    test: function(txt){ reapplyAfterRedraw({ text:String(txt||'') }); },
    clearAll: function(){ try{ localStorage.removeItem(CK_IT); localStorage.removeItem(CK_MB); }catch(_){} },
    setMaxLen: function(n){ CFG.MAX_LEN = Number(n)||0; autoInfoPlus(); },
    setDelay: function(ms){ CFG.DELAY_MS = Number(ms)||40; },
    setCountry: function(c){ try{ localStorage.setItem('songInfoCountry', String(c||'US')); CFG.COUNTRY = String(c||'US'); }catch(_){} autoInfoPlus(); }
  };
})();
