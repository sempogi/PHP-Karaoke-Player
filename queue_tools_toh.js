
// queue_tools_toh.js
// Tailored for TOH Player (uses global `q` array + renderQueue()).
// Adds Control Center → Queue Tools: Clear Queue, Auto‑Queue (count + mode), and Auto‑Queue Now.
// Auto‑Queue triggers when player status becomes IDLE *and* queue is empty (safe with feedNextIfAny).

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // ===== Settings (persist) =====
  var aqEnable = (localStorage.getItem('aqEnable')||'off')==='on';
  var aqCount  = clamp(parseInt(localStorage.getItem('aqCount')||'5',10)||5, 1, 50);
  var aqMode   = (localStorage.getItem('aqMode')||'random'); // 'random' | 'sequential'
  var aqCursor = parseInt(localStorage.getItem('aqCursor')||'0',10)||0;  // for sequential mode

  // ===== Core helpers bound to TOH =====
  function queueArray(){ return (typeof window.q !== 'undefined' && Array.isArray(window.q)) ? window.q : (window.q = []); }
  function redraw(){ try{ if (typeof window.renderQueue==='function') window.renderQueue(); }catch(e){} }
  function isPlaying(){ try{ return !!window.isPlaying; }catch(e){ return false; } }

  function getQueueCount(){ try{ return queueArray().length; }catch(e){ return 0; } }

  function getVisiblePlaylist(){
    var rows = $all('#playlist .row');
    var out = [];
    for (var i=0;i<rows.length;i++){
      var r = rows[i];
      // Respect current search/filter (display:none means filtered out)
      if (r && r.style && r.style.display==='none') continue;
      var a = r.querySelector('a.song');
      if (!a) continue;
      var rel = a.getAttribute('data-path')||'';
      if (!rel) continue;
      var name = (a.dataset && a.dataset.name) ? a.dataset.name : (a.textContent||'').trim();
      if (!name) name = rel.split('/').pop().replace(/\.(mid|midi|kar)$/i,'');
      var title = a.getAttribute('title') || rel;
      out.push({ rel: rel, name: name, path: title });
    }
    return out;
  }

  function shuffle(arr){ for (var i=arr.length-1; i>0; i--){ var j = (Math.random()*(i+1))|0; var t = arr[i]; arr[i]=arr[j]; arr[j]=t; } return arr; }

  function addToQueueItems(items){
    var q = queueArray();
    var added = 0;
    for (var i=0;i<items.length;i++){
      var it = items[i];
      if (!it || !it.rel) continue;
      // avoid duplicate of exact same rel already in queue (optional)
      if (q.some(function(x){ return x && (x.rel===it.rel); })) continue;
      q.push({ rel: it.rel, name: it.name, path: it.path });
      added++;
    }
    if (added>0) redraw();
    return added;
  }

  function clearQueue(){ var q = queueArray(); q.length = 0; redraw(); return true; }

  function autoQueueIfNeeded(){
    if (!aqEnable) return;
    if (isPlaying()) return;           // only fill when player is idle
    if (getQueueCount() > 0) return;   // only when queue is empty

    var pl = getVisiblePlaylist();
    if (!pl.length) return;

    var picks = [];
    if (aqMode === 'sequential'){
      for (var i=0;i<aqCount;i++){
        var idx = (aqCursor + i) % pl.length;
        picks.push(pl[idx]);
      }
      aqCursor = (aqCursor + aqCount) % pl.length;
      try{ localStorage.setItem('aqCursor', String(aqCursor)); }catch(e){}
    } else {
      picks = shuffle(pl.slice()).slice(0, aqCount);
    }
    addToQueueItems(picks);
  }

  // ===== CC UI =====
  function injectCC(){
    var cc = $('#ccPanel'); if (!cc) return;
    var list = cc.querySelector('.list'); if (!list) return;
    if ($('#ccAQRow')) return;

    var row = document.createElement('div'); row.className='row'; row.id='ccAQRow';
    row.innerHTML =
      '<span class="label">Queue Tools</span>'+
      '<div class="chips" id="ccAQMode" style="margin-right:8px">'+
        '<button class="small" data-mode="random">Random</button>'+
        '<button class="small" data-mode="sequential">Sequential</button>'+
      '</div>'+
      '<label class="small">Auto-Queue: <input type="checkbox" id="ccAQEnable"></label>'+
      '<label class="small" style="margin-left:8px">Count '+
        '<input type="number" id="ccAQCount" min="1" max="50" step="1" style="width:64px">'+
      '</label>'+
      '<button id="ccAQRun" class="small" style="margin-left:8px" title="Fill now if empty">Auto-Queue Now</button>'+
      '<button id="ccAQClear" class="small" style="margin-left:8px" title="Clear the entire queue">Clear Queue</button>';
    list.appendChild(row);

    var modeBox = $('#ccAQMode');
    var en = $('#ccAQEnable');
    var cnt = $('#ccAQCount');
    var btnRun = $('#ccAQRun');
    var btnClear = $('#ccAQClear');

    function paint(){
      if (en) en.checked = aqEnable;
      if (cnt) cnt.value = String(aqCount);
      if (modeBox){ $all('button', modeBox).forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-mode')||'')===aqMode); }); }
    }
    paint();

    modeBox && modeBox.addEventListener('click', function(e){
      var b = e.target.closest('button[data-mode]'); if (!b) return;
      aqMode = b.getAttribute('data-mode') || 'random';
      try{ localStorage.setItem('aqMode', aqMode); }catch(e){}
      paint();
    });
    en && en.addEventListener('change', function(){
      aqEnable = !!en.checked; try{ localStorage.setItem('aqEnable', aqEnable?'on':'off'); }catch(e){}
      if (aqEnable) autoQueueIfNeeded();
    });
    cnt && cnt.addEventListener('change', function(){
      var v = clamp(parseInt(cnt.value,10)||5,1,50);
      aqCount = v; cnt.value = String(v);
      try{ localStorage.setItem('aqCount', String(aqCount)); }catch(e){}
    });
    btnRun && btnRun.addEventListener('click', function(){ autoQueueIfNeeded(); });
    btnClear && btnClear.addEventListener('click', function(){ clearQueue(); });
  }

  // ===== Hook setStatus in a chain‑safe way =====
  function hookStatus(){
    var prev = window.setStatus;
    window.setStatus = function(msg){
      try{ typeof prev==='function' && prev(msg); }catch(e){}
      try{ if (msg === 'IDLE') autoQueueIfNeeded(); }catch(e){}
    };
  }

  // Expose small console helpers
  window.__AQ = {
    run: autoQueueIfNeeded,
    setEnable: function(on){ aqEnable=!!on; try{ localStorage.setItem('aqEnable', on?'on':'off'); }catch(e){} return aqEnable; },
    setCount:  function(n){ aqCount=clamp(parseInt(n,10)||5,1,50); try{ localStorage.setItem('aqCount', String(aqCount)); }catch(e){} return aqCount; },
    setMode:   function(m){ aqMode=(m==='sequential'?'sequential':'random'); try{ localStorage.setItem('aqMode', aqMode); }catch(e){} return aqMode; },
    get: function(){ return { enable:aqEnable, count:aqCount, mode:aqMode, cursor:aqCursor, queue:getQueueCount() }; },
    clear: clearQueue
  };

  onReady(function(){ injectCC(); hookStatus(); setTimeout(autoQueueIfNeeded, 600); });
})();
