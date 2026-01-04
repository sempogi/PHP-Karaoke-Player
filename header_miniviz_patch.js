// header_miniviz_patch.js
// Generated: 2025-09-26 13:18
// Full-width configurable mini visualizer strip under the header for TOH/KaraokeHD Player.
// - Uses existing global `analyser` if available; falls back to idle wave.
// - Control Center → MiniViz row with: Enable, Height, Bars, Opacity, Smoothing, Sensitivity,
//   Color Mode (HL/Fixed), Color Picker, Mirror.
// - Non-destructive: creates its own <div id="hdMiniVizWrap"><canvas id="hdMiniViz"></canvas></div> right after <header>.
// - Chain-safe setStatus hook.

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // ==== Settings (persist) ====
  var mvEnable = (localStorage.getItem('mvEnable')||'off')==='on';
  var mvH      = clamp(parseInt(localStorage.getItem('mvH')||'6',10)||6, 2, 20);          // px
  var mvBars   = clamp(parseInt(localStorage.getItem('mvBars')||'48',10)||48, 8, 128);    // count
  var mvOpacity= clamp(parseInt(localStorage.getItem('mvOpacity')||'80',10)||80, 10, 100);// %
  var mvSmooth = clamp(parseInt(localStorage.getItem('mvSmooth')||'30',10)||30, 0, 95);   // % (internal smoothing)
  var mvSens   = Math.max(0.2, Math.min(4.0, parseFloat(localStorage.getItem('mvSens')||'1.0')||1.0));
  var mvMode   = (localStorage.getItem('mvColorMode')||'hl'); // 'hl' | 'fixed'
  var mvColor  = localStorage.getItem('mvColor') || '#4fd1ff';
  var mvMirror = (localStorage.getItem('mvMirror')||'on')==='on';

  // ==== DOM/CSS ====
  function injectCSS(){
    if ($('#mv-css')) return;
    var st=document.createElement('style'); st.id='mv-css';
    st.textContent = `
#hdMiniVizWrap{ position:relative; z-index:2; }
#hdMiniViz{ display:block; width:100%; height:${mvH}px; }
/* When disabled, keep element out of layout */
#hdMiniVizWrap.off{ display:none }
/* Respect reduced motion */
@media (prefers-reduced-motion: reduce){ #hdMiniViz{ display:none !important } }
`;
    document.head.appendChild(st);
  }

  var wrap=null, cvs=null, ctx=null, lastW=0, lastH=0, raf=0;
  var smoothArr=[]; // per-bar smoothing store

  function ensureCanvas(){
    if (wrap && cvs && ctx) return true;
    var header = $('header'); if(!header) return false;
    injectCSS();
    wrap = document.getElementById('hdMiniVizWrap');
    if(!wrap){
      wrap = document.createElement('div'); wrap.id='hdMiniVizWrap';
      header.insertAdjacentElement('afterend', wrap);
    }
    cvs = document.getElementById('hdMiniViz');
    if(!cvs){
      cvs = document.createElement('canvas'); cvs.id='hdMiniViz';
      wrap.appendChild(cvs);
    }
    ctx = cvs.getContext('2d');
    resize();
    return true;
  }

  function resize(){
    if(!cvs) return;
    var cssH = mvH; // px
    cvs.style.height = cssH+'px';
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    var w = Math.floor((document.documentElement.clientWidth||window.innerWidth||cvs.clientWidth||1200));
    var h = Math.max(2, Math.floor(cssH * dpr));
    if (w!==lastW || h!==lastH){
      lastW=w; lastH=h; cvs.width=w*dpr; cvs.height=h; cvs.style.width=w+'px';
      // Not multiplying width by dpr because we already inflated via css width? Keep simple; rely on height dpr primarily.
      // Clear smoothing cache
      smoothArr.length = 0;
    }
  }

  // ==== Drawing ====
  function barColor(){
    if(mvMode==='fixed') return mvColor;
    // Use CSS --hl; fallback to fixed if missing
    var cs = getComputedStyle(document.documentElement);
    var hl = cs.getPropertyValue('--hl').trim() || mvColor;
    return hl;
  }

  function drawFrame(){
    cancelAnimationFrame(raf);
    if(!mvEnable || !wrap || !cvs || !ctx){ return; }
    var w=cvs.width, h=cvs.height; if(w<=0||h<=0){ raf=requestAnimationFrame(drawFrame); return; }
    ctx.clearRect(0,0,w,h);

    var bars = mvBars|0; if(bars<1) bars=1; if(bars>256) bars=256;
    var bw = Math.max(1, Math.floor(w / bars));
    var gap = Math.max(0, Math.floor(bw*0.16));
    var barW = Math.max(1, bw-gap);

    var data=null;
    try{ if(window.analyser && typeof window.analyser.getByteFrequencyData==='function'){
      data = new Uint8Array(window.analyser.frequencyBinCount);
      window.analyser.getByteFrequencyData(data);
    } }catch(e){}

    // Compute bar heights (0..1)
    var vals = new Array(bars);
    if(data && data.length){
      // map bars linearly across spectrum; could be log later
      for(var i=0;i<bars;i++){
        var idx = Math.floor((i/(bars-1||1)) * (data.length-1));
        var v = (data[idx]||0)/255; // 0..1
        // sensitivity
        v = Math.pow(v, 1/Math.max(0.2, mvSens));
        // smoothing (EMA)
        var s = (smoothArr[i] == null ? v : (smoothArr[i]*(mvSmooth/100) + v*(1 - (mvSmooth/100))));
        smoothArr[i] = s;
        vals[i] = s;
      }
    } else {
      // idle wave
      var t = performance.now()/1000;
      for(var k=0;k<bars;k++){
        var s = 0.35 + 0.25*Math.sin(t*2 + k*0.35);
        var sm = (smoothArr[k] == null ? s : (smoothArr[k]*0.8 + s*0.2));
        smoothArr[k] = sm; vals[k]=sm;
      }
    }

    ctx.globalAlpha = mvOpacity/100;
    ctx.fillStyle = barColor();

    if(mvMirror){
      // Draw mirrored from center
      var half = Math.floor(bars/2);
      for(var i=0;i<half;i++){
        var v=vals[i]; var bh = Math.max(1, Math.round(v*h));
        var xL = i*bw; var xR = w - (i+1)*bw;
        ctx.fillRect(xL, h-bh, barW, bh);
        ctx.fillRect(xR, h-bh, barW, bh);
      }
      if (bars%2===1){ // center bar
        var vC = vals[half]; var bhC = Math.max(1, Math.round(vC*h));
        var xC = half*bw; ctx.fillRect(xC, h-bhC, barW, bhC);
      }
    } else {
      for(var i=0;i<bars;i++){
        var v=vals[i]; var bh = Math.max(1, Math.round(v*h));
        var x = i*bw;
        ctx.fillRect(x, h-bh, barW, bh);
      }
    }

    raf = requestAnimationFrame(drawFrame);
  }

  function start(){ if(!ensureCanvas()) return; wrap.classList.toggle('off', !mvEnable); if(mvEnable){ resize(); cancelAnimationFrame(raf); raf=requestAnimationFrame(drawFrame); } else { cancelAnimationFrame(raf); } }

  // ==== Control Center UI ====
  function injectCC(){
    var cc = $('#ccPanel'); if(!cc) return; var list = cc.querySelector('.list'); if(!list) return; if($('#ccMiniVizRow')) return;
    var row = document.createElement('div'); row.className='row'; row.id='ccMiniVizRow';
    row.innerHTML = '\n'
      + '<span class="label">MiniViz</span>'
      + '<label class="small"><input type="checkbox" id="mvEnable"> Enable</label>'
      + '<label class="small" style="margin-left:8px">Height <input type="range" id="mvH" min="2" max="20" step="1" style="width:120px"> <span id="mvHLbl" class="small"></span> px</label>'
      + '<label class="small" style="margin-left:8px">Bars <input type="range" id="mvBars" min="8" max="128" step="1" style="width:120px"> <span id="mvBarsLbl" class="small"></span></label>'
      + '<label class="small" style="margin-left:8px">Opacity <input type="range" id="mvOpacity" min="10" max="100" step="1" style="width:110px"> <span id="mvOpLbl" class="small"></span>%</label>'
      + '<label class="small" style="margin-left:8px">Smooth <input type="range" id="mvSmooth" min="0" max="95" step="1" style="width:110px"> <span id="mvSmLbl" class="small"></span>%</label>'
      + '<label class="small" style="margin-left:8px">Sens <input type="range" id="mvSens" min="20" max="400" step="5" style="width:110px"> <span id="mvSensLbl" class="small"></span>%</label>'
      + '<div class="chips" style="margin-left:8px" id="mvColors">'
      + '  <button class="small" data-col="hl">Use HL</button>'
      + '  <button class="small" data-col="fixed">Fixed</button>'
      + '</div>'
      + '<input type="color" id="mvColor" value="#4fd1ff" title="Color" style="margin-left:6px; width:28px; height:22px; background:transparent; border:1px solid rgba(255,255,255,.15); border-radius:6px">'
      + '<label class="small" style="margin-left:8px"><input type="checkbox" id="mvMirror"> Mirror</label>'
    ;
    list.appendChild(row);

    var elEn=$('#mvEnable'), elH=$('#mvH'), elHL=$('#mvHLbl'), elB=$('#mvBars'), elBL=$('#mvBarsLbl'), elOp=$('#mvOpacity'), elOpL=$('#mvOpLbl'), elSm=$('#mvSmooth'), elSmL=$('#mvSmLbl'), elSe=$('#mvSens'), elSeL=$('#mvSensLbl'), chips=$('#mvColors'), col=$('#mvColor'), mir=$('#mvMirror');

    function paint(){
      if(elEn) elEn.checked = mvEnable;
      if(elH){ elH.value=String(mvH); elHL.textContent=String(mvH); }
      if(elB){ elB.value=String(mvBars); elBL.textContent=String(mvBars); }
      if(elOp){ elOp.value=String(mvOpacity); elOpL.textContent=String(mvOpacity); }
      if(elSm){ elSm.value=String(mvSmooth); elSmL.textContent=String(mvSmooth); }
      if(elSe){ elSe.value=String(Math.round(mvSens*100)); elSeL.textContent=String(Math.round(mvSens*100)); }
      if(chips){ $all('button', chips).forEach(function(b){ b.classList.toggle('active', (b.getAttribute('data-col')||'')===mvMode); }); }
      if(col){ col.value = mvColor; col.style.display = (mvMode==='fixed')? 'inline-block':'none'; }
      if(mir) mir.checked = mvMirror;
    }
    paint();

    elEn && elEn.addEventListener('change', function(){ mvEnable=!!elEn.checked; try{ localStorage.setItem('mvEnable', mvEnable?'on':'off'); }catch(e){} start(); });
    elH && elH.addEventListener('input', function(){ var v=clamp(parseInt(elH.value,10)||mvH,2,20); mvH=v; elHL.textContent=String(v); try{ localStorage.setItem('mvH', String(v)); }catch(e){} resize(); });
    elB && elB.addEventListener('input', function(){ var v=clamp(parseInt(elB.value,10)||mvBars,8,128); mvBars=v; elBL.textContent=String(v); try{ localStorage.setItem('mvBars', String(v)); }catch(e){} });
    elOp && elOp.addEventListener('input', function(){ var v=clamp(parseInt(elOp.value,10)||mvOpacity,10,100); mvOpacity=v; elOpL.textContent=String(v); try{ localStorage.setItem('mvOpacity', String(v)); }catch(e){} });
    elSm && elSm.addEventListener('input', function(){ var v=clamp(parseInt(elSm.value,10)||mvSmooth,0,95); mvSmooth=v; elSmL.textContent=String(v); try{ localStorage.setItem('mvSmooth', String(v)); }catch(e){} });
    elSe && elSe.addEventListener('input', function(){ var v=clamp(parseInt(elSe.value,10)||Math.round(mvSens*100),20,400); mvSens=v/100; elSeL.textContent=String(v); try{ localStorage.setItem('mvSens', String(mvSens)); }catch(e){} });
    chips && chips.addEventListener('click', function(e){ var b=e.target.closest('button[data-col]'); if(!b) return; mvMode=b.getAttribute('data-col')||'hl'; try{ localStorage.setItem('mvColorMode', mvMode); }catch(e){} paint(); });
    col && col.addEventListener('input', function(){ mvColor=col.value||'#4fd1ff'; try{ localStorage.setItem('mvColor', mvColor); }catch(e){} });
    mir && mir.addEventListener('change', function(){ mvMirror=!!mir.checked; try{ localStorage.setItem('mvMirror', mvMirror?'on':'off'); }catch(e){} });
  }

  // ==== Hooks & Init ====
  function hookStatus(){
    if (window.__origSetStatusMV) return; window.__origSetStatusMV = window.setStatus;
    window.setStatus = function(msg){
      try{ window.__origSetStatusMV && window.__origSetStatusMV(msg); }catch(e){}
      try{ if(mvEnable){ cancelAnimationFrame(raf); raf = requestAnimationFrame(drawFrame); } }catch(e){}
    };
  }

  onReady(function(){ ensureCanvas(); injectCC(); hookStatus(); start(); window.addEventListener('resize', function(){ resize(); }); });
})();
