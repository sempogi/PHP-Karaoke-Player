
(function(){
  function $(sel,root){ return (root||document).querySelector(sel); }

  function ensureUI(){
    const cc = $('#ccPanel'); if(!cc) return false; const list = cc.querySelector('.list'); if(!list) return false; if($('#recRow')) return true;
    const row = document.createElement('div'); row.className='row'; row.id='recRow';
    row.innerHTML = '<span class="label">Record</span>'+
      '<button id="recToggle" class="small">Start</button>'+
      '<span id="recStatus" class="small" style="margin-left:8px;color:#9fc">Idle</span>'+
      '<label class="small" style="margin-left:8px"><input type="checkbox" id="recAlsoDownload"> Also download</label>';
    list.appendChild(row); return true;
  }

  function currentRel(){
    try{
      if (window.lastPlayed && lastPlayed.rel) return lastPlayed.rel;
      if (window.currentSong) return window.currentSong;
    }catch(e){}
    return '';
  }

  function stripExt(name){ const i=name.lastIndexOf('.'); return (i>0? name.slice(0,i): name); }
  function fileExtFromMime(mt){
    if(!mt) return 'webm';
    const base = mt.split('/')[1]||'';
    if(mt.indexOf('audio/mp4')===0) return 'mp4';
    if(mt.indexOf('audio/ogg')===0) return 'ogg';
    if(mt.indexOf('audio/webm')===0) return 'webm';
    return (base.split(';')[0]||'webm');
  }

  function bestMime(){
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|crios|android|edg|opr).)*safari/i.test(ua);
    const prefs = isSafari
      ? [ 'audio/mp4' ]
      : [ 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4' ];
    for (const t of prefs){
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch(_) {}
    }
    return '';
  }

  let recorder=null, chunks=[], mimeType='', recNode=null, recOn=false, waiting=false, waitTimer=null;

  async function waitForAudioReady(){
    status('Waiting for audio…'); updateBtn(true);
    waiting = true;
    let tries = 0;
    return new Promise((resolve, reject) => {
      waitTimer = setInterval(() => {
        tries++;
        if (!window.ac){
          try { window.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(_) {}
        }
        if (window.ac && window.ac.state === 'suspended') window.ac.resume().catch(()=>{});
        const hasGain = !!window.masterGain;
        const hasSong = !!currentRel();
        const hasSignal = (() => {
          try{
            const analyser = window.analyserNode;
            if (!analyser) return false;
            const arr = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(arr);
            return arr.some(v => v !== 128);
          }catch(e){ return false; }
        })();
        if (window.ac && hasGain && (hasSong || hasSignal)){
          clearInterval(waitTimer); waiting = false; updateBtn(false); resolve();
        }
      }, 200);
    });
  }

  async function startRec(){
    if (!window.ac || !window.masterGain || !currentRel()){
      await waitForAudioReady();
    }

    const rel = currentRel(); if(!rel){ alert('Start a song first.'); return; }

    try { if (window.ac.state === 'suspended') await window.ac.resume(); } catch(_) {}

    const dest = window.ac.createMediaStreamDestination();
    window.masterGain.connect(dest);
    recNode = dest;

    mimeType = bestMime() || '';

    try{
      recorder = mimeType ? new MediaRecorder(dest.stream, { mimeType }) : new MediaRecorder(dest.stream);
    }catch(err){
      alert('Recorder not supported on this browser.'); cleanupGraph(); return;
    }

    chunks = [];
    recorder.ondataavailable = (e) => { if(e.data && e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => { console.warn('Recorder error:', e); };

    recorder.onstop = async () => {
      try{
        const blob = new Blob(chunks, { type: mimeType || (recorder.mimeType||'audio/webm') });
        const usedMime = blob.type || mimeType || recorder.mimeType || 'audio/webm';
        const ext = fileExtFromMime(usedMime);
        const relMidi = currentRel();
        const relOut  = relMidi.replace(/^midi\//, '').replace(/\.(mid|midi|kar)$/i, '') + '.' + ext;
        const ok = await uploadToServer(relOut, blob);
        if(ok){ status('Saved: recordings/' + relOut); }
        else { status('Saved locally'); triggerDownload(blob, relOut); }
      }catch(e){
        console.warn(e);
        status('Error – saved locally');
        try{ const blob=new Blob(chunks); triggerDownload(blob, 'recording.webm'); }catch(_){}
      } finally {
        cleanupGraph(); recOn=false; updateBtn();
      }
    };

    try{
      recorder.start(1000);
      recOn=true; status('Recording…'); updateBtn();
    }catch(e){
      cleanupGraph(); recOn=false; status('Recorder error'); alert('Cannot start recorder: '+e.message);
    }
  }

  function cleanupGraph(){ try{ if(recNode){ window.masterGain && window.masterGain.disconnect(recNode); } }catch(e){} recNode=null; recorder=null; chunks=[]; }

  async function stopRec(){
    if (waiting){
      clearInterval(waitTimer); waiting = false;
      status('Cancelled'); updateBtn(false);
      return;
    }
    if(recorder && recOn){ try{ recorder.stop(); }catch(e){} }
  }

  async function uploadToServer(relOut, blob){
    try{
      const fd = new FormData();
      fd.append('rel', relOut);
      fd.append('file', blob, relOut.split('/').pop());
      const res = await fetch('record_upload.php', { method:'POST', body: fd });
      if(!res.ok) return false;
      const j = await res.json().catch(()=>null);
      return !!(j && (j.ok===true || j.path));
    }catch(e){ return false; }
  }

  function triggerDownload(blob, relOut){
    try{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download = relOut.split('/').pop();
      document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }catch(e){}
  }

  function status(t){ const s=$('#recStatus'); if(s) s.textContent=t; }
  function updateBtn(waitingMode){
    const b=$('#recToggle');
    if(b) b.textContent = waitingMode ? 'Cancel' : (recOn ? 'Stop' : 'Start');
  }

  function bindUI(){
    const btn=$('#recToggle');
    if(!btn) return;
    btn.addEventListener('click', ()=>{ (recOn || waiting) ? stopRec() : startRec(); });
  }

  function init(){ if(ensureUI()){ bindUI(); } }

  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
