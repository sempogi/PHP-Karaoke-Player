// header_animated_patch_v2.js
// Generated: 2025-09-26 13:11
// Animated header (title shimmer + moving underline + tiny EQ), with robust logo auto-detect.
// NEW in v2:
//   - Auto-detect logo from common filenames: logo.png/.jpg/.jpeg/.svg/.webp (tries in order)
//   - Optional <header data-logo="path/to/logo.jpg"> override
//   - Console helper: __HEADER.setLogo('path/to/logo.jpg') persists in localStorage
//   - If no logo resolves, image hides gracefully (you'll still see the underline + title)

(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }

  var LSKEY='headerAnim';
  var LOGOKEY='brandLogoSrc';
  var animOn = (localStorage.getItem(LSKEY)||'on')==='on';
  var savedLogo = localStorage.getItem(LOGOKEY)||'';
  var rafEQ=0, eqBars=[];

  // --- CSS ---
  function injectCSS(){
    if ($('#hd-anim-css')) return;
    var st=document.createElement('style'); st.id='hd-anim-css';
    st.textContent = `
/* Keep header above background */
header, main { position: relative; z-index: 2 }

/* Brand base */
header .brand{ display:flex; align-items:center; gap:8px; color:var(--fg); text-decoration:none; font-weight:700; font-size:18px }
header .brand .logo{ width:24px; height:24px; object-fit:contain; filter: drop-shadow(0 0 2px rgba(0,0,0,.5)) }
header .brand .title{ position:relative; display:inline-flex; align-items:center }

/* Title shimmer (very subtle, crisp) */
@keyframes hdShimmer{ 0%{ background-position:0% 50% } 100%{ background-position:200% 50% } }
header.animated .brand .title{ 
  background: linear-gradient(90deg, var(--fg) 0%, color-mix(in srgb, var(--hl) 35%, var(--fg)) 25%, var(--fg) 50%, color-mix(in srgb, var(--hl) 35%, var(--fg)) 75%, var(--fg) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  background-size: 200% 100%;
  animation: hdShimmer 8s linear infinite;
}

/* Underline that slowly slides */
header .hd-underline{ position:absolute; left:0; right:0; bottom:-4px; height:2px; border-radius:2px; overflow:hidden }
header .hd-underline::before{
  content:""; position:absolute; inset:0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--hl) 65%, transparent), transparent 35%, color-mix(in srgb, var(--hl) 65%, transparent) 70%, transparent 100%);
  background-size: 220% 100%;
  animation: hdUnder 9s linear infinite;
}
@keyframes hdUnder{ 0%{ background-position:0 0 } 100%{ background-position:-200% 0 } }

/* Tiny EQ bars next to the logo */
#hdEQ{ display:inline-flex; gap:2px; height:14px; align-items:flex-end; margin-left:2px }
#hdEQ .b{ width:2px; background: linear-gradient(180deg, var(--hl), color-mix(in srgb, var(--hl) 45%, #1b2633)); transform-origin:50% 100%; transform: scaleY(0.2); border-radius:1px }
@media (min-width:1024px){ header .brand{ font-size:20px } header .brand .logo{ width:28px; height:28px } #hdEQ{ height:16px } }

/* Reduce motion accessibility */
@media (prefers-reduced-motion: reduce){ header.animated .brand .title{ animation: none } header .hd-underline::before{ animation: none } }
`;
    document.head.appendChild(st);
  }

  // --- Logo source resolver ---
  function resolveLogoSrc(logoEl){
    var header = $('header');
    var hint = (header && header.getAttribute('data-logo')) || '';
    var candidates = [];
    if (hint) candidates.push(hint);
    if (savedLogo) candidates.push(savedLogo);
    candidates.push('logo.png','logo.jpg','logo.jpeg','logo.svg','logo.webp');

    var idx = 0;
    function tryNext(){
      if (!logoEl) return;
      if (idx>=candidates.length){ logoEl.style.display='none'; return; }
      var src = candidates[idx++];
      // Skip empty strings
      if(!src){ tryNext(); return; }
      logoEl.style.display='';
      logoEl.onerror = function(){ tryNext(); };
      logoEl.onload  = function(){ try{ localStorage.setItem(LOGOKEY, src); }catch(e){} };
      logoEl.src = src;
    }
    tryNext();
  }

  // --- Build/ensure brand structure ---
  function ensureBrand(){
    var header = $('header'); if(!header) return null;
    var brand = header.querySelector('.brand');
    if(!brand){
      var h3 = header.querySelector('h3');
      brand = document.createElement('a'); brand.className='brand'; brand.href='index.php'; brand.title='Home';
      var logo = document.createElement('img'); logo.className='logo'; logo.alt='';
      resolveLogoSrc(logo);
      var span = document.createElement('span'); span.className='title'; span.textContent = (h3 && h3.textContent.trim()) || 'KaraokeHD Player';
      var ul = document.createElement('span'); ul.className='hd-underline';
      var eq = document.createElement('span'); eq.id='hdEQ';
      for(var i=0;i<5;i++){ var b=document.createElement('i'); b.className='b'; eq.appendChild(b); }
      brand.appendChild(logo); brand.appendChild(eq); brand.appendChild(span); span.appendChild(ul);
      if(h3) h3.replaceWith(brand); else header.insertBefore(brand, header.firstChild);
    } else {
      // Ensure title + underline
      var t = brand.querySelector('.title'); if(!t){ t=document.createElement('span'); t.className='title'; t.textContent='KaraokeHD Player'; brand.appendChild(t); }
      if(!t.querySelector('.hd-underline')){ var ul=document.createElement('span'); ul.className='hd-underline'; t.appendChild(ul); }
      // Ensure EQ
      if(!brand.querySelector('#hdEQ')){ var eq=document.createElement('span'); eq.id='hdEQ'; for(var j=0;j<5;j++){ var b=document.createElement('i'); b.className='b'; eq.appendChild(b); } brand.insertBefore(eq, t); }
      // Ensure logo exists and has a source
      var logo = brand.querySelector('.logo');
      if(!logo){ logo=document.createElement('img'); logo.className='logo'; logo.alt=''; brand.insertBefore(logo, brand.firstChild); }
      if(!logo.getAttribute('src') || logo.naturalWidth===0){ resolveLogoSrc(logo); }
    }
    return brand;
  }

  // --- EQ animation loop ---
  function startEQ(){
    cancelAnimationFrame(rafEQ);
    var eq = $('#hdEQ'); if(!eq) return;
    eqBars = $all('.b', eq);
    if(!eqBars.length) return;

    var idlePhase=0;
    var data = null;
    try{ if (window.analyser && typeof window.analyser.getByteFrequencyData==='function') data = new Uint8Array(window.analyser.frequencyBinCount); }catch(e){}

    function frame(){
      try{
        if(data){
          window.analyser.getByteFrequencyData(data);
          var N = data.length; if(N<32){ data=null; throw 0; }
          var idxs = [Math.floor(N*0.03), Math.floor(N*0.08), Math.floor(N*0.16), Math.floor(N*0.3), Math.floor(N*0.55)];
          for(var i=0;i<5;i++){
            var v = data[idxs[i]]||0; var h = 0.15 + (v/255)*0.85;
            eqBars[i].style.transform = 'scaleY('+h.toFixed(3)+')';
          }
        } else {
          idlePhase += 0.06;
          for(var j=0;j<5;j++){
            var h = 0.35 + 0.25*Math.sin(idlePhase + j*0.8);
            eqBars[j].style.transform = 'scaleY('+h.toFixed(3)+')';
          }
        }
      }catch(e){}
      rafEQ = requestAnimationFrame(frame);
    }
    frame();
  }

  function stopEQ(){ cancelAnimationFrame(rafEQ); rafEQ=0; }

  // --- Control Center toggle injection ---
  function injectCCToggle(){
    var cc = $('#ccPanel'); if(!cc) return;
    var headerRow = Array.from(cc.querySelectorAll('.row')).find(function(r){ return /Header/i.test(r.textContent||''); });
    if(!headerRow){ return; }
    if(headerRow.querySelector('#ccHeaderAnim')) return;
    var btn = document.createElement('button'); btn.id='ccHeaderAnim'; btn.className='small'; btn.textContent = 'Anim';
    btn.style.marginLeft='8px';
    btn.classList.toggle('active', animOn);
    btn.addEventListener('click', function(){ animOn=!animOn; btn.classList.toggle('active', animOn); try{ localStorage.setItem(LSKEY, animOn?'on':'off'); }catch(e){} applyAnimState(); });
    headerRow.appendChild(btn);
  }

  // --- Apply on/off state ---
  function applyAnimState(){
    var header = $('header'); if(!header) return;
    header.classList.toggle('animated', !!animOn);
    if(animOn){ startEQ(); }
    else { stopEQ(); var bars=$all('#hdEQ .b'); bars.forEach(function(b){ b.style.transform='scaleY(0.2)'; }); }
  }

  // --- Console helper to set a specific logo path ---
  window.__HEADER = {
    setLogo: function(path){ try{ localStorage.setItem(LOGOKEY, String(path||'')); }catch(e){} var img = document.querySelector('header .brand .logo'); if(img){ img.removeAttribute('src'); img.style.display=''; img.onload=null; img.onerror=null; } setTimeout(function(){ ensureBrand(); }, 0); return localStorage.getItem(LOGOKEY)||''; }
  };

  // --- Hook setStatus (optional) ---
  function hookStatus(){
    if (window.__origSetStatusHD) return; window.__origSetStatusHD = window.setStatus;
    window.setStatus = function(msg){
      try{ window.__origSetStatusHD && window.__origSetStatusHD(msg); }catch(e){}
      try{
        var h=$('header'); if(!h) return;
        if(msg==='PLAYING'){ h.classList.add('animated'); if(animOn) startEQ(); }
        if(msg==='IDLE'){ if(animOn) startEQ(); }
      }catch(e){}
    };
  }

  onReady(function(){ injectCSS(); ensureBrand(); injectCCToggle(); applyAnimState(); hookStatus(); });
})();
