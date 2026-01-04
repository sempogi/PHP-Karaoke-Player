// simple_mapper_v1.1.js (patched)
// Minimal Instrument Mapper (3 inputs) — FIXED for js-synthesizer API names
// + Raw-MIDI fallback for Program Change (midiMessage/send)
// + Optional suppression of internal reapply via window.smNoDouble
// + Promise-returning apply() for better coordination with bundles
// Uses midiBankSelect/midiProgramChange when available; falls back to CC0/32 + Program Change
// 2025-09-28

(function(){
  if (window.__SIMPLE_MAPPER_V11__) return; window.__SIMPLE_MAPPER_V11__=true;

  function el(id){ return document.getElementById(id); }
  function clamp(v,a,b){ v=+v||0; return Math.max(a, Math.min(b, v)); }
  function log(){ try{ console.log.apply(console, ['[SimpleMapper]'].concat([].slice.call(arguments))); }catch(e){} }

  var _synth=null;
  function autoBind(){
    if(_synth) return _synth;
    var c=[window.synth, window.SYN, window.jsSynth, (window.JSSynth&&JSSynth.__lastSynth)];
    for(var i=0;i<c.length;i++){
      var s=c[i]; if(!s) continue;
      if (typeof s.midiControl==='function' || typeof s.midiProgramChange==='function' ||
          typeof s.midiBankSelect==='function' || typeof s.midiMessage==='function' ||
          typeof s.send==='function') {
        _synth=s; log('Auto-bound to synth'); break;
      }
    }
    return _synth;
  }

  function bank14(msb, lsb){ msb=clamp(msb,0,127); lsb=clamp(lsb,0,127); return (msb<<7) | lsb; }

  // Send selection with best-available methods
  function sendSelect(s, ch, msb, lsb, pg){
    ch = clamp(ch,0,15); msb=clamp(msb,0,127); lsb=clamp(lsb,0,127); pg=clamp(pg,0,127);
    var ok=false;
    try{
      if (typeof s.midiBankSelect==='function'){ s.midiBankSelect(ch, bank14(msb, lsb)); ok=true; }
    }catch(e){ log('midiBankSelect error', e); }
    // Fallback to CC0/32 if midiBankSelect not available
    if (!ok){ try{ s.midiControl && s.midiControl(ch, 0, msb); }catch(e){ log('CC0 error', e); }
              try{ s.midiControl && s.midiControl(ch, 32, lsb); }catch(e){ log('CC32 error', e); } }
    // Program change with multiple fallbacks
    try{
      if (typeof s.midiProgramChange==='function') {
        s.midiProgramChange(ch, pg);
      } else if (typeof s.programChange==='function') {
        s.programChange(ch, pg);
      } else if (typeof s.midiMessage==='function') {
        // raw MIDI Program Change
        s.midiMessage(0xC0 | ch, pg & 0x7F, 0);
      } else if (typeof s.send==='function') {
        s.send([0xC0 | ch, pg & 0x7F, 0]);
      } else {
        log('No ProgramChange API available on synth');
      }
    }catch(e){ log('ProgramChange error', e); }
  }

  // Inject CSS + DOM
  function inject(){
    if (el('smBtn')) return;
    var css = '\
#smBtn{ position:fixed; right:12px; top: calc(12px + env(safe-area-inset-top)); z-index:99990; width:44px; height:44px; border-radius:12px; border:1px solid #3a5166; background:#1b2633; color:#dfe8f3; box-shadow:0 2px 10px rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; font-size:18px; line-height:1; user-select:none; touch-action:none }\
#smBtn:active{ filter:brightness(1.1) }\
#smPanel{ position:fixed; right:12px; top: calc(60px + env(safe-area-inset-top)); z-index:99989; background:rgba(20,22,26,.98); color:#e7eef8; border:1px solid #3a5166; border-radius:12px; padding:10px; box-shadow:0 10px 28px rgba(0,0,0,.5); width:min(380px, 94vw); display:none }\
#smPanel.visible{ display:block }\
#smPanel .row{ display:flex; gap:8px; align-items:center; margin:6px 0 }\
#smPanel label{ font:12px/1.2 system-ui; color:#b7c8d9 }\
#smPanel input[type=number], #smPanel select{ width:100%; background:#12161a; color:#dfe8f3; border:1px solid #3a5166; border-radius:8px; padding:6px 8px }\
#smApply{ background:#2a3d52; color:#e7eef8; border:1px solid #3a5166; border-radius:8px; padding:8px 12px }\
#smApply:active{ filter:brightness(1.08) }\
#smHeader{ display:flex; align-items:center; justify-content:space-between; margin-bottom:6px }\
#smHeader .ttl{ font-weight:700; color:#cfe7ff }\
#smClose{ background:transparent; color:#9fb6c9; border:0; font-size:18px }\
';
    var st=document.createElement('style'); st.id='smCSS'; st.textContent=css; document.head.appendChild(st);

    var btn=document.createElement('button'); btn.id='smBtn'; btn.title='Mapper'; btn.textContent='🎛️'; document.body.appendChild(btn);
    var panel=document.createElement('section'); panel.id='smPanel'; panel.innerHTML='\
      <div id="smHeader"><div class="ttl">Instrument Mapper</div><button id="smClose" title="Close">✖</button></div>\
      <div class="row">\
        <div style="flex:1">\
          <label>Channel</label>\
          <select id="smChan"></select>\
        </div>\
        <div style="flex:1">\
          <label>Bank MSB (CC0)</label>\
          <input id="smMSB" type="number" min="0" max="127" step="1" value="0"/>\
        </div>\
      </div>\
      <div class="row">\
        <div style="flex:1">\
          <label>Bank LSB (CC32)</label>\
          <input id="smLSB" type="number" min="0" max="127" step="1" value="0"/>\
        </div>\
        <div style="flex:1">\
          <label>Program</label>\
          <input id="smProg" type="number" min="0" max="127" step="1" value="0"/>\
        </div>\
      </div>\
      <div class="row" style="justify-content:flex-end">\
        <button id="smApply">Apply</button>\
      </div>';
    document.body.appendChild(panel);

    // Populate channels 1..16
    var chSel=el('smChan'); for(var i=1;i<=16;i++){ var o=document.createElement('option'); o.value=String(i); o.textContent='CH '+i+(i===10?' (Drums)':''); chSel.appendChild(o); }

    // Toggle
    btn.addEventListener('click', function(){ panel.classList.toggle('visible'); });
    el('smClose').addEventListener('click', function(){ panel.classList.remove('visible'); });

    // Restore last values per channel
    var KEY='sm:v1.1';
    function loadState(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } }
    function saveState(st){ try{ localStorage.setItem(KEY, JSON.stringify(st||{})); }catch(e){} }
    var state=loadState();

    function paint(){ var c=parseInt(chSel.value,10)||1; var rec=state[c]||{msb:0,lsb:0,pg:0}; el('smMSB').value=rec.msb; el('smLSB').value=rec.lsb; el('smProg').value=rec.pg; }
    chSel.addEventListener('change', paint);

    // Handle Apply (with optional double-hit)
    el('smApply').addEventListener('click', function(){
      var ch=clamp(parseInt(chSel.value,10)||1,1,16)-1; var msb=clamp(el('smMSB').value,0,127); var lsb=clamp(el('smLSB').value,0,127); var pg =clamp(el('smProg').value,0,127);
      state[clamp(ch+1,1,16)]={msb:msb, lsb:lsb, pg:pg}; saveState(state);
      var s=_synth||autoBind(); if(!s){ alert('No synth bound. Start playback first, then press Apply again.'); return; }
      var apply = function(){ sendSelect(s, ch, msb, lsb, pg); };
      apply();
      if (!window.smNoDouble) setTimeout(apply, 120); // small reapply to override tick-0 PCs
      log('Applied → CH', (ch+1), 'MSB', msb, 'LSB', lsb, 'PROG', pg);
    });

    paint();
  }

  // Public API
  window.SimpleMapper = {
    bindSynth: function(s){ _synth=s; log('Synth bound'); },
    show: function(){ inject(); el('smPanel').classList.add('visible'); },
    hide: function(){ var p=el('smPanel'); if(p) p.classList.remove('visible'); },
    apply: function(opts){
      var s=_synth||autoBind(); if(!s) return Promise.resolve(false);
      var ch=clamp((opts.channel||1)-1,0,15); var msb=clamp(opts.bankMSB,0,127); var lsb=clamp(opts.bankLSB,0,127); var pg=clamp(opts.program,0,127);
      try{
        sendSelect(s, ch, msb, lsb, pg);
        if (!window.smNoDouble) setTimeout(function(){ sendSelect(s, ch, msb, lsb, pg); }, 120);
        log('Applied via API → CH',ch+1,msb,lsb,pg);
        return Promise.resolve(true);
      }catch(e){ log('apply API error', e); return Promise.resolve(false); }
    }
  };

  if(document.readyState!=='loading') inject(); else document.addEventListener('DOMContentLoaded', inject, {once:true});
})();
