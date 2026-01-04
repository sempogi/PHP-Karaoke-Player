/*!
 * fx_panel_merged_v3.3.js — FX control panel (merged)
 * Adds Fireflies & Caustics modes; maps Intensity → fireflyDensity / causticsStrength.
 * Micro-dock includes Fireworks, Fireflies, Caustics, Rain, Snow, Galaxy, Bubbles + Power.
 */
(function(){
  'use strict';
  const LS_KEY='fxbg_panel_v2';

  let PRESETS = {
    'new_year_fireworks':{label:'\uD83C\uDF86 New Year Fireworks', mode:'fireworks', fwDensity:0.85, effectIntensity:0.85, wind:0.06, brightness:0.95, opacity:0.92},
    'gentle_drizzle':{label:'\uD83C\uDF27️ Gentle Drizzle', mode:'rain', rain:true, rainDensity:0.45, thunder:false, effectIntensity:0.45, wind:0.0, brightness:1.0, opacity:0.95},
    'calm_galaxy':{label:'\uD83C\uDF0C Calm Galaxy', mode:'galaxy', starDensity:0.65, effectIntensity:0.65, wind:0.0, brightness:1.02, opacity:0.94},
    'winter_snow':{label:'❄️ Winter Snow', mode:'snow', snowDensity:0.70, effectIntensity:0.70, wind:0.02, brightness:0.98, opacity:0.94},
    'relaxing_bubbles':{label:'\uD83E\uDEE7 Relaxing Bubbles', mode:'bubbles', bubbleDensity:0.70, effectIntensity:0.70, wind:0.00, brightness:1.00, opacity:0.94},
    'warm_fireflies':{label:'\uD83D\uDD6F️ Warm Fireflies', mode:'fireflies', fireflyDensity:0.65, effectIntensity:0.65, wind:0.00, brightness:1.00, opacity:0.95},
    'soft_caustics':{label:'\uD83D\uDFE6 Soft Caustics', mode:'caustics', causticsStrength:0.55, effectIntensity:0.55, wind:0.00, brightness:1.02, opacity:0.95}
  };

  const DEFAULTS={ enabled:false, mode:'fireworks', effectIntensity:0.65, wind:0.06, brightness:0.95, opacity:0.92,
    fwDensity:0.65, rain:true, rainDensity:0.6, thunder:false, meteorDensity:0.6, starDensity:0.7, wetglassDensity:0.6,
    snowDensity:0.6, auroraIntensity:0.65, bubbleDensity:0.6,
    fireflyDensity:0.6, causticsStrength:0.55,
    presetName:'custom', collapsed:true, zIndex:1, badgeHidden:true };

  function loadState(){ try{ return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY)||'{}')); }catch{ return Object.assign({}, DEFAULTS); } }
  function saveState(s){ try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch{} }
  function ensureEngine(){ return new Promise((resolve,reject)=>{ if(window.fxBackground){ resolve(); } else { reject(new Error('fx_engine.js not loaded')); } }); }
  function h(tag, attrs, ...children){ const el=document.createElement(tag); if(attrs){ for(const k in attrs){ if(k==='style'&&typeof attrs[k]==='object'){ Object.assign(el.style, attrs[k]); } else if(k==='html'){ el.innerHTML=attrs[k]; } else if(k.startsWith('on')&&typeof attrs[k]==='function'){ el.addEventListener(k.substring(2), attrs[k]); } else { el.setAttribute(k, attrs[k]); } } } children.flat().forEach(c=>{ if(c==null)return; if(typeof c==='string') el.appendChild(document.createTextNode(c)); else el.appendChild(c); }); return el; }

  function buildPresetSelect(state){ const sel = h('select'); Object.entries(PRESETS).forEach(([k,p])=> sel.appendChild(h('option',{value:k}, p.label))); sel.value = PRESETS[state.presetName] ? state.presetName : Object.keys(PRESETS)[0] || 'new_year_fireworks'; return sel; }

  function buildPanel(state){
    const css=`
      .fxbg-panel{ font:12px/1.3 system-ui,Segoe UI,Arial,sans-serif; color:#eee; background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:8px; backdrop-filter:saturate(120%) blur(3px); box-shadow:0 6px 16px rgba(0,0,0,.35); }
      .fxbg-row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
      .fxbg-row label{ display:flex; align-items:center; gap:6px; white-space:nowrap }
      .fxbg-row input[type="range"]{ width:140px }
      .fxbg-badge{ position:relative; display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:5px 8px; background:rgba(0,0,0,.55); color:#ffd54f; font:12px system-ui; cursor:pointer; }
      .fxbg-dock{ position:fixed; right:12px; bottom:12px; z-index:9999; display:flex; flex-direction:column; gap:8px; align-items:flex-end }
      .fxbg-mini{ cursor:pointer; user-select:none }
      .fxbg-hidden{ display:none }
      .fxbg-hr{ height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent) }
      #fx-bgfx.fxbg-off{ display:none !important; opacity:0 !important; filter:none !important; }
    `;
    const style=h('style',{html:css});
    const badge=h('div',{class:'fxbg-badge fxbg-mini', title:'Background FX'}, '✨ FX', h('span',{style:{opacity:.8}},'(open)'));
    if(state.badgeHidden) badge.style.display='none';

    const chkOn=h('input',{type:'checkbox'}); chkOn.checked=!!state.enabled;
    const selMode=h('select',null,
      h('option',{value:'fireworks'},'Fireworks'),
      h('option',{value:'rain'},'Rain'),
      h('option',{value:'meteor'},'Meteor Shower'),
      h('option',{value:'galaxy'},'Galaxy'),
      h('option',{value:'wetglass'},'Wet Glass'),
      h('option',{value:'snow'},'Snow'),
      h('option',{value:'aurora'},'Aurora'),
      h('option',{value:'bubbles'},'Bubbles'),
      h('option',{value:'fireflies'},'Fireflies'),
      h('option',{value:'caustics'},'Caustics')
    ); selMode.value=state.mode;

    const rngEff=h('input',{type:'range',min:'0',max:'1',step:'0.01',value:String(state.effectIntensity)});
    const lblEff=h('span',null,'Intensity');
    const rngWind=h('input',{type:'range',min:'-0.6',max:'0.6',step:'0.01',value:String(state.wind)});
    const rngBrt=h('input',{type:'range',min:'0.6',max:'1.2',step:'0.01',value:String(state.brightness)});
    const rngOp=h('input',{type:'range',min:'0.6',max:'1.0',step:'0.01',value:String(state.opacity)});

    const chkRain=h('input',{type:'checkbox'}); chkRain.checked=!!state.rain;
    const chkThun=h('input',{type:'checkbox'}); chkThun.checked=!!state.thunder;
    const rngRain=h('input',{type:'range',min:'0',max:'1',step:'0.01',value:String(state.rainDensity)});

    const selPreset = buildPresetSelect(state);
    const btnLoadPreset=h('button',{type:'button',style:{padding:'4px 8px',borderRadius:'8px',border:'1px solid rgba(255,255,255,.2)',background:'#111',color:'#fff',cursor:'pointer'}}, 'Load Preset');

    const btnApply=h('button',{type:'button',style:{padding:'6px 10px',borderRadius:'8px',border:'1px solid rgba(255,255,255,.2)',background:'#111',color:'#fff',cursor:'pointer'}}, 'Apply');
    const btnClose=h('button',{type:'button',style:{padding:'4px 8px',borderRadius:'8px',border:'1px solid rgba(255,255,255,.2)',background:'#111',color:'#fff',cursor:'pointer'}}, 'Close');

    function updateVisibility(){ const mode=selMode.value; const isRain=mode==='rain'; rowRain.style.display = isRain? '' : 'none'; lblEff.textContent = ({
      fireworks:'Intensity (Fireworks density)', rain:'Intensity (Rain density)', meteor:'Intensity (Meteor rate)', galaxy:'Intensity (Star density)', wetglass:'Intensity (Droplet rate)', snow:'Intensity (Snow density)', aurora:'Intensity (Aurora strength)', bubbles:'Intensity (Bubble count)', fireflies:'Intensity (Firefly count)', caustics:'Intensity (Caustics strength)'
    }[mode]) || 'Intensity'; }

    function applyPresetToUI(p){ selMode.value = p.mode || 'fireworks'; rngWind.value = String(p.wind!=null ? p.wind : rngWind.value); rngBrt.value = String(p.brightness!=null ? p.brightness : rngBrt.value); rngOp.value = String(p.opacity!=null ? p.opacity : rngOp.value); rngEff.value = String(p.effectIntensity!=null ? p.effectIntensity : rngEff.value); chkRain.checked = p.rain!=null ? p.rain : chkRain.checked; chkThun.checked = p.thunder!=null ? p.thunder : chkThun.checked; rngRain.value = String(p.rainDensity!=null ? p.rainDensity : rngRain.value); updateVisibility(); }
    btnLoadPreset.addEventListener('click',()=>{ const p=PRESETS[selPreset.value]; if(p){ applyPresetToUI(p); state.presetName=selPreset.value; saveState(state); } });

    const rowPreset=h('div',{class:'fxbg-row'}, h('label',null,'Preset', selPreset), btnLoadPreset);
    const rowMode=h('div',{class:'fxbg-row'}, h('label',null,'Effect', selMode), h('label',null,lblEff, rngEff));
    const rowMain=h('div',{class:'fxbg-row'}, h('label',null, chkOn, ' Enable'));
    const rowEnv=h('div',{class:'fxbg-row'}, h('label',null,'Wind',rngWind), h('label',null,'Brightness',rngBrt), h('label',null,'Opacity',rngOp));
    const rowRain=h('div',{class:'fxbg-row'}, h('label',null, chkRain, 'Rain'), h('label',null, chkThun, 'Thunder'), h('label',null, 'Rain Density', rngRain));

    const panel=h('div',{class:'fxbg-panel '+(state.collapsed?'fxbg-hidden':''), style:{minWidth:'360px'}}, rowPreset, rowMode, rowMain, rowEnv, rowRain, h('div',{class:'fxbg-hr'}), h('div',{class:'fxbg-row'}, btnApply, btnClose));
    const wrap=h('div',{class:'fxbg-dock'}, style, badge, panel);

    badge.addEventListener('click',()=>{ panel.classList.toggle('fxbg-hidden'); state.collapsed = panel.classList.contains('fxbg-hidden'); saveState(state); });
    btnClose.addEventListener('click',()=>{ panel.classList.add('fxbg-hidden'); state.collapsed=true; saveState(state); });
    selMode.addEventListener('change', updateVisibility);
    updateVisibility();

    btnApply.addEventListener('click', async ()=>{
      Object.assign(state, { enabled: !!chkOn.checked, mode: selMode.value, effectIntensity: parseFloat(rngEff.value), wind: parseFloat(rngWind.value), brightness: parseFloat(rngBrt.value), opacity: parseFloat(rngOp.value), rain: chkRain.checked, thunder: chkThun.checked, rainDensity: parseFloat(rngRain.value) });
      saveState(state);
      try{
        await ensureEngine();
        const canvasEl = document.getElementById('fx-bgfx');
        if(state.enabled){
          const opts = {
            mode: state.mode,
            wind: state.wind,
            brightness: state.brightness,
            opacity: state.opacity,
            fwDensity: state.mode==='fireworks' ? (state.effectIntensity || state.fwDensity) : state.fwDensity,
            rain: state.mode==='rain' ? state.rain : false,
            thunder: state.mode==='rain' ? state.thunder : false,
            rainDensity: state.mode==='rain' ? (state.effectIntensity || state.rainDensity) : state.rainDensity,
            meteorDensity: state.mode==='meteor' ? state.effectIntensity : state.meteorDensity,
            starDensity: state.mode==='galaxy' ? state.effectIntensity : state.starDensity,
            wetglassDensity: state.mode==='wetglass' ? state.effectIntensity : state.wetglassDensity,
            snowDensity: state.mode==='snow' ? state.effectIntensity : state.snowDensity,
            auroraIntensity: state.mode==='aurora' ? state.effectIntensity : state.auroraIntensity,
            bubbleDensity: state.mode==='bubbles' ? state.effectIntensity : state.bubbleDensity,
            fireflyDensity: state.mode==='fireflies' ? state.effectIntensity : state.fireflyDensity,
            causticsStrength: state.mode==='caustics' ? state.effectIntensity : state.causticsStrength
          };
          fxBackground.start(opts);
          fxBackground.setZ(state.zIndex || 1);
          fxBackground.setOpacity(state.opacity);
          canvasEl?.classList.remove('fxbg-off');
        } else {
          if(fxBackground.destroy){ fxBackground.destroy(); }
          else { fxBackground.stop(); canvasEl?.classList.add('fxbg-off'); }
        }
      }catch(err){ alert('FX engine not available: '+err.message); }
    });

    const initialPreset=PRESETS[state.presetName]; if(initialPreset) applyPresetToUI(initialPreset);
    return { wrap, panel, badge, state };
  }

  const FXPanel = {
    init(opts){ const state=loadState(); const { wrap } = buildPanel(state); let mounted=false; if(opts && opts.mount){ const host=document.querySelector(opts.mount); if(host){ host.appendChild(wrap); mounted=true; } } if(!mounted){ document.body.appendChild(wrap); } if(state.enabled){ ensureEngine().then(()=>{ const optsStart = { mode: state.mode, wind: state.wind, brightness: state.brightness, opacity: state.opacity, fwDensity: state.mode==='fireworks' ? (state.effectIntensity || state.fwDensity) : state.fwDensity, rain: state.mode==='rain' ? state.rain : false, thunder: state.mode==='rain' ? state.thunder : false, rainDensity: state.mode==='rain' ? (state.effectIntensity || state.rainDensity) : state.rainDensity, meteorDensity: state.mode==='meteor' ? state.effectIntensity : state.meteorDensity, starDensity: state.mode==='galaxy' ? state.effectIntensity : state.starDensity, wetglassDensity: state.mode==='wetglass' ? state.effectIntensity : state.wetglassDensity, snowDensity: state.mode==='snow' ? state.effectIntensity : state.snowDensity, auroraIntensity: state.mode==='aurora' ? state.effectIntensity : state.auroraIntensity, bubbleDensity: state.mode==='bubbles' ? state.effectIntensity : state.bubbleDensity, fireflyDensity: state.mode==='fireflies' ? state.effectIntensity : state.fireflyDensity, causticsStrength: state.mode==='caustics' ? state.effectIntensity : state.causticsStrength }; fxBackground.start(optsStart); fxBackground.setZ(state.zIndex || 1); fxBackground.setOpacity(state.opacity); }).catch(()=>{}); } },
    extendPresets(map){ if(!map||typeof map!=='object') return; PRESETS = Object.assign({}, PRESETS, map); try{ const sel=document.querySelector('#controlCenter .fxbg-panel select'); if(sel){ sel.innerHTML = Object.entries(PRESETS).map(([k,p])=> `<option value="${k}">${p.label}</option>`).join(''); } }catch{} },
    replacePresets(map){ if(!map||typeof map!=='object') return; PRESETS = Object.assign({}, map); try{ const sel=document.querySelector('#controlCenter .fxbg-panel select'); if(sel){ sel.innerHTML = Object.entries(PRESETS).map(([k,p])=> `<option value="${k}">${p.label}</option>`).join(''); } }catch{} }
  };

  // Micro-dock with reattach-on-open and default buttons
  (function(){
    function _getState(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(_){ return {}; } }
    function _setState(p){ const s=Object.assign({},_getState(),p||{}); try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch(_){ } return s; }
    function _optsFromState(s){ return { mode: s.mode || 'fireworks', wind: Number(s.wind ?? 0.06), brightness: Number(s.brightness ?? 0.95), opacity: Number(s.opacity ?? 0.92), fwDensity: s.mode==='fireworks' ? Number((s.effectIntensity ?? s.fwDensity ?? 0.65)) : Number(s.fwDensity ?? 0.65), rain: s.mode==='rain' ? !!s.rain : false, thunder: s.mode==='rain' ? !!s.thunder : false, rainDensity: s.mode==='rain' ? Number((s.effectIntensity ?? s.rainDensity ?? 0.6)) : Number(s.rainDensity ?? 0.6), meteorDensity: s.mode==='meteor' ? Number((s.effectIntensity ?? s.meteorDensity ?? 0.6)) : Number(s.meteorDensity ?? 0.6), starDensity: s.mode==='galaxy' ? Number((s.effectIntensity ?? s.starDensity ?? 0.7)) : Number(s.starDensity ?? 0.7), wetglassDensity: s.mode==='wetglass' ? Number((s.effectIntensity ?? s.wetglassDensity ?? 0.6)) : Number(s.wetglassDensity ?? 0.6), snowDensity: s.mode==='snow' ? Number((s.effectIntensity ?? s.snowDensity ?? 0.6)) : Number(s.snowDensity ?? 0.6), auroraIntensity: s.mode==='aurora' ? Number((s.effectIntensity ?? s.auroraIntensity ?? 0.65)) : Number(s.auroraIntensity ?? 0.65), bubbleDensity: s.mode==='bubbles' ? Number((s.effectIntensity ?? s.bubbleDensity ?? 0.6)) : Number(s.bubbleDensity ?? 0.6), fireflyDensity: s.mode==='fireflies' ? Number((s.effectIntensity ?? s.fireflyDensity ?? 0.6)) : Number(s.fireflyDensity ?? 0.6), causticsStrength: s.mode==='caustics' ? Number((s.effectIntensity ?? s.causticsStrength ?? 0.55)) : Number(s.causticsStrength ?? 0.55) }; }
    function _btn(label, key, onClick){ const b=document.createElement('button'); b.className='md-item'; b.setAttribute('data-open', key); b.textContent=label; b.addEventListener('click',()=>{ try{ onClick && onClick(b); }catch(_){ } }); return b; }
    function _setPowerLabel(btn, on){ if(btn) btn.textContent = on? 'FX: ON' : 'FX: OFF'; }
    function _closeDock(menuId, panelId){ const m=document.getElementById(menuId); if(m) m.classList.remove('open'); const p=document.getElementById(panelId); if(p) p.classList.remove('active'); }
    function _syncPanelEnableCheckbox(on, controlCenter){ const chk=document.querySelector(`${controlCenter||'#controlCenter'} .fxbg-panel input[type="checkbox"]`); if(chk) chk.checked=!!on; }

    function _attachOnce(cfg){ const menu = document.getElementById(cfg.menuId); if(!menu) return false; if(!menu.querySelector('[data-open="fx-power"]')){ const pbtn = _btn('FX: OFF','fx-power', (btn)=>{ const on = !_getState().enabled; if(on){ const s=_setState({enabled:true}); const o=_optsFromState(s); fxBackground.start(o); fxBackground.setZ(s.zIndex||1); fxBackground.setOpacity(s.opacity??0.92); document.getElementById('fx-bgfx')?.classList.remove('fxbg-off'); _syncPanelEnableCheckbox(true, cfg.controlCenter); } else { fxBackground?.destroy?.() ?? fxBackground?.stop?.(); document.getElementById('fx-bgfx')?.classList.add('fxbg-off'); _setState({enabled:false}); _syncPanelEnableCheckbox(false, cfg.controlCenter); } _setPowerLabel(pbtn, on); _closeDock(cfg.menuId, cfg.panelId); }); _setPowerLabel(pbtn, !!_getState().enabled); menu.appendChild(pbtn); }
      cfg.buttons.forEach((def)=>{ if(def.action==='power') return; const sel = `[data-open="${def.key}"]`; if(!menu.querySelector(sel)){ menu.appendChild(_btn(def.label, def.key, ()=>{ let patch = { mode:def.mode, enabled:true }; if(def.intensity!=null) patch.effectIntensity = def.intensity; if(def.mode==='rain'){ patch.rain=true; patch.thunder=false; if(def.intensity!=null) patch.rainDensity=def.intensity; } if(def.mode==='fireworks' && def.intensity!=null) patch.fwDensity = def.intensity; if(def.mode==='meteor' && def.intensity!=null) patch.meteorDensity = def.intensity; if(def.mode==='galaxy' && def.intensity!=null) patch.starDensity = def.intensity; if(def.mode==='wetglass' && def.intensity!=null) patch.wetglassDensity = def.intensity; if(def.mode==='snow' && def.intensity!=null) patch.snowDensity = def.intensity; if(def.mode==='aurora' && def.intensity!=null) patch.auroraIntensity = def.intensity; if(def.mode==='bubbles' && def.intensity!=null) patch.bubbleDensity = def.intensity; if(def.mode==='fireflies' && def.intensity!=null) patch.fireflyDensity = def.intensity; if(def.mode==='caustics' && def.intensity!=null) patch.causticsStrength = def.intensity; const s=_setState(patch); const o=_optsFromState(s); fxBackground.start(o); fxBackground.setZ(s.zIndex||1); fxBackground.setOpacity(s.opacity??0.92); document.getElementById('fx-bgfx')?.classList.remove('fxbg-off'); _syncPanelEnableCheckbox(true, cfg.controlCenter); _closeDock(cfg.menuId, cfg.panelId); })); } }); return true; }

    FXPanel.attachToMicroDock = function(opts){ const cfg = Object.assign({ menuId:'mdPanelMenu', panelId:'mdPanel', controlCenter:'#controlCenter', buttons:[ { key:'fx-power', label:'FX: OFF', action:'power' }, { key:'fx-fw', label:'Fireworks', mode:'fireworks', intensity:0.85 }, { key:'fx-firefly', label:'Fireflies', mode:'fireflies', intensity:0.65 }, { key:'fx-caust', label:'Caustics', mode:'caustics', intensity:0.55 }, { key:'fx-rain', label:'Rain', mode:'rain', intensity:0.60 }, { key:'fx-snow', label:'Snow', mode:'snow', intensity:0.65 }, { key:'fx-galaxy', label:'Galaxy', mode:'galaxy', intensity:0.60 }, { key:'fx-bubbles', label:'Bubbles', mode:'bubbles', intensity:0.70 } ], autoObserve:true, observeTimeout:8000, reattachOnOpen:true, burgerBtnId:null }, opts||{});
      if(_attachOnce(cfg)){ const menuEl = document.getElementById(cfg.menuId); if(menuEl){ const menuObs = new MutationObserver(()=>{ _attachOnce(cfg); }); menuObs.observe(menuEl, { childList:true, subtree:false }); } }
      if(cfg.reattachOnOpen && cfg.burgerBtnId){ const b = document.getElementById(cfg.burgerBtnId); if(b){ b.addEventListener('click', ()=> setTimeout(()=> _attachOnce(cfg), 0)); } }
      if(!document.getElementById(cfg.menuId) && cfg.autoObserve){ const obs = new MutationObserver(()=>{ if(_attachOnce(cfg)){ obs.disconnect(); } }); obs.observe(document.documentElement, { childList:true, subtree:true }); setTimeout(()=>{ try{ obs.disconnect(); }catch(_){ } }, cfg.observeTimeout); }
    };
  })();

  window.FXPanel = FXPanel;
})();
