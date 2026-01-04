// viz_rainbow_patch.js
// Generated: 2025-09-26 09:55
// Adds rainbow/flow visualizer modes + Show/Hide toggle + CC controls, without touching core code.
// Modes: 'solid' (existing single color), 'rainbow' (static spectrum), 'flow' (animated rainbow)

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function hsl(h,s,l){ h=(h%360+360)%360; return 'hsl('+h+','+Math.round(s*100)+'%,'+Math.round(l*100)+'%)'; }

  // Persistent settings
  var vizMode  = localStorage.getItem('vizMode')  || 'solid';   // 'solid' | 'rainbow' | 'flow'
  var vizSpeed = parseFloat(localStorage.getItem('vizSpeed') || '0.12'); // revs/sec for 'flow'
  var vizShow  = (localStorage.getItem('vizShow')||'on')==='on';
  var vizSat   = parseFloat(localStorage.getItem('vizSat') || '0.95');
  var vizLight = parseFloat(localStorage.getItem('vizLight') || '0.55');

  function setVizShow(on){ vizShow=!!on; try{ localStorage.setItem('vizShow', on?'on':'off'); }catch(e){} var host=document.querySelector('.visual'); if(host){ host.style.display = on? '' : 'none'; } }
  function setVizMode(m){ vizMode=m; try{ localStorage.setItem('vizMode', m); }catch(e){} paintCC(); }
  function setVizSpeed(v){ vizSpeed = Math.max(0, parseFloat(v||0.12)||0); try{ localStorage.setItem('vizSpeed', String(vizSpeed)); }catch(e){} paintCC(); }

  // 1) Attach minimal CSS (active chip highlight)
  try{
    var st=document.createElement('style'); st.id='viz-rainbow-css';
    st.textContent = '\n#ccVizMode button.active{ outline:2px solid var(--hl); outline-offset:2px }\n';
    document.head.appendChild(st);
  }catch(e){}

  // 2) Inject Control Center row (Visualizer)
  function injectCC(){
    try{
      var cc = document.getElementById('ccPanel'); if(!cc) return;
      var list = cc.querySelector('.list'); if(!list) return;
      if (document.getElementById('ccVizRow')) return; // already added
      var row = document.createElement('div'); row.className='row'; row.id='ccVizRow';
      row.innerHTML = '\n  <span class="label">Visualizer</span>\n  <div class="chips" id="ccVizMode">\n    <button class="small" data-viz="solid"  title="Use single color (your highlight color)">Solid</button>\n    <button class="small" data-viz="rainbow" title="Static rainbow across width">Rainbow</button>\n    <button class="small" data-viz="flow"    title="Animated rainbow sweep">Flow</button>\n  </div>\n  <button id="ccVizShow" class="small" style="margin-left:8px"></button>\n  <label class="small" style="margin-left:8px">Speed <input type="range" id="ccVizSpeed" min="0" max="0.6" step="0.01" style="width:120px"></label>';
      list.appendChild(row);

      // Wire
      var box = document.getElementById('ccVizMode');
      if (box){
        box.addEventListener('click', function(e){ var b=e.target.closest('button[data-viz]'); if(!b) return; setVizMode(b.getAttribute('data-viz')||'solid'); });
      }
      var speed = document.getElementById('ccVizSpeed'); if(speed){ speed.value = String(vizSpeed); speed.addEventListener('input', function(){ setVizSpeed(speed.value); }); }
      var btn = document.getElementById('ccVizShow'); if(btn){ btn.addEventListener('click', function(){ setVizShow(!vizShow); paintCC(); }); }
    }catch(e){}
  }
  function paintCC(){
    try{
      var box = document.getElementById('ccVizMode'); if(box){ box.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-viz')||'')===vizMode); }); }
      var btn = document.getElementById('ccVizShow'); if(btn){ btn.textContent = vizShow? 'Hide' : 'Show'; btn.classList.toggle('active', vizShow); }
      var speed = document.getElementById('ccVizSpeed'); if(speed){ speed.value = String(vizSpeed); }
    }catch(e){}
  }

  // 3) Patch runTimers() to draw rainbow/flow/solid, respecting Show/Hide
  function patchRunTimers(){
    if (typeof window.runTimers !== 'function') return false;
    if (window.__origRunTimers) return true; // already patched

    window.__origRunTimers = window.runTimers;

    window.runTimers = function(){
      // keep the time ticker loop intact from original
      try{ cancelAnimationFrame(window.rafTime); }catch(e){}
      (function t(){ try{ ui.time.textContent = fmt(isPlaying ? (ac.currentTime - (songStart||0)) : 0); }catch(e){} window.rafTime = requestAnimationFrame(t); })();

      // Visualization loop (ours)
      try{ cancelAnimationFrame(window.rafViz); }catch(e){}
      var ctx = (ui && ui.canvas) ? ui.canvas.getContext('2d') : null;
      var data = new Uint8Array( (typeof analyser!=='undefined' && analyser)? analyser.frequencyBinCount : 1024 );

      (function v(){
        try{
          if (!ctx){ window.rafViz = requestAnimationFrame(v); return; }
          var W = ui.canvas.width, H = ui.canvas.height;
          ctx.clearRect(0,0,W,H);

          if (vizShow){
            if (typeof analyser!=='undefined' && analyser){ analyser.getByteFrequencyData(data); }
            var bars = Math.max(16, Math.min(96, Math.floor(W/18)));
            var step = Math.max(1, Math.floor((data.length||1024)/bars));
            var bw = W/bars;

            var t = performance.now()*0.001; // seconds
            var baseHue = (vizMode==='flow') ? (t*360*vizSpeed) : 0;

            for (var i=0;i<bars;i++){
              var val = data[i*step]||0; var hBar = (val/255)*H;
              var hue = baseHue + (i/bars)*360;
              var fill = (vizMode==='solid') ? (window.vizBarColor || '#4fd1ff') : hsl(hue, vizSat, vizLight);
              ctx.fillStyle = fill;
              ctx.fillRect(i*bw, H-hBar, bw*0.8, hBar);
            }
          }
        }catch(e){}
        window.rafViz = requestAnimationFrame(v);
      })();
    };

    return true;
  }

  // 4) Initialize
  onReady(function(){
    // Apply Show/Hide immediately
    setVizShow(vizShow);
    // Inject UI row
    injectCC(); paintCC();

    // Patch and restart timers (cancel old loop if any)
    var ok = patchRunTimers();
    try{ cancelAnimationFrame(window.rafViz); cancelAnimationFrame(window.rafTime); }catch(e){}
    try{ if (typeof window.runTimers==='function') window.runTimers(); }catch(e){}

    // Export tiny console helpers
    window.__VIZ = {
      setMode: function(m){ setVizMode(m||'solid'); return vizMode; },
      setShow: function(on){ setVizShow(!!on); paintCC(); return vizShow; },
      setSpeed: function(s){ setVizSpeed(s); return vizSpeed; }
    };
  });
})();
