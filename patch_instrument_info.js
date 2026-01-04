/*!
 * patch_instrument_info.js
 * MIX16 + SimpleMapperCatalog instrument info (non-intrusive) + Mapper launcher
 * - Alt+I toggle, Hotkey/Click on channel row launches Mapper
 * - Prefills Mapper channel and search with the current loaded instrument
 * - Catalog names only AFTER Program Change was seen; safe fallbacks otherwise
 * - Scrollable (mobile landscape), sticky meta, horizontal overflow
 * v1.1.0 (2025-10-10)
 */
(function(){
  if (window.__SM_INFO_PATCH__) return; window.__SM_INFO_PATCH__ = true;

  var CFG = {
    updateEveryMs: 400,
    autoShow: false,
    useMinimalFallback: true,
    floatLeft: 12,
    floatTop: 86
  };

  // --- tiny helpers ---
  function el(id){return document.getElementById(id);}
  function $(sel,root){return (root||document).querySelector(sel);}
  function clamp(v,a,b){v=+v||0; return Math.max(a, Math.min(b, v));}
  function onceReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }

  function getSFName(){ try{ return (window.sfSelected||window.__LAST_SF_NAME__||'').toString(); }catch(_){return '';} }
  function getSFCount(){ try{
    if(window.SimpleMapperCatalog&&typeof SimpleMapperCatalog.getInstrumentList==='function'){
      var list=SimpleMapperCatalog.getInstrumentList(); return Array.isArray(list)?list.length:0;
    }
  }catch(_){ } return 0; }

  function fallbackName(msb,lsb,pc,ch){
    var P=(pc|0), C=(ch|0);
    if(C===9) return P===0?'Standard Kit':('Drum Kit #'+(P+1));
    return 'Program #'+(P+1);
  }

  // Catalog resolve ONLY if a real PC was observed
  function resolveNameAfterSeen(msb,lsb,pc,ch,seen){
    if(!seen) return '—';
    try{
      if(window.SimpleMapperCatalog && typeof SimpleMapperCatalog.resolveName==='function'){
        var n = SimpleMapperCatalog.resolveName(msb|0, lsb|0, pc|0, {channel:ch});
        if(n) return String(n);
      }
    }catch(_){}
    return CFG.useMinimalFallback ? fallbackName(msb,lsb,pc,ch) : '—';
  }

  function readPatch(ch){
    ch=clamp(ch,0,15);
    try{
      if(window.__MIX16 && typeof __MIX16.getPatch==='function'){
        var p=__MIX16.getPatch(ch);
        if(p){
          return {
            ch:ch, msb:(p.bankMSB|0), lsb:(p.bankLSB|0), pc:(p.program|0),
            seen:!!p.seen, name: String(p.name||'—')
          };
        }
      }
    }catch(_){}
    return { ch:ch, msb:0, lsb:0, pc:0, seen:false, name:'—' };
  }

  // --- CSS (scroll wrappers + clickable rows) ---
  function injectCSS(){
    if(el('smInfoCSS')) return;
    var css = [
      '#smInfoPanel{position:fixed; z-index:99991; left:'+CFG.floatLeft+'px; top:'+CFG.floatTop+'px;',
      ' background:rgba(16,22,28,.96); color:#e7eef8;',
      ' border:1px solid #3a5166; border-radius:12px; box-shadow:0 12px 28px rgba(0,0,0,.5);',
      ' width:min(560px, 96vw); max-height:min(70vh, 520px);',
      ' display:flex; flex-direction:column; user-select:none}',

      '#smInfoPanel h4{margin:0; padding:8px 10px; display:flex; align-items:center; justify-content:space-between;',
      ' font:600 13px/1.2 system-ui; color:#cfe3ff; border-bottom:1px solid rgba(255,255,255,.1); flex:0 0 auto}',

      '#smInfoScroll{flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch}',

      '#smInfoMeta{position:sticky; top:0; z-index:2; background:rgba(16,22,28,.92);',
      ' font:12px/1.3 system-ui; color:#9fb6c9; padding:6px 10px; border-bottom:1px solid rgba(255,255,255,.08)}',

      '#smInfoGridWrap{overflow-x:auto; padding:8px 10px}',

      '#smInfoGrid{display:grid; grid-template-columns: 40px 1fr 112px; gap:6px; align-items:center; min-width:520px}',
      '#smInfoGrid .hdr{opacity:.85; color:#b7c8d9; font:700 11px/1.2 system-ui}',
      '#smInfoGrid .cell{font:12px/1.25 system-ui; color:#e7eef8; background:rgba(12,16,20,.35); border:1px solid rgba(255,255,255,.08);',
      ' border-radius:6px; padding:6px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}',
      '#smInfoGrid .num{font:12px/1.1 monospace; color:#cfe3ff}',

      /* clickable row styles */
      '.smRow{cursor:pointer}',
      '.smRow:hover{filter:brightness(1.05)}',
      '.smRow.active{outline:1px solid #4fd1ff; outline-offset:1px}',

      '@media (orientation:landscape){',
      '  #smInfoPanel{ max-height:min(60vh, 440px); width:min(540px, 96vw) }',
      '  #smInfoGrid{ grid-template-columns: 34px 1fr 100px; min-width:480px }',
      '  #smInfoGrid .cell{ padding:5px 7px; font-size:11px }',
      '  #smInfoGrid .num{ font-size:11px }',
      '}',

      '@media (max-width:460px){',
      '  #smInfoPanel{ width:min(520px, 96vw) }',
      '  #smInfoGrid{ grid-template-columns: 30px 1fr 92px; min-width:440px }',
      '}'
    ].join('');
    var st=document.createElement('style'); st.id='smInfoCSS'; st.textContent=css; document.head.appendChild(st);
  }

  // --- panel build ---
  function buildPanel(){
    if(el('smInfoPanel')) return;
    var panel=document.createElement('section'); panel.id='smInfoPanel'; panel.innerHTML =
      '<h4 id="smInfoHeader">'+
        '<span>Instrument Info</span>'+
        '<div class="btns">'+
          '<button id="smInfoRefresh" class="btn" title="Refresh now">⟳</button>'+
          '<button id="smInfoMin" class="btn" title="Minimize">—</button>'+
          '<button id="smInfoClose" class="btn" title="Close">×</button>'+
        '</div>'+
      '</h4>'+
      '<div id="smInfoScroll">'+
        '<div id="smInfoMeta">SF: (none) • 0 presets</div>'+
        '<div id="smInfoGridWrap">'+
          '<div id="smInfoGrid"></div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(panel);

    var head=el('smInfoHeader'), sx=0, sy=0, ox=0, oy=0, dragging=false;
    head.addEventListener('mousedown', function(e){
      dragging=true; var r=panel.getBoundingClientRect(); sx=e.clientX; sy=e.clientY; ox=sx-r.left; oy=sy-r.top;
      function mv(ev){ if(!dragging) return; var x=ev.clientX, y=ev.clientY;
        var L=clamp(x-ox,0,innerWidth-r.width), T=clamp(y-oy,0,innerHeight-r.height);
        panel.style.left=L+'px'; panel.style.top=T+'px';
      }
      function up(){ dragging=false; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });

    el('smInfoClose').addEventListener('click', function(){ panel.remove(); stopAuto(); });
    el('smInfoMin').addEventListener('click', function(){
      var sc=el('smInfoScroll'); if(!sc) return;
      sc.style.display = (sc.style.display==='none') ? '' : 'none';
    });
    el('smInfoRefresh').addEventListener('click', function(){ refreshNow(true); });
  }

  function ensureGrid(){
    var grid=el('smInfoGrid'); if(!grid||grid.dataset.built) return;
    var html='';
    html+='<div class="hdr">CH</div><div class="hdr">Name</div><div class="hdr">MSB:LSB:PG</div>';
    for(var ch=0; ch<16; ch++){
      html+='<div class="cell num smRow" id="smI_ch_'+ch+'" data-ch="'+ch+'">'+(ch+1)+'</div>';
      html+='<div class="cell smRow" id="smI_name_'+ch+'" data-ch="'+ch+'">—</div>';
      html+='<div class="cell num smRow" id="smI_nums_'+ch+'" data-ch="'+ch+'">0:0:0</div>';
    }
    grid.innerHTML=html;
    grid.dataset.built='1';

    // Click-to-launch Mapper
    grid.addEventListener('click', function(e){
      var cell = e.target.closest('.smRow'); if(!cell) return;
      var ch = parseInt(cell.getAttribute('data-ch'),10); if(isNaN(ch)) return;
      launchMapperForChannel(ch);
      // UI feedback
      grid.querySelectorAll('.smRow').forEach(function(n){ n.classList.remove('active'); });
      var cid = ['smI_ch_'+ch,'smI_name_'+ch,'smI_nums_'+ch];
      cid.forEach(function(id){ var n=el(id); if(n) n.classList.add('active'); });
    });
  }

  function paintMeta(){
    var meta=el('smInfoMeta'); if(!meta) return;
    var sfn=getSFName(), cnt=getSFCount();
    meta.textContent='SF: '+(sfn?sfn:'(none)')+' • '+cnt+' presets';
  }

  function paintRow(ch, patch){
    var nameEl=el('smI_name_'+ch), numsEl=el('smI_nums_'+ch);
    if(!nameEl||!numsEl) return;
    var msb=patch.msb|0, lsb=patch.lsb|0, pc=patch.pc|0, seen=!!patch.seen;
    var displayName = resolveNameAfterSeen(msb,lsb,pc,ch,seen);
    nameEl.textContent=displayName;
    numsEl.textContent=(msb+':'+lsb+':'+pc);
  }

  var AUTO_T=null;
  function refreshNow(forceCatalogRefresh){
    try{
      if(forceCatalogRefresh && window.SimpleMapperCatalog && typeof SimpleMapperCatalog.refreshSF==='function'){
        SimpleMapperCatalog.refreshSF();
      }
    }catch(_){}
    paintMeta();
    for(var ch=0; ch<16; ch++){ paintRow(ch, readPatch(ch)); }
  }
  function startAuto(){ stopAuto(); AUTO_T=setInterval(function(){ refreshNow(false); }, CFG.updateEveryMs); }
  function stopAuto(){ if(AUTO_T){ clearInterval(AUTO_T); AUTO_T=null; } }

  // --- Mapper bridge (you wire these to your actual Mapper UI) ---
  if(!window.SMInfoMapperBridge){
    // Default NO-OP bridge; replace these with your Mapper UI hooks
    window.SMInfoMapperBridge = {
      open: function(){ /* e.g., WM.mapper.show() or document.getElementById('mapperPanel').classList.add('visible') */ },
      setChannel: function(ch){ /* e.g., document.getElementById('smChanSel').value=String(ch); */ },
      setSearch: function(q){ /* e.g., var s=document.getElementById('smSearch'); s.value=q; s.dispatchEvent(new Event('input')); */ }
    };
  }

  // build a sensible default search text
  function makeDefaultSearchText(p){
    // Prefer resolved name; fallback to kit/program hints
    var ch=p.ch|0, name=(p.name||'').trim();
    if(name && name!=='—') return name;
    if(ch===9) return (p.pc|0)===0 ? 'Standard Kit' : 'Drum';
    return 'Program '+((p.pc|0)+1);
  }

  function launchMapperForChannel(ch){
    ch = clamp(ch,0,15);
    var p = readPatch(ch);
    var query = makeDefaultSearchText(p);
    try{
      SMInfoMapperBridge.open();
      SMInfoMapperBridge.setChannel(ch);
      SMInfoMapperBridge.setSearch(query);
    }catch(e){ /* silent */ }
  }

  // --- Public API ---
  window.SMInfo = {
    show: function(){ injectCSS(); buildPanel(); ensureGrid(); refreshNow(true); startAuto(); },
    hide: function(){ var p=el('smInfoPanel'); if(p) p.remove(); stopAuto(); },
    toggle: function(){ var p=el('smInfoPanel'); if(p){ this.hide(); } else { this.show(); } },
    refresh: function(){ refreshNow(true); },
    config: function(opts){
      if(!opts) return CFG;
      if(typeof opts.updateEveryMs==='number') CFG.updateEveryMs=clamp(opts.updateEveryMs,100,5000);
      if(typeof opts.useMinimalFallback==='boolean') CFG.useMinimalFallback=!!opts.useMinimalFallback;
      return CFG;
    },
    launchMapperForChannel: launchMapperForChannel
  };

  // --- Micro-dock button + hotkey ---
  function hookMicroDock(){
    try{
      var menu=$('#mdPanelMenu'); if(!menu) return;
      if(!menu.querySelector('[data-open="smInfo"]')){
        var b=document.createElement('button');
        b.className='md-item'; b.setAttribute('data-open','smInfo'); b.textContent='Inst Info';
        menu.appendChild(b);
        menu.addEventListener('click', function(e){
          var t=e.target.closest('[data-open]'); if(!t) return;
          if(t.getAttribute('data-open')==='smInfo') window.SMInfo.toggle();
        });
      }
    }catch(_){}
  }

  function hookHotkey(){
    try{
      window.addEventListener('keydown', function(e){
        if(e.altKey && (e.key==='i' || e.key==='I')){ e.preventDefault(); window.SMInfo.toggle(); return; }
        // Alt+Number 1..16 → open mapper for that channel
        if(e.altKey){
          var k = String(e.key||''); var n = parseInt(k,10);
          if(n>=1 && n<=9){ e.preventDefault(); launchMapperForChannel(n-1); }
          else if (k==='0'){ e.preventDefault(); launchMapperForChannel(9); } // 0 → ch10
          // add Alt+Q..W.. for 11–16 if you like; left minimal
        }
      }, true);
    }catch(_){}
  }

  onceReady(function(){ injectCSS(); hookMicroDock(); hookHotkey();
    if(CFG.autoShow){ buildPanel(); ensureGrid(); refreshNow(true); startAuto(); }
  });
})();