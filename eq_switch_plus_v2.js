// eq_switch_plus_v2.js
// Generated: 2025-09-26 14:14
// Equalizer with switchable band layouts (7/9/10/15/31) and generator-based presets.
// - Inserts EQ between `comp` and `masterGain`, adds Post-Gain (Preamp).
// - Control Center → Equalizer (Switch): Enable, Layout, Preset, Preamp, per‑band sliders, Reset.
// - Persists per‑layout gains/preset/preamp in localStorage.
// - Chain‑safe: reattaches after buildGraph().

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // ===== Layout definitions =====
  var LAYOUTS = {
    '7-band': [
      { f:  60,   type:'lowshelf',  q:0.707 },
      { f: 150,   type:'peaking',   q:1.00  },
      { f: 400,   type:'peaking',   q:1.00  },
      { f: 1000,  type:'peaking',   q:1.00  },
      { f: 2400,  type:'peaking',   q:1.00  },
      { f: 6000,  type:'peaking',   q:0.95  },
      { f: 15000, type:'highshelf', q:0.707 }
    ],
    '9-band': [
      { f: 31.5,  type:'lowshelf',  q:0.707 },
      { f: 63,    type:'peaking',   q:1.00  },
      { f: 125,   type:'peaking',   q:1.00  },
      { f: 250,   type:'peaking',   q:1.00  },
      { f: 500,   type:'peaking',   q:1.00  },
      { f: 1000,  type:'peaking',   q:1.00  },
      { f: 2000,  type:'peaking',   q:1.00  },
      { f: 4000,  type:'peaking',   q:0.95  },
      { f: 8000,  type:'highshelf', q:0.707 }
    ],
    '10-band': [
      { f: 31.5,  type:'lowshelf',  q:0.707 },
      { f: 63,    type:'peaking',   q:1.00  },
      { f: 125,   type:'peaking',   q:1.00  },
      { f: 250,   type:'peaking',   q:1.00  },
      { f: 500,   type:'peaking',   q:1.00  },
      { f: 1000,  type:'peaking',   q:1.00  },
      { f: 2000,  type:'peaking',   q:1.00  },
      { f: 4000,  type:'peaking',   q:0.95  },
      { f: 8000,  type:'peaking',   q:0.95  },
      { f: 16000, type:'highshelf', q:0.707 }
    ],
    '15-band': [
      { f: 25,    type:'lowshelf',  q:0.707 },
      { f: 40,    type:'peaking',   q:1.60  },
      { f: 63,    type:'peaking',   q:1.60  },
      { f: 100,   type:'peaking',   q:1.60  },
      { f: 160,   type:'peaking',   q:1.60  },
      { f: 250,   type:'peaking',   q:1.60  },
      { f: 400,   type:'peaking',   q:1.60  },
      { f: 630,   type:'peaking',   q:1.60  },
      { f: 1000,  type:'peaking',   q:1.60  },
      { f: 1600,  type:'peaking',   q:1.60  },
      { f: 2500,  type:'peaking',   q:1.60  },
      { f: 4000,  type:'peaking',   q:1.60  },
      { f: 6300,  type:'peaking',   q:1.60  },
      { f: 10000, type:'peaking',   q:1.60  },
      { f: 16000, type:'highshelf', q:0.707 }
    ],
    '31-band': [
      { f: 20,    type:'lowshelf',  q:0.707 },
      { f: 25,    type:'peaking',   q:4.30  },
      { f: 31.5,  type:'peaking',   q:4.30  },
      { f: 40,    type:'peaking',   q:4.30  },
      { f: 50,    type:'peaking',   q:4.30  },
      { f: 63,    type:'peaking',   q:4.30  },
      { f: 80,    type:'peaking',   q:4.30  },
      { f: 100,   type:'peaking',   q:4.30  },
      { f: 125,   type:'peaking',   q:4.30  },
      { f: 160,   type:'peaking',   q:4.30  },
      { f: 200,   type:'peaking',   q:4.30  },
      { f: 250,   type:'peaking',   q:4.30  },
      { f: 315,   type:'peaking',   q:4.30  },
      { f: 400,   type:'peaking',   q:4.30  },
      { f: 500,   type:'peaking',   q:4.30  },
      { f: 630,   type:'peaking',   q:4.30  },
      { f: 800,   type:'peaking',   q:4.30  },
      { f: 1000,  type:'peaking',   q:4.30  },
      { f: 1250,  type:'peaking',   q:4.30  },
      { f: 1600,  type:'peaking',   q:4.30  },
      { f: 2000,  type:'peaking',   q:4.30  },
      { f: 2500,  type:'peaking',   q:4.30  },
      { f: 3150,  type:'peaking',   q:4.30  },
      { f: 4000,  type:'peaking',   q:4.30  },
      { f: 5000,  type:'peaking',   q:4.30  },
      { f: 6300,  type:'peaking',   q:4.30  },
      { f: 8000,  type:'peaking',   q:4.30  },
      { f: 10000, type:'peaking',   q:4.30  },
      { f: 12500, type:'peaking',   q:4.30  },
      { f: 16000, type:'peaking',   q:4.30  },
      { f: 20000, type:'highshelf', q:0.707 }
    ]
  };

  // ===== Preset generator =====
  function log01(f, fmin, fmax){ var a=Math.log10(fmin), b=Math.log10(fmax); var t=(Math.log10(f)-a)/(b-a); return Math.max(0,Math.min(1,t)); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function gauss(x, mu, sigma){ var z=(x-mu)/sigma; return Math.exp(-0.5*z*z); }

  function makeCurve(bandsHz, spec){
    var n=bandsHz.length; var out=new Array(n);
    var fmin=bandsHz[0], fmax=bandsHz[n-1];
    for(var i=0;i<n;i++){
      var f=bandsHz[i]; var t=log01(f, fmin, fmax); var d=0;
      if(spec.tilt){ d += lerp(spec.tilt.bass||0, spec.tilt.treble||0, t); }
      if(spec.bassShelf){ if(f <= (spec.bassShelf.fc||120)){ d += spec.bassShelf.db||0; } }
      if(spec.trebleShelf){ if(f >= (spec.trebleShelf.fc||6000)){ d += spec.trebleShelf.db||0; } }
      if(Array.isArray(spec.peaks)){
        for(var p=0;p<spec.peaks.length;p++){
          var pk=spec.peaks[p]; var mu = log01(pk.f0||1000, fmin, fmax);
          var sig = (pk.widthOct||1.0)/ (Math.log10(2)*(Math.log10(fmax)-Math.log10(fmin)) );
          d += (pk.db||0) * gauss(t, mu, sig);
        }
      }
      if(Array.isArray(spec.dips)){
        for(var q=0;q<spec.dips.length;q++){
          var nk=spec.dips[q]; var mu2=log01(nk.f0||1000, fmin, fmax);
          var sig2=(nk.widthOct||1.0)/ (Math.log10(2)*(Math.log10(fmax)-Math.log10(fmin)) );
          d += (-(Math.abs(nk.db||0))) * gauss(t, mu2, sig2);
        }
      }
      out[i]=Math.max(-12, Math.min(12, Math.round(d)));
    }
    return out;
  }

  // ===== Preset library (generator specs) =====
  var PRESET_CURVES = {
    'Flat'           : { },
    'Loudness'       : { peaks:[{f0:70, db:+4, widthOct:1.5},{f0:12000, db:+4, widthOct:1.5}] },
    'Bass Boost'     : { tilt:{bass:+6, treble:0} },
    'Bass Boost Wide': { tilt:{bass:+5, treble:0}, peaks:[{f0:80, db:+2, widthOct:1.0}] },
    'Bass Cut'       : { tilt:{bass:-8, treble:0} },
    'Treble Boost'   : { tilt:{bass:0, treble:+6} },
    'Treble Cut'     : { tilt:{bass:0, treble:-8} },
    'Warm'           : { tilt:{bass:+3, treble:-2} },
    'Bright'         : { tilt:{bass:-2, treble:+3} },
    'Smile'          : { peaks:[{f0:60, db:+4, widthOct:1.5},{f0:12000, db:+4, widthOct:1.5}], dips:[{f0:1000, db:2, widthOct:1.2}] },
    'Frown'          : { dips:[{f0:80, db:4, widthOct:1.2},{f0:10000, db:4, widthOct:1.2}], peaks:[{f0:1000, db:+2, widthOct:1.0}] },
    'Vocal'          : { peaks:[{f0:3000, db:+4, widthOct:0.7}], bassShelf:{fc:140, db:-3} },
    'Speech'         : { bassShelf:{fc:180, db:-6}, trebleShelf:{fc:7000, db:-2}, peaks:[{f0:2500, db:+3, widthOct:0.8}] },
    'Night'          : { bassShelf:{fc:160, db:-8}, trebleShelf:{fc:8000, db:-2} },
    'Acoustic'       : { peaks:[{f0:300, db:+2, widthOct:1.0},{f0:6000, db:+3, widthOct:0.8}], dips:[{f0:2000, db:2, widthOct:0.8}] },
    'Piano'          : { peaks:[{f0:2500, db:+2, widthOct:0.7}], trebleShelf:{fc:9000, db:+2} },
    'Rock'           : { tilt:{bass:+3, treble:+3}, dips:[{f0:400, db:2, widthOct:1.0}] },
    'Pop'            : { peaks:[{f0:100, db:+2, widthOct:1.0},{f0:8000, db:+3, widthOct:1.0}], dips:[{f0:500, db:2, widthOct:1.0}] },
    'Jazz'           : { peaks:[{f0:750, db:+2, widthOct:1.0},{f0:3000, db:+2, widthOct:0.8}], trebleShelf:{fc:10000, db:+1} },
    'Classical'      : { peaks:[{f0:3000, db:+1, widthOct:0.8}], tilt:{bass:-1, treble:+1} },
    'EDM'            : { peaks:[{f0:60, db:+5, widthOct:1.0},{f0:10000, db:+4, widthOct:1.2}], dips:[{f0:400, db:3, widthOct:1.0}] },
    'House'          : { peaks:[{f0:80, db:+4, widthOct:1.0},{f0:9000, db:+3, widthOct:1.0}], dips:[{f0:500, db:2, widthOct:1.0}] },
    'Trance'         : { peaks:[{f0:70, db:+4, widthOct:1.2},{f0:12000, db:+4, widthOct:1.2}], dips:[{f0:600, db:2, widthOct:1.0}] },
    'Hip-Hop'        : { peaks:[{f0:60, db:+6, widthOct:1.0}], dips:[{f0:3000, db:2, widthOct:0.7}] },
    'R&B'            : { peaks:[{f0:80, db:+4, widthOct:1.0},{f0:8000, db:+2, widthOct:1.0}], dips:[{f0:500, db:2, widthOct:0.8}] },
    'Reggae'         : { peaks:[{f0:70, db:+5, widthOct:1.2}], dips:[{f0:2500, db:3, widthOct:0.8}], trebleShelf:{fc:9000, db:+1} },
    'Metal'          : { peaks:[{f0:90, db:+4, widthOct:1.0},{f0:4000, db:+4, widthOct:1.0}], dips:[{f0:300, db:3, widthOct:0.8}] },
    'Vocal Bright'   : { peaks:[{f0:3500, db:+3, widthOct:0.7}], trebleShelf:{fc:10000, db:+2}, bassShelf:{fc:140, db:-2} },
    'Vocal Warm'     : { peaks:[{f0:2500, db:+2, widthOct:0.8}], tilt:{bass:+1, treble:-2} }
  };

  // ===== Persistence per layout =====
  var LS_ROOT='eqSW:';
  function lsKey(layout, key){ return LS_ROOT+layout+':'+key; }
  var enabled = (localStorage.getItem(LS_ROOT+'enabled')||'off')==='on';
  var curLayout = localStorage.getItem(LS_ROOT+'layout') || '10-band';
  if(!LAYOUTS[curLayout]) curLayout='10-band';
  function loadGains(layout){ var n=(LAYOUTS[layout]||[]).length; var arr=new Array(n); for(var i=0;i<n;i++){ var v=parseFloat(localStorage.getItem(lsKey(layout,'b'+i))||'0'); arr[i]=(isFinite(v)?clamp(v,-12,12):0);} return arr; }
  function saveGain(layout,i,v){ try{ localStorage.setItem(lsKey(layout,'b'+i), String(v)); }catch(e){} }
  function loadPresetName(layout){ return localStorage.getItem(lsKey(layout,'preset')) || 'Flat'; }
  function savePresetName(layout,name){ try{ localStorage.setItem(lsKey(layout,'preset'), name); }catch(e){} }
  function loadPreamp(layout){ var v=parseFloat(localStorage.getItem(lsKey(layout,'preamp'))||'0'); return (isFinite(v)? clamp(v,-12,12):0); }
  function savePreamp(layout,v){ try{ localStorage.setItem(lsKey(layout,'preamp'), String(clamp(v,-12,12))); }catch(e){} }

  var gains = loadGains(curLayout);
  var presetName = loadPresetName(curLayout);
  var preampDB = loadPreamp(curLayout);

  // ===== Nodes =====
  var filters=[]; var postGain=null; var wired=false;
  function getAC(){ try{return window.ac;}catch(e){return null;} }
  function getComp(){ try{return window.comp;}catch(e){return null;} }
  function getMaster(){ try{return window.masterGain;}catch(e){return null;} }
  function dbToGain(db){ return Math.pow(10, (db||0)/20); }

  function makeFilters(){
    var ctx=getAC(); if(!ctx) return false;
    var bands=LAYOUTS[curLayout]||[];
    var needNew=(filters.length!==bands.length) || !filters.length || (filters[0] && filters[0].context!==ctx);
    if(needNew){ try{ filters.forEach(function(f){ f.disconnect(); }); }catch(e){}
      filters=bands.map(function(b){ var f=ctx.createBiquadFilter(); f.type=b.type; f.frequency.value=b.f; try{ f.Q.value=b.q; }catch(e){} f.gain.value=0; return f; });
    }
    applyGains();
    if(!postGain || postGain.context!==ctx){ try{ postGain && postGain.disconnect(); }catch(e){} postGain=ctx.createGain(); }
    postGain.gain.value=dbToGain(preampDB);
    return true;
  }

  function applyGains(){ for(var i=0;i<filters.length;i++){ try{ filters[i].gain.value=gains[i]||0; }catch(e){} } }

  function connectChain(){
    if(!enabled){ disconnectChain(); return; }
    var c=getComp(), m=getMaster(), ctx=getAC(); if(!c||!m||!ctx) return; if(!makeFilters()) return;
    try{
      c.disconnect();
      if(filters.length){ c.connect(filters[0]); for(var i=0;i<filters.length-1;i++){ try{ filters[i].disconnect(); }catch(e){} filters[i].connect(filters[i+1]); }
        try{ filters[filters.length-1].disconnect(); }catch(e){} filters[filters.length-1].connect(postGain);
      } else { c.connect(postGain); }
      try{ postGain.disconnect(); }catch(e){} postGain.connect(m);
      wired=true;
    }catch(e){ wired=false; }
  }

  function disconnectChain(){ var c=getComp(), m=getMaster(); if(!c||!m) return; try{ if(wired){ filters.forEach(function(f){ try{ f.disconnect(); }catch(e){} }); try{ postGain && postGain.disconnect(); }catch(e){} c.disconnect(); c.connect(m); } }catch(e){} wired=false; }
  function refresh(){ enabled? connectChain(): disconnectChain(); }

  // ===== UI =====
  function injectCC(){
    var cc=$('#ccPanel'); if(!cc) return; var list=cc.querySelector('.list'); if(!list) return; if($('#ccEQSWPlus')) return;
    var row=document.createElement('div'); row.className='row'; row.id='ccEQSWPlus';
    row.innerHTML='\n'
      + '<span class="label">Equalizer (Switch)</span>'
      + '<label class="small"><input type="checkbox" id="eqswEn"> Enable</label>'
      + '<label class="small" style="margin-left:8px">Layout <select id="eqswLayout" class="small"></select></label>'
      + '<label class="small" style="margin-left:8px">Preset <select id="eqswPreset" class="small"></select></label>'
      + '<label class="small" style="margin-left:8px">Preamp <input type="range" id="eqswPre" min="-12" max="+12" step="1" style="width:120px"> <span id="eqswPreLbl" class="small"></span> dB</label>'
      + '<button id="eqswReset" class="small" style="margin-left:8px">Reset</button>'
      + '<div id="eqswBands" style="display:flex; align-items:flex-end; gap:4px; margin-left:10px; flex-wrap:wrap"></div>';
    list.appendChild(row);

    var elEn=$('#eqswEn'), elLayout=$('#eqswLayout'), elPreset=$('#eqswPreset'), elPre=$('#eqswPre'), elPreL=$('#eqswPreLbl'), bandBox=$('#eqswBands'), btnReset=$('#eqswReset');

    Object.keys(LAYOUTS).forEach(function(name){ var o=document.createElement('option'); o.value=name; o.textContent=name; elLayout.appendChild(o); });

    function buildBandSliders(){
      bandBox.innerHTML='';
      var bands=LAYOUTS[curLayout]||[];
      for(var i=0;i<bands.length;i++){
        var hz=bands[i].f; var label=(hz>=1000? (hz/1000)+'k' : String(hz));
        var wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;margin:0 3px';
        var input=document.createElement('input'); input.type='range'; input.min='-12'; input.max='12'; input.step='1'; input.value=String(gains[i]||0);
        input.id='eqswB'+i; input.title=label+' Hz'; input.style.cssText='height:120px;writing-mode:bt-lr;-webkit-appearance:slider-vertical;width:28px';
        var cap=document.createElement('span'); cap.className='small'; cap.textContent=label;
        wrap.appendChild(input); wrap.appendChild(cap); bandBox.appendChild(wrap);
      }
    }

    function listPresets(){
      elPreset.innerHTML='';
      var names = Object.keys(PRESET_CURVES);
      names.forEach(function(name){ var o=document.createElement('option'); o.value=name; o.textContent=name; elPreset.appendChild(o); });
      if(names.indexOf(presetName)<0) presetName='Flat';
      elPreset.value=presetName;
    }

    function paint(){
      elEn.checked = enabled;
      elLayout.value = curLayout;
      listPresets();
      elPre.value = String(preampDB);
      elPreL.textContent=(preampDB>0? '+'+preampDB: String(preampDB));
      buildBandSliders();
    }

    paint();

    elEn.addEventListener('change', function(){ enabled=!!elEn.checked; try{ localStorage.setItem(LS_ROOT+'enabled', enabled?'on':'off'); }catch(e){} refresh(); });
    elLayout.addEventListener('change', function(){ curLayout=elLayout.value; try{ localStorage.setItem(LS_ROOT+'layout', curLayout); }catch(e){} gains=loadGains(curLayout); presetName=loadPresetName(curLayout); preampDB=loadPreamp(curLayout); makeFilters(); applyGains(); paint(); refresh(); });

    elPreset.addEventListener('change', function(){ presetName=elPreset.value; savePresetName(curLayout, presetName); var bands=LAYOUTS[curLayout]||[]; var hz=bands.map(function(b){return b.f;}); var spec=PRESET_CURVES[presetName]||{}; var arr=makeCurve(hz, spec); for(var i=0;i<arr.length;i++){ gains[i]=arr[i]; saveGain(curLayout,i,gains[i]); } applyGains(); buildBandSliders(); });

    elPre.addEventListener('input', function(){ var v=clamp(parseInt(elPre.value,10)||0,-12,12); preampDB=v; elPreL.textContent=(v>0? '+'+v: String(v)); savePreamp(curLayout, v); if(postGain){ postGain.gain.value=dbToGain(v); } });

    bandBox.addEventListener('input', function(e){ var s=e.target.closest('input[type="range"]'); if(!s) return; var m=(s.id||'').match(/^eqswB(\d+)$/); if(!m) return; var i=parseInt(m[1],10)||0; var v=clamp(parseInt(s.value,10)||0,-12,12); gains[i]=v; saveGain(curLayout,i,v); applyGains(); });

    btnReset.addEventListener('click', function(){ var n=(LAYOUTS[curLayout]||[]).length; for(var i=0;i<n;i++){ gains[i]=0; saveGain(curLayout,i,0); } presetName='Flat'; savePresetName(curLayout,presetName); preampDB=0; savePreamp(curLayout,0); paint(); applyGains(); refresh(); });
  }

  function hookBuilders(){ if(window.__EQSWP2_HOOKED__) return; window.__EQSWP2_HOOKED__=true; var origBuild=window.buildGraph; if(typeof origBuild==='function'){ window.buildGraph=function(){ var r=origBuild.apply(this, arguments); try{ makeFilters(); refresh(); }catch(e){} return r; }; } }

  // Console API
  window.__EQSW = {
    on: function(){ enabled=true; localStorage.setItem(LS_ROOT+'enabled','on'); refresh(); },
    off:function(){ enabled=false; localStorage.setItem(LS_ROOT+'enabled','off'); refresh(); },
    layout: function(name){ if(LAYOUTS[name]){ localStorage.setItem(LS_ROOT+'layout', name); curLayout=name; gains=loadGains(name); presetName=loadPresetName(name); preampDB=loadPreamp(name); makeFilters(); applyGains(); refresh(); return name; } },
    preset: function(name){ if(PRESET_CURVES[name]){ savePresetName(curLayout,name); presetName=name; var hz=(LAYOUTS[curLayout]||[]).map(function(b){return b.f;}); var arr=makeCurve(hz, PRESET_CURVES[name]); for(var i=0;i<arr.length;i++){ gains[i]=arr[i]; saveGain(curLayout,i,gains[i]); } applyGains(); return name; } },
    set: function(i,db){ var bands=LAYOUTS[curLayout]||[]; var idx=clamp(parseInt(i,10)||0,0,bands.length-1); var g=clamp(parseFloat(db)||0,-12,12); gains[idx]=g; saveGain(curLayout,idx,g); applyGains(); return g; },
    preamp:function(db){ preampDB=clamp(parseFloat(db)||0,-12,12); savePreamp(curLayout, preampDB); if(postGain) postGain.gain.value=dbToGain(preampDB); return preampDB; },
    info:function(){ return { enabled:enabled, layout:curLayout, gains:gains.slice(), preset:presetName, preamp:preampDB, bands:(LAYOUTS[curLayout]||[]).map(function(b){return b.f;}) }; }
  };

  onReady(function(){ injectCC(); hookBuilders(); makeFilters(); refresh(); });
})();
