
/* healing_toggle_allinone_autoui_collapsible.js
 * All-in-one + auto-floating UI with collapse/minimize, docking, and hotkey.
 * Features: dual, mix, age test, sleep (binaural), isochronic, pink/brown noise, runners.
 * UI: dock top-right by default; can collapse to a tiny pill; remembers state via localStorage.
 */
(function(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  const LS_KEY_COLLAPSE = 'healingFX_collapsed';
  const LS_KEY_DOCK = 'healingFX_dock'; // 'tr','br','bl','tl'

  const PRESETS = [
    { id:'custom', label:'Custom' },
    { id:'calm',   label:'Calm Blend — 528 + 432',   mode:'dual', aHz:528, bHz:432 },
    { id:'ground', label:'Grounding — 396 + 639',    mode:'dual', aHz:396, bHz:639 },
    { id:'clarity',label:'Clarity — 741 + 852',      mode:'dual', aHz:741, bHz:852 },
    { id:'crown',  label:'Crown — 963 + 432',        mode:'dual', aHz:963, bHz:432 },
    { id:'renew',  label:'Renew — 417 + 528',        mode:'dual', aHz:417, bHz:528 },
    { id:'mix_solfeggio', label:'Solfeggio Mix — 396–963', mode:'mix', mixFreqs:[396,417,432,528,639,741,852,963] },
    { id:'mosq_hi', label:'Mosquito (Experimental) — 15–18 kHz', mode:'mix', mixFreqs:[15000,16500,18000], waveMix:'sine', mixVolEach:0.02 },
    { id:'dog_hi',  label:'Dog Alert — 23 kHz',      mode:'mix', mixFreqs:[23000], waveMix:'sine', mixVolEach:0.02 },
    { id:'cat_hi',  label:'Cat Alert — 30 kHz',      mode:'mix', mixFreqs:[30000], waveMix:'sine', mixVolEach:0.02 },
    { id:'annoy',   label:'Annoying Zone — 2–5 kHz', mode:'mix', mixFreqs:[2000,3150,5000], waveMix:'sine', mixVolEach:0.02 },
    { id:'brown_note', label:'Brown Note (Myth) — 5–9 Hz', mode:'mix', mixFreqs:[5,7,9], waveMix:'sine', mixVolEach:0.02 },
    { id:'shepard', label:'Shepard Tone Illusion',    mode:'mix', mixFreqs:[440,880,1760,3520], waveMix:'sine', mixVolEach:0.02 },
    { id:'asmr_fun',label:'ASMR Chill — 432 vs 440 Hz', mode:'binaural', aHz:436, beatHz:8 },
    { id:'meme',    label:'Meme Mode — 420 + 1337 Hz', mode:'dual', aHz:420, bHz:1337 },
    { id:'age_8k',  label:'Age Test — 8 kHz',  mode:'mix', mixFreqs:[8000],  waveMix:'sine', mixVolEach:0.02 },
    { id:'age_12k', label:'Age Test — 12 kHz', mode:'mix', mixFreqs:[12000], waveMix:'sine', mixVolEach:0.02 },
    { id:'age_15k', label:'Age Test — 15 kHz', mode:'mix', mixFreqs:[15000], waveMix:'sine', mixVolEach:0.02 },
    { id:'age_17k', label:'Age Test — 17 kHz', mode:'mix', mixFreqs:[17000], waveMix:'sine', mixVolEach:0.02 },
    { id:'age_19k', label:'Age Test — 19 kHz', mode:'mix', mixFreqs:[19000], waveMix:'sine', mixVolEach:0.02 },
    { id:'age_20k', label:'Age Test — 20 kHz', mode:'mix', mixFreqs:[20000], waveMix:'sine', mixVolEach:0.02 },
    { id:'sleep_alpha', label:'Wind‑down — Alpha 10 Hz (binaural)', mode:'binaural', aHz:220, beatHz:10 },
    { id:'sleep_theta', label:'Sleep — Theta 5 Hz (binaural)',      mode:'binaural', aHz:200, beatHz:5 },
    { id:'sleep_delta', label:'Sleep — Delta 2.5 Hz (binaural)',    mode:'binaural', aHz:180, beatHz:2.5 },
    { id:'sleep_432',  label:'Sleep — 432 Hz (calm tone)',         mode:'mix', mixFreqs:[432], waveMix:'sine', mixVolEach:0.02 },
    { id:'sleep_528',  label:'Sleep — 528 Hz (calm tone)',         mode:'mix', mixFreqs:[528], waveMix:'sine', mixVolEach:0.02 },
    { id:'iso_delta',  label:'Sleep — Isochronic Delta 2 Hz',       mode:'iso', isoFreq:150, isoPulseHz:2.0, isoVol:0.04 },
    { id:'sleep_pink',  label:'Sleep — Pink Noise',  mode:'noise', noiseColor:'pink',  noiseVol:0.03 },
    { id:'sleep_brown', label:'Sleep — Brown Noise', mode:'noise', noiseColor:'brown', noiseVol:0.03 }
  ];

  const state = {
    mode: 'off', aHz: 528, bHz: 432, volA: 0.08, volB: 0.06, masterVol: 0.03,
    waveA: 'sine', waveB: 'sine', beatHz: 4, attack: 0.08, release: 0.40,
    mixFreqs: [396,417,432,528,639,741,852,963], mixVolEach: 0.03, waveMix: 'sine',
    isoFreq: 150, isoPulseHz: 2.0, isoVol: 0.04,
    noiseColor: 'pink', noiseVol: 0.03,
    currentPreset: 'custom'
  };

  let active = [];
  const noiseCache = { pink:null, brown:null, white:null };

  function ensureCtx(){ if (!ctx) ctx = new AudioCtx(); return ctx; }
  function clampHz(v){ return Math.min(40000, Math.max(20, Number.isFinite(+v) ? +v : 440)); }
  function clamp01(v){ return Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0.2)); }

  function stop(){ try { active.forEach(n => { try{ n.disconnect && n.disconnect(); }catch{} try{ n.stop && n.stop(); }catch{} }); } finally { active = []; } }

  function start(mode){ const c = ensureCtx(); const now = c.currentTime; state.mode = mode || state.mode || 'dual'; const master = c.createGain(); master.gain.setValueAtTime(clamp01(state.masterVol), now); master.connect(c.destination); active.push(master);
    if (state.mode==='dual'){ spawnTone(c, clampHz(state.aHz), clamp01(state.volA), state.waveA, now, 0, state.attack, state.release, master); spawnTone(c, clampHz(state.bHz), clamp01(state.volB), state.waveB, now, 0, state.attack, state.release, master); }
    else if (state.mode==='binaural'){ const a = clampHz(state.aHz); const beat = Math.max(0.5, Math.min(40, state.beatHz)); const leftHz=Math.max(20,a-beat/2), rightHz=Math.max(20,a+beat/2); spawnToneStereo(c,leftHz,clamp01(state.volA),state.waveA,-1,now,0,state.attack,state.release,master); spawnToneStereo(c,rightHz,clamp01(state.volA),state.waveA,+1,now,0,state.attack,state.release,master); }
    else if (state.mode==='mix'){ const freqs = Array.isArray(state.mixFreqs)&&state.mixFreqs.length?state.mixFreqs:[528,432]; const per=clamp01(state.mixVolEach); freqs.forEach(f=>spawnTone(c,clampHz(f),per,state.waveMix,now,0,state.attack,state.release,master)); }
    else if (state.mode==='iso'){ const per=clamp01(state.isoVol); spawnIso(c,clampHz(state.isoFreq),per,Math.max(0.5,state.isoPulseHz),now,state.attack,state.release,master); }
    else if (state.mode==='noise'){ const col=state.noiseColor||'pink'; const vol=clamp01(state.noiseVol); spawnNoise(c,col,vol,now,state.attack,master); }
  }

  function spawnTone(c,freq,vol,wave,startTime,dur,att,rel,dest){ const osc=c.createOscillator(), gain=c.createGain(); osc.type=wave; osc.frequency.setValueAtTime(freq,startTime); osc.connect(gain); gain.connect(dest); gain.gain.setValueAtTime(0.0001,startTime); gain.gain.linearRampToValueAtTime(vol,startTime+att); if(dur>0){ const sustainEnd=startTime+dur; gain.gain.setValueAtTime(vol,sustainEnd); gain.gain.linearRampToValueAtTime(0.0001,sustainEnd+rel); osc.start(startTime); osc.stop(sustainEnd+rel+0.01);} else { osc.start(startTime);} active.push(osc,gain);}  
  function spawnToneStereo(c,freq,vol,wave,panValue,startTime,dur,att,rel,dest){ const osc=c.createOscillator(), gain=c.createGain(), p=c.createStereoPanner?c.createStereoPanner():null; osc.type=wave; osc.frequency.setValueAtTime(freq,startTime); osc.connect(gain); if(p){ gain.connect(p); p.pan.value=panValue; p.connect(dest); active.push(p);} else { gain.connect(dest);} gain.gain.setValueAtTime(0.0001,startTime); gain.gain.linearRampToValueAtTime(vol,startTime+att); if(dur>0){ const sustainEnd=startTime+dur; gain.gain.setValueAtTime(vol,sustainEnd); gain.gain.linearRampToValueAtTime(0.0001,sustainEnd+rel); osc.start(startTime); osc.stop(sustainEnd+rel+0.01);} else { osc.start(startTime);} active.push(osc,gain);}  
  function spawnIso(c,freq,vol,pulseHz,startTime,att,rel,dest){ const osc=c.createOscillator(), gate=c.createGain(); const p=c.createStereoPanner?c.createStereoPanner():null; osc.type='sine'; osc.frequency.setValueAtTime(freq,startTime); osc.connect(gate); if(p){ gate.connect(p); p.pan.value=0; p.connect(dest); active.push(p);} else { gate.connect(dest);} gate.gain.setValueAtTime(0.0001,startTime); osc.start(startTime); const periodMs=Math.max(250,1000/Math.max(0.5,pulseHz)); let on=false; const id=setInterval(()=>{ const t=c.currentTime; on=!on; const target=on?vol:0.0001; gate.gain.cancelScheduledValues(t); gate.gain.linearRampToValueAtTime(target,t+(on?att:rel)); },periodMs/2); active.push({ stop:()=>{ try{clearInterval(id);}catch{} try{osc.stop();}catch{} }, disconnect:()=>{ try{osc.disconnect();}catch{} try{gate.disconnect();}catch{} } }); }
  function spawnNoise(c,color,vol,startTime,att,dest){ const src=c.createBufferSource(), gain=c.createGain(); gain.gain.setValueAtTime(0.0001,startTime); gain.gain.linearRampToValueAtTime(vol,startTime+att); const buf=ensureNoiseBuffer(c,color,8); src.buffer=buf; src.loop=true; src.connect(gain); gain.connect(dest); src.start(startTime); active.push(src,gain);}  
  function ensureNoiseBuffer(c,color,seconds){ if(noiseCache[color]) return noiseCache[color]; const sr=c.sampleRate, len=Math.max(1,Math.floor(seconds*sr)); const buf=c.createBuffer(1,len,sr); const data=buf.getChannelData(0); if(color==='pink'){ let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0; for(let i=0;i<len;i++){ const w=Math.random()*2-1; b0=0.99886*b0+0.0555179*w; b1=0.99332*b1+0.0750759*w; b2=0.96900*b2+0.1538520*w; b3=0.86650*b3+0.3104856*w; b4=0.55000*b4+0.5329522*w; b5=-0.7616*b5-0.0168980*w; const pink=b0+b1+b2+b3+b4+b5+b6+0.5362*w; b6=0.115926*w; data[i]=pink*0.11; } } else if(color==='brown'){ let lastOut=0; for(let i=0;i<len;i++){ const w=Math.random()*2-1; lastOut=(lastOut+0.02*w)/1.02; data[i]=lastOut*3.5; } } else { for(let i=0;i<len;i++) data[i]=Math.random()*2-1; } noiseCache[color]=buf; return buf; }

  async function resume(){ const c=ensureCtx(); if(c.state!=='running') await c.resume(); }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function runAgeTest(opts={}){ const set=(opts.freqs&&opts.freqs.length)?opts.freqs:[8000,12000,15000,17000,19000,20000]; const dwellMs=Math.max(400,opts.dwellMs||1200); await resume(); stop(); for(const f of set){ Object.assign(state,{ mode:'mix', mixFreqs:[f] }); start('mix'); await sleep(dwellMs); stop(); await sleep(150);} }
  async function runPresetSequence(ids,dwellMs){ const seq=Array.isArray(ids)?ids:[]; const ms=Math.max(400,dwellMs||1200); await resume(); stop(); for(const id of seq){ applyPresetById(id); start(state.mode); await sleep(ms); stop(); await sleep(150);} }
  async function runSleepRoutine(opts={}){ const seg=Object.assign({ alphaMs:2*60_000, thetaMs:5*60_000, deltaMs:20*60_000 },opts); await resume(); stop(); applyPresetById('sleep_alpha'); start('binaural'); await sleep(seg.alphaMs); stop(); applyPresetById('sleep_theta'); start('binaural'); await sleep(seg.thetaMs); stop(); applyPresetById('sleep_delta'); start('binaural'); await sleep(seg.deltaMs); stop(); }

  function applyPresetById(id){ const p=PRESETS.find(x=>x.id===id); state.currentPreset=id||'custom'; if(!p||id==='custom') return; if(p.mode==='mix'){ state.mode='mix'; if(p.mixFreqs) state.mixFreqs=p.mixFreqs.slice(); if(p.waveMix) state.waveMix=p.waveMix; if(p.mixVolEach!=null) state.mixVolEach=p.mixVolEach; }
    else if(p.mode==='dual'){ state.mode='dual'; if(p.aHz) state.aHz=p.aHz; if(p.bHz) state.bHz=p.bHz; }
    else if(p.mode==='binaural'){ state.mode='binaural'; if(p.aHz) state.aHz=p.aHz; if(p.beatHz!=null) state.beatHz=p.beatHz; }
    else if(p.mode==='iso'){ state.mode='iso'; if(p.isoFreq) state.isoFreq=p.isoFreq; if(p.isoPulseHz!=null) state.isoPulseHz=p.isoPulseHz; if(p.isoVol!=null) state.isoVol=p.isoVol; }
    else if(p.mode==='noise'){ state.mode='noise'; if(p.noiseColor) state.noiseColor=p.noiseColor; if(p.noiseVol!=null) state.noiseVol=p.noiseVol; }
  }

  function dockCss(d){
    const pos = (d||localStorage.getItem(LS_KEY_DOCK)||'tr');
    const map = { tr:'right:12px; top:12px;', br:'right:12px; bottom:12px;', bl:'left:12px; bottom:12px;', tl:'left:12px; top:12px;' };
    localStorage.setItem(LS_KEY_DOCK, pos);
    return map[pos] || map.tr;
  }

  function mount(container, opts={}){
    Object.assign(state, opts);
    const hostCandidate = (typeof container === 'string') ? document.querySelector(container) : container;
    const host = hostCandidate || document.body;

    const wrap = document.createElement('div');
    wrap.className = 'healingFX-wrap';
    const floating = !!opts.floating;
    const collapsedLS = localStorage.getItem(LS_KEY_COLLAPSE);
    const startCollapsed = (opts.startCollapsed === true) || (collapsedLS === '1');

    if (floating){
      wrap.style.cssText = `position:fixed; ${dockCss(opts.dock)} z-index:999999; display:inline-flex; gap:8px; align-items:center; background:#0b1220cc; backdrop-filter: blur(2px); padding:6px 8px; border:1px solid #334155; border-radius:12px;`;
    } else {
      wrap.style.display = 'inline-flex'; wrap.style.gap = '8px'; wrap.style.alignItems = 'center';
    }

    // Header with collapse + dock
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; gap:6px; align-items:center;';

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = startCollapsed ? '⤢' : '⤡'; // expand / collapse glyph
    Object.assign(collapseBtn.style,{padding:'2px 6px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb',cursor:'pointer'});

    const dockSel = document.createElement('select');
    dockSel.innerHTML = '<option value="tr">↗ Top‑Right</option><option value="br">↘ Bottom‑Right</option><option value="bl">↙ Bottom‑Left</option><option value="tl">↖ Top‑Left</option>';
    dockSel.value = localStorage.getItem(LS_KEY_DOCK) || 'tr';
    Object.assign(dockSel.style,{padding:'2px 6px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb'});

    header.append(collapseBtn, dockSel);

    const btn = document.createElement('button'); btn.textContent = 'Healing Tones: OFF';
    Object.assign(btn.style,{padding:'6px 10px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb',cursor:'pointer'});

    const modeSel = document.createElement('select');
    modeSel.innerHTML = ['<option value="off">Off</option>','<option value="dual" selected>Dual (A+B)</option>','<option value="binaural">Binaural (A)</option>','<option value="mix">Mix (set)</option>','<option value="iso">Isochronic</option>','<option value="noise">Noise</option>'].join('');
    Object.assign(modeSel.style,{padding:'6px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb'});

    const presetSel = document.createElement('select'); presetSel.title = 'Presets';
    PRESETS.forEach(p=>{ const opt=document.createElement('option'); opt.value=p.id; opt.textContent=p.label; presetSel.appendChild(opt); });
    Object.assign(presetSel.style,{padding:'6px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb'});

    const a=document.createElement('input'); Object.assign(a,{type:'number',min:'20',max:'40000',step:'0.1',value:state.aHz,title:'Tone A (Hz)'}); a.style.width='90px';
    const b=document.createElement('input'); Object.assign(b,{type:'number',min:'20',max:'40000',step:'0.1',value:state.bHz,title:'Tone B (Hz)'}); b.style.width='90px';

    const runBtn=document.createElement('button'); runBtn.textContent='Run'; Object.assign(runBtn.style,{padding:'6px 10px',borderRadius:'10px',border:'1px solid #334155',background:'#0b1220',color:'#e5e7eb',cursor:'pointer'});

    const note=document.createElement('span'); note.textContent='min vol • phones for binaural'; note.style.cssText='font-size:12px;color:#94a3b8';

    const panel = document.createElement('div');
    panel.style.cssText = 'display:inline-flex; gap:8px; align-items:center;';
    panel.append(btn, modeSel, presetSel, a, b, runBtn, note);

    wrap.append(header, panel);
    host.appendChild(wrap);

    function setCollapsed(v){
      const is = !!v;
      localStorage.setItem(LS_KEY_COLLAPSE, is ? '1' : '0');
      panel.style.display = is ? 'none' : 'inline-flex';
      collapseBtn.textContent = is ? '⤢' : '⤡';
      // when collapsed, show a tiny pill
      wrap.style.background = is ? '#0b122080' : '#0b1220cc';
      wrap.style.padding = is ? '4px 6px' : '6px 8px';
    }

    setCollapsed(startCollapsed);

    dockSel.addEventListener('change', ()=>{
      wrap.style.cssText = `position:fixed; ${dockCss(dockSel.value)} z-index:999999; display:inline-flex; gap:8px; align-items:center; background:${panel.style.display==='none'?'#0b122080':'#0b1220cc'}; backdrop-filter: blur(2px); padding:${panel.style.display==='none'?'4px 6px':'6px 8px'}; border:1px solid #334155; border-radius:12px;`;
    });

    collapseBtn.addEventListener('click', ()=>{
      const isCollapsed = panel.style.display === 'none';
      setCollapsed(!isCollapsed);
    });

    function reflect(){ btn.textContent=(state.mode==='off')?'Healing Tones: OFF':('Healing Tones: '+state.mode.toUpperCase()); const disableAB=(state.mode==='mix'||state.mode==='iso'||state.mode==='noise'||['mix_solfeggio','mosq_hi','dog_hi','cat_hi','annoy','brown_note','shepard','age_8k','age_12k','age_15k','age_17k','age_19k','age_20k','sleep_432','sleep_528','sleep_pink','sleep_brown','iso_delta'].includes(state.currentPreset)); a.disabled=disableAB; b.disabled=disableAB; }

    modeSel.addEventListener('change', async ()=>{ state.mode=modeSel.value; await resume(); stop(); if(state.mode!=='off') start(state.mode); reflect(); });
    presetSel.addEventListener('change', async ()=>{ applyPresetById(presetSel.value); await resume(); stop(); if(state.mode!=='off') start(state.mode); reflect(); a.value=state.aHz; b.value=state.bHz; });
    btn.addEventListener('click', async ()=>{ await resume(); if(state.mode==='off'){ state.mode='dual'; modeSel.value='dual'; start('dual'); } else { stop(); state.mode='off'; modeSel.value='off'; } reflect(); });
    a.addEventListener('input', ()=>{ state.aHz=clampHz(parseFloat(a.value)||state.aHz); state.currentPreset='custom'; if(state.mode!=='off'){ stop(); start(); } });
    b.addEventListener('input', ()=>{ state.bHz=clampHz(parseFloat(b.value)||state.bHz); state.currentPreset='custom'; if(state.mode!=='off'){ stop(); start(); } });
    runBtn.addEventListener('click', async ()=>{ const ids=['calm','mix_solfeggio','sleep_pink','sleep_brown','shepard','age_12k','age_15k','age_17k']; await runPresetSequence(ids,900); reflect(); });

    // default preset
    presetSel.value='calm'; applyPresetById('calm'); reflect();

    // Hotkey: Ctrl+Alt+H to toggle collapse
    window.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key==='h' || e.key==='H')){
        const isCollapsed = panel.style.display === 'none';
        setCollapsed(!isCollapsed);
      }
    });

    return { destroy(){ stop(); wrap.remove(); }, runAgeTest, runPresetSequence, runSleepRoutine };
  }

  // Public API
  window.healingFX = {
    mount,
    start: async (mode)=>{ await resume(); stop(); if(mode==='off'){ return; } start(mode||state.mode||'dual'); },
    stop,
    set: (opts)=>{ Object.assign(state, opts||{}); },
    context: ()=>ensureCtx(),
    getState: ()=>({...state}),
    runAgeTest,
    runPresetSequence,
    runSleepRoutine,
    applyPresetById
  };

  function autoMountIfMissing(){
    if (!document.querySelector('.healingFX-wrap')){
      try { window.healingFX.mount(document.body, { floating:true, startCollapsed:true }); } catch(e){ console && console.error('healingFX auto-mount failed:', e); }
    }
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', autoMountIfMissing, { once:true });
  } else { autoMountIfMissing(); }
  window.addEventListener('load', ()=> setTimeout(autoMountIfMissing, 800));
})();
