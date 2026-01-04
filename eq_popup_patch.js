// eq_popup_patch.js
// Generated: 2025-09-26 14:41
// Equalizer Popup UI for TOH/KaraokeHD Player
// Works with: eq_switch_plus_v2.js (generator-based) and earlier switch EQ patches providing __EQSW API
// Features:
//  • Adds "Open EQ" button in Equalizer row and moves full band editor into a draggable popup panel
//  • Live control of: Enable, Layout, Preset, Preamp, per-band sliders
//  • Curve preview (canvas) with log-frequency axis and dB grid
//  • Dense / XS slider modes for small screens; remembers panel position

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // ==== CSS ====
  function injectCSS(){
    if ($('#eqpop-css')) return;
    var st = document.createElement('style'); st.id='eqpop-css';
    st.textContent = `
#eqPopOv{ position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.35); display:none }
#eqPop{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(960px,96vw); max-height:92vh; background:#0f151a; color:#e6eef7; border:1px solid rgba(255,255,255,.12); border-radius:12px; box-shadow:0 22px 60px rgba(0,0,0,.45); display:flex; flex-direction:column; overflow:hidden }
#eqPop.hud{ background:rgba(20,24,28,.92); backdrop-filter: blur(8px) }
#eqPopHead{ display:flex; align-items:center; gap:8px; padding:10px 12px; background:#131b22; border-bottom:1px solid rgba(255,255,255,.08); cursor:move }
#eqPopHead .title{ font-weight:800; letter-spacing:.02em; color:#bfe5ff; flex:1 }
#eqPopHead .row{ display:flex; align-items:center; gap:8px }
#eqPopHead select, #eqPopHead button, #eqPopHead input[type="checkbox"]{ transform: translateZ(0) }
#eqPopBody{ display:flex; flex-direction:column; gap:10px; padding:10px 12px; overflow:auto }
#eqCurveWrap{ height:140px; border:1px solid rgba(255,255,255,.06); border-radius:8px; background:#0b1116; position:relative }
#eqCurve{ width:100%; height:100%; display:block }
#eqCtrlRow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap }
#eqCtrlRow .chip{ background:#1b2633; color:#dfe8f3; border:1px solid #3a5166; border-radius:8px; padding:4px 10px; font-size:12px; cursor:pointer }
#eqCtrlRow .chip.active{ outline:2px solid var(--hl); outline-offset:2px }
#eqBands{ display:flex; align-items:flex-end; gap:6px; overflow:auto; padding:6px; border:1px solid rgba(255,255,255,.06); border-radius:8px; background:#0b1116 }
#eqBands .b{ display:flex; flex-direction:column; align-items:center; min-width:28px }
#eqBands .b input{ height:120px; writing-mode: bt-lr; -webkit-appearance: slider-vertical; width:28px }
#eqBands .b .hz{ font-size:11px; color:#9fb6c9; margin-top:2px }
#eqFoot{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; background:#0f1419; border-top:1px solid rgba(255,255,255,.06) }
#eqFoot .left, #eqFoot .right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
.eqBtn{ background:#1b2633; color:#dfe8f3; border:1px solid #3a5166; border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer }
.eqBtn.danger{ border-color:#7b3030; background:#2a1818 }
.eqBtn.hl{ outline:2px solid var(--hl); outline-offset:2px }
#eqClose{ background:transparent; border:none; color:#bfe5ff; font-size:18px; cursor:pointer; padding:2px 6px }
/* Density modes */
#eqPop.dense #eqBands .b input{ height:90px; width:24px }
#eqPop.xs #eqBands .b input{ height:70px; width:18px }
#eqPop.small #eqCurveWrap{ height:110px }
/* Open button in row */
#eqOpenBtn.eqBtn{ padding:4px 10px }
/* Hide in-row bands to save space */
#ccEQSWPlus .eqwrap, #ccEQSWPlus #eqswBands{ display:none !important }
`;
    document.head.appendChild(st);
  }

  // ==== Popup DOM ====
  var ov, card, head, body, curve, bandsBox, foot;
  var dragging=false, dX=0, dY=0;

  function ensurePopup(){
    if (ov) return;
    injectCSS();
    ov = document.createElement('div'); ov.id='eqPopOv';
    ov.innerHTML = '\n'
      + '<div id="eqPop" class="hud">\n'
      + '  <div id="eqPopHead">\n'
      + '    <div class="title">Equalizer</div>\n'
      + '    <label class="row"><input type="checkbox" id="eqEn"> Enable</label>\n'
      + '    <select id="eqLayout" class="small"></select>\n'
      + '    <select id="eqPreset" class="small" style="min-width:160px"></select>\n'
      + '    <button id="eqDense" class="chip">Dense</button>\n'
      + '    <button id="eqXS" class="chip">XS</button>\n'
      + '    <button id="eqClose" title="Close">✕</button>\n'
      + '  </div>\n'
      + '  <div id="eqPopBody">\n'
      + '    <div id="eqCurveWrap"><canvas id="eqCurve"></canvas></div>\n'
      + '    <div id="eqCtrlRow">\n'
      + '      <label class="small">Preamp <input type="range" id="eqPreamp" min="-12" max="12" step="1" style="width:180px"> <span id="eqPreampLbl" class="small"></span> dB</label>\n'
      + '    </div>\n'
      + '    <div id="eqBands"></div>\n'
      + '  </div>\n'
      + '  <div id="eqFoot">\n'
      + '    <div class="left">\n'
      + '      <button id="eqReset" class="eqBtn danger" title="Zero all bands">Reset All</button>\n'
      + '    </div>\n'
      + '    <div class="right">\n'
      + '      <button id="eqSnapSmall" class="eqBtn">Small</button>\n'
      + '      <button id="eqCenter" class="eqBtn">Center</button>\n'
      + '      <button id="eqDone" class="eqBtn hl">Done</button>\n'
      + '    </div>\n'
      + '  </div>\n'
      + '</div>';
    document.body.appendChild(ov);

    card = $('#eqPop'); head=$('#eqPopHead'); body=$('#eqPopBody'); curve=$('#eqCurve'); bandsBox=$('#eqBands'); foot=$('#eqFoot');

    // Dragging
    head.addEventListener('mousedown', function(e){ if(e.target.closest('select,button,input')) return; dragging=true; var r=card.getBoundingClientRect(); dX=e.clientX - r.left; dY=e.clientY - r.top; e.preventDefault(); });
    document.addEventListener('mousemove', function(e){ if(!dragging) return; moveCard(e.clientX - dX, e.clientY - dY); });
    document.addEventListener('mouseup', function(){ dragging=false; savePos(); });

    // Close handlers
    $('#eqClose').addEventListener('click', hide);
    ov.addEventListener('click', function(e){ if(e.target===ov) hide(); });
    document.addEventListener('keydown', function(e){ if(ov.style.display!=='none' && e.key==='Escape'){ hide(); } });

    // Foot buttons
    $('#eqCenter').addEventListener('click', function(){ centerCard(true); });
    $('#eqSnapSmall').addEventListener('click', function(){ card.classList.toggle('small'); savePos(); redrawCurve(); });
    $('#eqDone').addEventListener('click', hide);

    // Density toggles
    $('#eqDense').addEventListener('click', function(){ card.classList.toggle('dense'); savePos(); });
    $('#eqXS').addEventListener('click', function(){ card.classList.toggle('xs'); savePos(); });

    // Persisted position
    try{
      var pos = JSON.parse(localStorage.getItem('eqPop:pos')||'null');
      if(pos && typeof pos.x==='number' && typeof pos.y==='number'){ moveCard(pos.x, pos.y, true); }
    }catch(e){}

    window.addEventListener('resize', function(){ redrawCurve(); });
  }

  function moveCard(x,y,skipSave){
    var vw = window.innerWidth, vh = window.innerHeight; var w = card.offsetWidth, h = card.offsetHeight;
    x = clamp(x, 8, vw - w - 8); y = clamp(y, 8, vh - h - 8);
    card.style.left = x + 'px'; card.style.top = y + 'px'; card.style.transform = 'none';
    if(!skipSave) savePos();
  }
  function savePos(){ try{ var r=card.getBoundingClientRect(); localStorage.setItem('eqPop:pos', JSON.stringify({x:r.left, y:r.top, dense:card.classList.contains('dense'), xs:card.classList.contains('xs'), small:card.classList.contains('small')})); }catch(e){} }
  function centerCard(applySavedDensity){ card.style.left='50%'; card.style.top='50%'; card.style.transform='translate(-50%,-50%)'; if(applySavedDensity){ try{ var pos=JSON.parse(localStorage.getItem('eqPop:pos')||'null'); if(pos){ ['dense','xs','small'].forEach(k=>{ card.classList.toggle(k, !!pos[k]); }); } }catch(e){} } }

  // ==== Integration with __EQSW ====
  function api(){ return window.__EQSW; }
  function need(){ return !!api(); }

  // Build popup content from current state
  function open(){ if(!need()){ alert('Equalizer core not found. Please include eq_switch_plus_v2.js first.'); return; }
    ensurePopup(); ov.style.display='block'; centerCard(true); paintFromInfo(); }
  function hide(){ if(ov) ov.style.display='none'; }

  // Read state and paint controls
  function paintFromInfo(){ try{
      var inf = api().info();
      // Enable
      $('#eqEn').checked = !!inf.enabled;
      $('#eqEn').onchange = function(){ this.checked ? api().on() : api().off(); };

      // Layout options from existing CC row if available (keeps compatibility with any custom layouts)
      var layoutSel = $('#eqLayout'); layoutSel.innerHTML='';
      var ccLayout = $('#eqswLayout');
      var layoutNames = [];
      if(ccLayout){ $all('option', ccLayout).forEach(function(o){ var opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.textContent; layoutSel.appendChild(opt); layoutNames.push(o.value); }); }
      // Fallback common names
      if(!layoutNames.length){ ['7-band','9-band','10-band','15-band','31-band'].forEach(function(n){ var opt=document.createElement('option'); opt.value=n; opt.textContent=n; layoutSel.appendChild(opt); }); layoutNames=['7-band','9-band','10-band','15-band','31-band']; }
      layoutSel.value = localStorage.getItem('eqSW:layout') || inf.layout || layoutNames[0];
      layoutSel.onchange = function(){ api().layout(layoutSel.value); setTimeout(paintFromInfo, 10); };

      // Preset list from CC row if available
      var presetSel = $('#eqPreset'); presetSel.innerHTML='';
      var ccPreset = $('#eqswPreset');
      if(ccPreset){ $all('option', ccPreset).forEach(function(o){ var opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.textContent; presetSel.appendChild(opt); }); presetSel.value = localStorage.getItem('eqSW:'+ (layoutSel.value||'') +':preset') || inf.preset || 'Flat'; }
      else { ['Flat','Loudness','Bass Boost','Treble Boost','Vocal','Warm','Bright','Smile','Frown','Rock','Pop','Jazz','Classical','EDM','Hip-Hop','R&B','Reggae','Metal','Night','Speech','Acoustic','Piano','Vocal Bright','Vocal Warm'].forEach(function(n){ var opt=document.createElement('option'); opt.value=n; opt.textContent=n; presetSel.appendChild(opt); }); presetSel.value = inf.preset || 'Flat'; }
      presetSel.onchange = function(){ api().preset(presetSel.value); setTimeout(paintFromInfo, 10); };

      // Preamp
      var pre = $('#eqPreamp'), preL=$('#eqPreampLbl'); pre.value = String(inf.preamp||0); preL.textContent = (inf.preamp>0? '+'+inf.preamp: String(inf.preamp||0));
      pre.oninput = function(){ var v = clamp(parseInt(pre.value,10)||0,-12,12); preL.textContent=(v>0? '+'+v: String(v)); api().preamp(v); };

      // Bands
      bandsBox.innerHTML='';
      var hz = inf.bands||[]; var gains = inf.gains||[];
      for(var i=0;i<hz.length;i++){
        var w=document.createElement('div'); w.className='b';
        var s=document.createElement('input'); s.type='range'; s.min='-12'; s.max='12'; s.step='1'; s.value=String(gains[i]||0); s.dataset.i=String(i);
        s.addEventListener('input', function(){ var idx=parseInt(this.dataset.i,10)||0; var v=clamp(parseInt(this.value,10)||0,-12,12); api().set(idx, v); redrawCurve(); });
        var cap=document.createElement('div'); cap.className='hz'; var f=hz[i]; cap.textContent = (f>=1000? (Math.round(f/100)/10)+'k' : String(f));
        w.appendChild(s); w.appendChild(cap); bandsBox.appendChild(w);
      }

      // Reset
      $('#eqReset').onclick = function(){ for(var i=0;i<hz.length;i++){ api().set(i,0); } api().preset('Flat'); setTimeout(paintFromInfo, 20); };

      // Density from saved state
      try{ var pos=JSON.parse(localStorage.getItem('eqPop:pos')||'null'); if(pos){ ['dense','xs','small'].forEach(k=>{ card.classList.toggle(k, !!pos[k]); }); } }catch(e){}

      fitCanvas(); redrawCurve();
    }catch(e){ console.error(e); }
  }

  // ==== Curve preview ====
  var ctx, lastW=0, lastH=0;
  function fitCanvas(){ if(!curve) return; var dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1)); curve.width = Math.floor(curve.clientWidth*dpr); curve.height=Math.floor(curve.clientHeight*dpr); ctx=curve.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); lastW=curve.clientWidth; lastH=curve.clientHeight; }
  function redrawCurve(){ if(!ctx) return; var inf=api().info(); var w=curve.clientWidth, h=curve.clientHeight; ctx.clearRect(0,0,w,h);
    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
    var dbLines=[-12,-6,0,6,12]; for(var d=0; d<dbLines.length; d++){ var y = mapY(dbLines[d], h); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    // Freq grid (decades): 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k
    var fGrid=[20,50,100,200,500,1000,2000,5000,10000,20000];
    for(var g=0; g<fGrid.length; g++){ var x = mapX(fGrid[g], inf.bands[0]||20, inf.bands[inf.bands.length-1]||20000, w); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    // Curve from band points
    var fmin=inf.bands[0]||20, fmax=inf.bands[inf.bands.length-1]||20000;
    var pts=[]; for(var i=0;i<inf.bands.length;i++){ var x=mapX(inf.bands[i], fmin, fmax, w); var y=mapY(inf.gains[i]||0, h); pts.push({x:x,y:y}); }
    ctx.strokeStyle='var(--hl)'; ctx.lineWidth=2; ctx.beginPath();
    if(pts.length){ ctx.moveTo(pts[0].x, pts[0].y); for(var i=1;i<pts.length;i++){ ctx.lineTo(pts[i].x, pts[i].y); } ctx.stroke(); }
    // Draw points
    ctx.fillStyle='rgba(191,229,255,0.9)'; for(var k=0;k<pts.length;k++){ ctx.beginPath(); ctx.arc(pts[k].x, pts[k].y, 2.5, 0, Math.PI*2); ctx.fill(); }
  }
  function mapX(f, fmin, fmax, w){ var a=Math.log10(fmin||20), b=Math.log10(fmax||20000); var t=(Math.log10(f)-a)/(b-a); return Math.max(0, Math.min(w, t*w)); }
  function mapY(db, h){ var t=(db+12)/24; var y = (1-t)*h; return Math.max(0, Math.min(h, y)); }

  // ==== Row enhancement ====
  function enhanceRow(){
    var row = $('#ccEQSWPlus') || $('#ccEQSW'); if(!row) return false;
    injectCSS(); ensurePopup();

    // Insert Open button if missing
    var openBtn = $('#eqOpenBtn');
    if(!openBtn){
      openBtn = document.createElement('button'); openBtn.id='eqOpenBtn'; openBtn.className='eqBtn'; openBtn.textContent='Open EQ'; openBtn.title='Open equalizer panel';
      var label = row.querySelector('.label'); if(label) label.parentNode.insertBefore(openBtn, label.nextSibling); else row.insertBefore(openBtn, row.firstChild);
      openBtn.addEventListener('click', open);
    }

    // Hide the in-row bands area to save space (we keep Enable/Preset/Preamp if present)
    var bands = row.querySelector('#eqswBands') || row.querySelector('.eqwrap'); if(bands){ bands.style.display='none'; }

    return true;
  }

  function init(){
    if(!enhanceRow()){ setTimeout(init, 400); return; }
  }

  onReady(function(){ init(); });
})();
