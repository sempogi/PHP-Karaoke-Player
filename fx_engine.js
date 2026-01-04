/*!
 * fx_engine_full_plus.js — Canvas FX engine (all modes) with enhanced Fireworks
 * API: fxBackground.start(opts), stop(), destroy(), setZ(z), setOpacity(op), setWind(w)
 * Modes: fireworks (enhanced), rain(+thunder), meteor, galaxy(+milky), wetglass, snow, aurora, bubbles, fireflies, caustics
 * Backward compatible with previous fx_engine.js options.
 */
(function(){
  'use strict';
  const TAU = Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const randInt=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
  function hsvToRgb(h,s,v){ h=(h%360+360)%360; const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c; let r=0,g=0,b=0; if(h<60){r=c;g=x;} else if(h<120){r=x;g=c;} else if(h<180){g=c;b=x;} else if(h<240){g=x;b=c;} else if(h<300){r=x;b=c;} else {r=c;b=x;} return [(r+m)*255,(g+m)*255,(b+m)*255]; }

  const defaults = {
    // Global
    mode:'fireworks', brightness:0.95, opacity:0.92, wind:0.06,
    trailAlpha:0.12, bloom:1.9, bloomScale:1.0, gravity:80, auto:true,
    // Perf caps
    maxDpr:1.5, resolutionScale:0.9,

    // ===== Fireworks (enhanced) =====
    fwDensity:0.85, fwHue:[45,0,200,120,220], fwSparkLife:[1.0,1.8], fwSparkSpeed:[160,320], fwBurstCount:[90,140], fwCenterFlash:true,
    fireworksStyles:{ peony:true, chrysanthemum:true, palm:true, crossette:true, strobe:true, crackle:true },
    fwPalmFronds:[5,8], fwPearlCount:[10,24], fwCrackleRate:[18,36], fwCrossetteSeeds:[6,12], fwCrossetteSplit:[0.35,0.7],

    // Rain
    rain:true, rainDensity:0.6, rainSpeed:[900,1200], rainLength:[12,18], rainAlpha:0.65, thunder:false, thunderFreq:[12,24], cloudBandY:0.18,
    // Meteor
    meteorDensity:0.6, meteorSpeed:[900,1400], meteorLen:[60,110], meteorHue:[40,50,200,220],
    // Galaxy
    starDensity:0.7, starHue:[200,45,0,220], starSize:[1.0,2.4], starTwinkle:[0.8,2.0], galaxyMilky:true, galaxyBandAngleDeg:-25, galaxyBandAlpha:0.22, galaxyBandWidth:[160,220], galaxyNebulaCount:6, galaxyNebulaHue:[190,210,280,320,30],
    // Wet Glass
    wetglassDensity:0.6, dropRadius:[2,5], dropSpeedY:[35,80], dropMergeDist:6,
    // Snow (realistic)
    snowDensity:0.6, snowLayers:[0.35,1.0,1.8], snowNearSize:[2.6,4.0], snowFarSize:[1.0,2.0], snowBokehProb:0.08, snowBokehSize:[4.0,8.0], snowTwirl:[0.6,1.6], snowDrift:[-30,30], snowSpeedY:[40,90], snowGustStrength:140, snowGustInterval:[9,16], snowGustDuration:[1.2,2.0],
    // Aurora
    auroraIntensity:0.65, auroraBands:[2,4], auroraSpeed:[6,14], auroraAmp:[24,48], auroraHue:[110,130,140,300,310,320], auroraAlpha:0.35,
    // Bubbles
    bubbleDensity:0.6, bubbleSize:[10,28], bubbleRise:[18,42], bubbleDrift:[-35,35], bubbleWobble:[0.8,1.8], bubbleShineAlpha:0.55, bubbleIridescence:true, bubblePopProb:0.003,
    // Fireflies
    fireflyDensity:0.6, fireflySpeed:[12,28], fireflyBlink:[0.6,1.6], fireflyHueRange:[60,90], fireflyTrail:4,
    // Caustics
    causticsStrength:0.55, causticsScale:0.85, causticsSpeed:[0.06,0.12], causticsHue:[185,200]
  };

  let canvas=null, ctx=null, W=0, H=0, rafId=null, last=0, DPR=1; let onResize=null;
  let params = Object.assign({}, defaults);

  // Pools by mode
  const fwPool=[], rockets=[], emitters=[]; // fireworks
  const rainDrops=[], bolts=[];            // rain+thunder
  const meteors=[];                         // meteor
  const stars=[], auroraBands=[];           // galaxy/aurora
  const glassDrops=[];                      // wet glass
  const snowFlakes=[];                      // snow
  const bubbles=[];                         // bubbles
  const fireflies=[];                       // fireflies
  const causticsObj = { inst:null };

  function ensureCanvas(){ if(canvas) return; canvas=document.createElement('canvas'); canvas.id='fx-bgfx'; Object.assign(canvas.style,{ position:'fixed', inset:'0', zIndex:'1', pointerEvents:'none', opacity:String(params.opacity), filter:`brightness(${params.brightness})`, background:'radial-gradient(1200px 420px at 50% 80%, #0b1020 0%, #05070f 65%, #02040a 100%)' }); document.body.appendChild(canvas); ctx=canvas.getContext('2d'); computeDPR(); resize(); onResize=function(){ computeDPR(); resize(); }; window.addEventListener('resize', onResize); }
  function computeDPR(){ const raw=window.devicePixelRatio||1; DPR=Math.min(raw, params.maxDpr||1); DPR*=params.resolutionScale||1; DPR=Math.max(0.6, Math.min(2, DPR)); }
  function resize(){ W=(window.innerWidth|0); H=(window.innerHeight|0); canvas.width=Math.max(1,Math.floor(W*DPR)); canvas.height=Math.max(1,Math.floor(H*DPR)); canvas.style.width=W+'px'; canvas.style.height=H+'px'; ctx.setTransform(DPR,0,0,DPR,0,0); }
  function fadeScene(){ ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.fillStyle=`rgba(2,3,8,${params.trailAlpha})`; ctx.fillRect(0,0,W,H); ctx.restore(); }
  function glow(x,y,r,rgb,a){ const g=ctx.createRadialGradient(x,y,0,x,y,r); const c0=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a==null?1:a})`; const c1=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`; g.addColorStop(0,c0); g.addColorStop(1,c1); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); }

  // ===== FIREWORKS (enhanced) =====
  class FWSpark{ constructor(x,y,vx,vy,rgb,life,kind){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.rgb=rgb; this.life=life; this.t=0; this.kind=kind||'spark'; this.trail=[]; this.maxTrail=6; this.flick=Math.random()*TAU; }
    update(dt){ this.t+=dt; if(this.t>this.life) return false; const air=this.kind==='crackle'?0.975:0.992; this.vx*=air; this.vy=this.vy*air + params.gravity*dt*(this.kind==='crackle'?0.6:1.0); this.vx += params.wind*6*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.trail.push([this.x,this.y]); if(this.trail.length>this.maxTrail) this.trail.shift(); return true; }
    draw(){ const p=clamp(this.t/this.life,0,1); let a=(1-p)*(1-p); if(this.kind==='crackle') a *= (0.65 + 0.35*Math.abs(Math.sin(this.flick + this.t*18))); ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=1;i<this.trail.length;i++){ const A=this.trail[i-1], B=this.trail[i]; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${0.22*a})`; ctx.lineWidth=1*(i/this.trail.length); ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.stroke(); } glow(this.x,this.y,3.0*params.bloom*params.bloomScale,this.rgb,a); ctx.restore(); }
  }
  class FWStrobePearl{ constructor(x,y,vx,vy,rgb,life,freq,duty,rad){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.rgb=rgb; this.life=life; this.t=0; this.freq=freq; this.duty=duty; this.radius=rad; this.phase=Math.random(); this.trail=[]; this.maxTrail=3; }
    update(dt){ this.t+=dt; if(this.t>this.life) return false; const air=0.988; this.vx*=air; this.vy=this.vy*air + params.gravity*dt*0.9; this.vx += params.wind*4*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.trail.push([this.x,this.y]); if(this.trail.length>this.maxTrail) this.trail.shift(); return true; }
    draw(){ const cycles=(this.t*this.freq + this.phase); const frac = cycles - Math.floor(cycles); if(frac>this.duty) return; const p=this.t/this.life; const alpha=(1-p)*(1-p); ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=1;i<this.trail.length;i++){ const A=this.trail[i-1], B=this.trail[i]; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${0.16*alpha})`; ctx.lineWidth=0.8*(i/this.trail.length); ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.stroke(); } glow(this.x,this.y,this.radius*params.bloom*params.bloomScale,this.rgb,0.95); ctx.restore(); }
  }
  class FWCrossetteSeed{ constructor(x,y,vx,vy,rgb,splitTime){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.rgb=rgb; this.t=0; this.splitTime=splitTime; this.dead=false; this.trail=[]; this.maxTrail=6; }
    update(dt){ if(this.dead) return false; this.t+=dt; const air=0.990; this.vx*=air; this.vy=this.vy*air + params.gravity*dt*0.9; this.vx += params.wind*4*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.trail.push([this.x,this.y]); if(this.trail.length>this.maxTrail) this.trail.shift(); if(this.t>=this.splitTime){ this.split(); this.dead=true; return false; } return true; }
    split(){ const count=4; const baseAng=Math.atan2(this.vy, this.vx); const arms=[0,1,2,3].map(k=> baseAng + k*(Math.PI/2) + rand(-0.22, 0.22)); const spd=rand(120, 200); const life=rand(0.7, 1.2); const rgb=this.rgb; arms.forEach(a=>{ const vx=Math.cos(a)*spd; const vy=Math.sin(a)*spd*0.85 - rand(5,35); fwPool.push(new FWSpark(this.x, this.y, vx, vy, rgb, life, 'spark')); }); }
    draw(){ const p=clamp(this.t/this.splitTime,0,1); const alpha=(1-p)*(1-p); ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=1;i<this.trail.length;i++){ const A=this.trail[i-1], B=this.trail[i]; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${0.22*alpha})`; ctx.lineWidth=1.2*(i/this.trail.length); ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.stroke(); } glow(this.x,this.y,2.6*params.bloom*params.bloomScale,this.rgb,0.95); ctx.restore(); }
  }
  class FWShell{ constructor(x,y,tx,ty){ this.x=x; this.y=y; this.tx=tx; this.ty=ty; this.exploded=false; const ang=Math.atan2(ty-y, tx-x); const speed=rand(520,720); this.vx=Math.cos(ang)*speed; this.vy=Math.sin(ang)*speed; this.t=0; this.smoke=[]; this.done=false; }
    update(dt){ if(this.done) return false; this.t+=dt; this.vx*=0.997; this.vy=this.vy*0.997 + params.gravity*dt*0.15; this.vx += params.wind*5*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.smoke.push([this.x,this.y]); if(this.smoke.length>8) this.smoke.shift(); const near=Math.hypot(this.x-this.tx, this.y-this.ty) < 18; const slowing=this.vy>-30; if(!this.exploded && (near || slowing || this.y< H*0.18)){ explodeAt(this.x, this.y, params); this.exploded=true; this.done=true; return false; } return true; }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=1;i<this.smoke.length;i++){ const A=this.smoke[i-1], B=this.smoke[i]; ctx.strokeStyle='rgba(255,220,150,0.12)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.stroke(); } glow(this.x,this.y,2.2*params.bloom*params.bloomScale,[255,240,190],1.0); ctx.restore(); }
  }
  function hsvPick(palette){ return palette[randInt(0, palette.length-1)]; }
  function fwBurstBase(cx,cy,hue,count,speedRange,lifeRange,trailLen){ const arr=[]; for(let i=0;i<count;i++){ const ang=Math.random()*TAU; const spd=rand(speedRange[0],speedRange[1]); const vx=Math.cos(ang)*spd; const vy=Math.sin(ang)*spd*0.85 - rand(8,42); const life=rand(lifeRange[0],lifeRange[1]); const rgb=hsvToRgb(hue+rand(-10,10),0.9,1.0); const s=new FWSpark(cx,cy,vx,vy,rgb,life,'spark'); s.maxTrail=trailLen; arr.push(s); } return arr; }
  function burstPeony(cx,cy,hue){ const count=randInt(params.fwBurstCount[0],params.fwBurstCount[1]); return fwBurstBase(cx,cy,hue,count,params.fwSparkSpeed,params.fwSparkLife,6); }
  function burstChrysanthemum(cx,cy,hue){ const count=randInt(params.fwBurstCount[0]+20,params.fwBurstCount[1]+40); const speed=[params.fwSparkSpeed[0]*0.9, params.fwSparkSpeed[1]*1.1]; const life=[params.fwSparkLife[0]*1.1, params.fwSparkLife[1]*1.25]; return fwBurstBase(cx,cy,hue,count,speed,life,9); }
  function burstPalm(cx,cy,hue){ const fronds=randInt(params.fwPalmFronds[0],params.fwPalmFronds[1]); const arr=[]; for(let i=0;i<fronds;i++){ const ang=i*(TAU/fronds)+rand(-0.12,0.12); const spd=rand(params.fwSparkSpeed[1]*0.9, params.fwSparkSpeed[1]*1.2); const vx=Math.cos(ang)*spd; const vy=Math.sin(ang)*spd*0.75 - rand(22,68); const life=rand(params.fwSparkLife[0]*1.1, params.fwSparkLife[1]*1.4); const rgb=hsvToRgb(hue+rand(-6,6),0.9,1.0); const s=new FWSpark(cx,cy,vx,vy,rgb,life,'spark'); s.maxTrail=12; arr.push(s); const emberN=randInt(10,16); for(let k=0;k<emberN;k++){ const ea=Math.random()*TAU; const es=rand(38,80); const ex=Math.cos(ea)*es, ey=Math.sin(ea)*es*0.7 + rand(-40,10); const elife=rand(0.38,0.80); const eRGB=hsvToRgb(hue, rand(0.3,0.8), 1.0); const e=new FWSpark(cx,cy,ex,ey,eRGB,elife,'spark'); e.maxTrail=4; arr.push(e); } } return arr; }
  function burstCrossette(cx,cy,hue){ const seeds=randInt(params.fwCrossetteSeeds[0],params.fwCrossetteSeeds[1]); const arr=[]; for(let i=0;i<seeds;i++){ const ang=Math.random()*TAU; const spd=rand(100,200); const vx=Math.cos(ang)*spd; const vy=Math.sin(ang)*spd*0.85 - rand(10,40); const tSplit=rand(params.fwCrossetteSplit[0], params.fwCrossetteSplit[1]); const rgb=hsvToRgb(hue, rand(0.4,0.9), 1.0); const seed=new FWCrossetteSeed(cx,cy,vx,vy,rgb,tSplit); arr.push(seed); } return arr; }
  function burstStrobePearls(cx,cy,hue){ const pearls=randInt(params.fwPearlCount[0], params.fwPearlCount[1]); const arr=[]; for(let i=0;i<pearls;i++){ const ang=Math.random()*TAU; const spd=rand(80,160); const vx=Math.cos(ang)*spd; const vy=Math.sin(ang)*spd*0.85 - rand(5,30); const life=rand(1.0,1.8); const freq=rand(8,14); const duty=rand(0.28,0.42); const rad=rand(2.6,3.6); const rgb=hsvToRgb(hue, 0.3+Math.random()*0.5, 1.0); const pearl=new FWStrobePearl(cx,cy,vx,vy,rgb,life,freq,duty,rad); arr.push(pearl); } return arr; }
  function burstCrackle(cx,cy,hue){ const n=randInt(params.fwCrackleRate[0], params.fwCrackleRate[1]); const arr=[]; for(let i=0;i<n;i++){ const a=Math.random()*TAU; const sp=rand(60,140); const vx=Math.cos(a)*sp; const vy=Math.sin(a)*sp*0.8 - rand(8,36); const life=rand(0.25,0.55); const rgb=hsvToRgb(hue, rand(0.2,0.6), 1.0); const crack=new FWSpark(cx,cy,vx,vy,rgb,life,'crackle'); crack.maxTrail=4; arr.push(crack); } return arr; }
  function pickStyle(flags){ const bag=[]; if(flags.peony) bag.push('peony','peony','chrysanthemum'); if(flags.chrysanthemum) bag.push('chrysanthemum'); if(flags.palm) bag.push('palm'); if(flags.crossette) bag.push('crossette'); if(flags.strobe) bag.push('strobe'); if(flags.crackle) bag.push('crackle'); return bag[randInt(0, bag.length-1)] || 'peony'; }
  function explodeAt(cx,cy,p){ const hue=hsvPick(p.fwHue||defaults.fwHue); const style=pickStyle(p.fireworksStyles||defaults.fireworksStyles); let arr=[]; switch(style){ case 'palm': arr=burstPalm(cx,cy,hue); break; case 'crossette': arr=burstCrossette(cx,cy,hue); break; case 'strobe': arr=burstStrobePearls(cx,cy,hue); break; case 'crackle': arr=burstCrackle(cx,cy,hue); break; case 'chrysanthemum': arr=burstChrysanthemum(cx,cy,hue); break; case 'peony': default: arr=burstPeony(cx,cy,hue); } if(p.fwCenterFlash){ fwPool.push(new FWSpark(cx,cy,0,0,hsvToRgb(50,1,1),0.35,'flash')); } for(const s of arr) fwPool.push(s); }
  function spawnFireworks(dt){ if(!params.auto) return; const density = (params.fwDensity==null?0.65:params.fwDensity); const p = Math.max(0.004, 0.014 * density); if(Math.random()<p){ const x0=rand(W*0.2,W*0.8), y0=H*0.92; const tx=rand(W*0.25,W*0.75), ty=rand(H*0.22,H*0.45); rockets.push(new FWShell(x0,y0,tx,ty)); } }

  // ===== RAIN + THUNDER =====
  class RainDrop{ constructor(x,y,vx,vy,len){ this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.len=len; }
    update(dt){ this.vx=this.vx*0.995 + params.wind*250*dt; this.vy=this.vy*0.998 + params.gravity*2.2*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; return (this.x>-50 && this.x<W+50 && this.y<H+50); }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=`rgba(180,190,255,${params.rainAlpha})`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(this.x - this.vx*0.012, this.y - this.vy*0.012 - this.len); ctx.lineTo(this.x, this.y); ctx.stroke(); ctx.restore(); }
  }
  class LightningBolt{ constructor(x0,y0,y1,rgb){ this.a={x:x0,y:y0}; this.b={x:x0+rand(-40,40),y:y1}; this.rgb=rgb; this.t=0; this.life=0.14; }
    update(dt){ this.t+=dt; return this.t<=this.life; }
    draw(){ const a=(1 - this.t/this.life)*0.9; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${a})`; ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(this.a.x, this.a.y); ctx.lineTo(this.b.x, this.b.y); ctx.stroke(); ctx.restore(); ctx.save(); ctx.globalCompositeOperation='screen'; ctx.fillStyle=`rgba(255,255,255,${a*0.2})`; ctx.fillRect(0,0,W,H); ctx.restore(); }
  }
  function spawnRain(dt){ const base=(W/320)*params.rainDensity; const n=Math.floor(base*dt*60); for(let i=0;i<n;i++){ const x=rand(-40,W+40), y=rand(-40,H*params.cloudBandY); const spd=rand(params.rainSpeed[0],params.rainSpeed[1]); const vx=params.wind*180+rand(-30,30), vy=spd; const len=rand(params.rainLength[0],params.rainLength[1]); rainDrops.push(new RainDrop(x,y,vx,vy,len)); } }
  function spawnLightning(){ const chance=1 / rand(params.thunderFreq[0], params.thunderFreq[1]); if(Math.random()<chance){ const x=rand(W*0.15,W*0.85), y0=H*params.cloudBandY, y1=rand(H*0.55,H*0.92); const rgb=hsvToRgb(210,0.18,1.0); bolts.push(new LightningBolt(x,y0,y1,rgb)); } }

  // ===== METEOR =====
  class Meteor{ constructor(x,y,vx,vy,len,rgb){ this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.len=len;this.rgb=rgb; }
    update(dt){ this.vx=this.vx*0.996 + params.wind*180*dt; this.vy=this.vy*0.996 + params.gravity*0.3*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; return (this.x>-120 && this.y>-120 && this.x<W+120 && this.y<H+120); }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},0.9)`; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(this.x - this.vx*0.02, this.y - this.vy*0.02 - this.len); ctx.lineTo(this.x, this.y); ctx.stroke(); glow(this.x,this.y,10*params.bloom*params.bloomScale,this.rgb,0.6); ctx.restore(); }
  }
  function spawnMeteors(dt){ const base=(W/480)*params.meteorDensity; const n=Math.floor(base*dt*60); for(let i=0;i<n;i++){ const side=Math.random()<0.7?'right':'top'; const x= side==='right' ? rand(W*0.5,W+120) : rand(-40,W+40); const y= side==='right' ? rand(-40,H*0.4) : rand(-60,H*0.15); const spd=rand(params.meteorSpeed[0],params.meteorSpeed[1]); const ang=rand(Math.PI*0.55,Math.PI*0.85); const vx=Math.cos(ang)*spd, vy=Math.sin(ang)*spd; const len=rand(params.meteorLen[0],params.meteorLen[1]); const hue=params.meteorHue[randInt(0,params.meteorHue.length-1)]; const rgb=hsvToRgb(hue,0.8,1.0); meteors.push(new Meteor(x,y,vx,vy,len,rgb)); } }

  // ===== GALAXY & MILKY WAY =====
  class Star{ constructor(x,y,rad,rgb,tw){ this.x=x;this.y=y;this.rad=rad;this.rgb=rgb;this.tw=tw; this.phase=Math.random()*TAU; }
    update(dt){ this.phase += this.tw*dt; return true; }
    draw(){ const a=0.35 + 0.65*(0.5+0.5*Math.sin(this.phase)); glow(this.x,this.y,this.rad*6*params.bloom*params.bloomScale,this.rgb,a); }
  }
  function ensureStars(){ const target=Math.floor((W*H)/12000 * params.starDensity); if(stars.length>=target) return; for(let i=stars.length;i<target;i++){ const x=Math.random()*W, y=Math.random()*H; const rPick=Math.random(); const rad=rPick<0.80?rand(0.8,1.6): rPick<0.95?rand(1.6,2.6): rand(2.6,3.8); const huePalette=params.starHue||[0,20,35,45,180,200,220,280]; const hue=huePalette[randInt(0,huePalette.length-1)]; const sat=rPick<0.9?rand(0.1,0.35):rand(0.35,0.55); const rgb=hsvToRgb(hue,sat,1.0); const tw=rand(params.starTwinkle[0], params.starTwinkle[1]); stars.push(new Star(x,y,rad,rgb,tw)); } }
  function drawMilkyWayBand(){ if(!params.galaxyMilky) return; const angle=(params.galaxyBandAngleDeg||-25)*(Math.PI/180); const bandW=rand(params.galaxyBandWidth[0], params.galaxyBandWidth[1]); const alpha=params.galaxyBandAlpha||0.22; ctx.save(); ctx.globalCompositeOperation='screen'; ctx.translate(W/2,H/2); ctx.rotate(angle); const grad=ctx.createLinearGradient(0,-bandW,0,bandW); grad.addColorStop(0.0,`rgba(255,255,255,${alpha*0.02})`); grad.addColorStop(0.5,`rgba(220,220,255,${alpha})`); grad.addColorStop(1.0,`rgba(255,255,255,${alpha*0.02})`); ctx.fillStyle=grad; ctx.fillRect(-W,-bandW,W*2,bandW*2); const n=params.galaxyNebulaCount||6; for(let i=0;i<n;i++){ const nx=rand(-W*0.9,W*0.9); const ny=rand(-bandW*0.8, bandW*0.8); const size=rand(36,72); const hue=params.galaxyNebulaHue[randInt(0,params.galaxyNebulaHue.length-1)]; const rgb=hsvToRgb(hue,rand(0.25,0.6),1.0); glow(nx,ny,size,rgb,alpha*0.35); } ctx.restore(); }

  // ===== WET GLASS =====
  class GlassDrop{ constructor(x,y,r){ this.x=x;this.y=y;this.r=r; this.vx=params.wind*20+rand(-8,8); this.vy=rand(params.dropSpeedY[0],params.dropSpeedY[1]); }
    update(dt){ this.vx=this.vx*0.98 + params.wind*30*dt; this.vy=this.vy*0.98 + params.gravity*1.8*dt*0.05; this.x+=this.vx*dt; this.y+=this.vy*dt; if(this.y>H*0.98){ this.vx*=0.9; this.vy*=0.4; } for(let i=glassDrops.length-1;i>=0;i--){ const d=glassDrops[i]; if(d===this) continue; const dx=d.x-this.x, dy=d.y-this.y; const dist=Math.hypot(dx,dy); if(dist < params.dropMergeDist + Math.min(this.r, d.r)){ const area=Math.PI*this.r*this.r + Math.PI*d.r*d.r; this.r=Math.sqrt(area/Math.PI); this.x=(this.x+d.x)/2; this.y=(this.y+d.y)/2; glassDrops.splice(i,1); } } return (this.y < H+80); }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; const g=ctx.createRadialGradient(this.x-this.r*0.4,this.y-this.r*0.4,this.r*0.1,this.x,this.y,this.r); g.addColorStop(0,'rgba(255,255,255,0.45)'); g.addColorStop(0.5,'rgba(200,220,255,0.28)'); g.addColorStop(1,'rgba(120,150,200,0.10)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,TAU); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=0.6; ctx.beginPath(); ctx.arc(this.x - this.r*0.35, this.y - this.r*0.35, this.r*0.55, Math.PI*1.2, Math.PI*1.65); ctx.stroke(); ctx.restore(); }
  }
  function spawnWetGlass(dt){ const base=(W/360)*params.wetglassDensity; const n=Math.floor(base*dt*60); for(let i=0;i<n;i++){ const x=rand(-10,W+10), y=rand(-20,H*0.2); const r=rand(params.dropRadius[0],params.dropRadius[1]); glassDrops.push(new GlassDrop(x,y,r)); } }

  // ===== BUBBLES =====
  class Bubble{ constructor(x,y,r,vy,wob,drift){ this.x=x; this.y=y; this.r=r; this.vy=vy; this.wob=wob; this.phase=Math.random()*TAU; this.drift=drift; this.vx=params.wind*30 + drift; this.hueBase=rand(180,300); }
    update(dt){ this.phase += this.wob*dt; const wobX = Math.sin(this.phase)*4; this.x += (this.vx*dt) + wobX*dt; this.y -= this.vy*dt; if(this.y < -20 || (this.y < 10 && Math.random() < params.bubblePopProb)) return false; return (this.x > -60 && this.x < W+60); }
    draw(){ ctx.save(); ctx.globalCompositeOperation='screen'; const rim = ctx.createRadialGradient(this.x-this.r*0.6, this.y-this.r*0.6, this.r*0.2, this.x, this.y, this.r); rim.addColorStop(0,'rgba(255,255,255,0.10)'); rim.addColorStop(0.6,'rgba(255,255,255,0.20)'); rim.addColorStop(1,'rgba(255,255,255,0.05)'); ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill(); ctx.strokeStyle = `rgba(255,255,255,${params.bubbleShineAlpha})`; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(this.x - this.r*0.35, this.y - this.r*0.35, this.r*0.65, Math.PI*1.0, Math.PI*1.45); ctx.stroke(); if(params.bubbleIridescence){ const hue = this.hueBase + Math.sin(this.phase*0.7)*20; const rgb = hsvToRgb(hue, 0.35, 1.0); glow(this.x + this.r*0.25, this.y + this.r*0.15, this.r*0.8*params.bloom*params.bloomScale, rgb, 0.25); } ctx.restore(); }
  }
  function ensureBubbles(){ const target = Math.floor((W*H)/26000 * params.bubbleDensity); if (bubbles.length >= target) return; for(let i=bubbles.length;i<target;i++){ const x = rand(-20, W+20); const y = rand(H*0.65, H+40); const r = rand(params.bubbleSize[0], params.bubbleSize[1]); const vy = rand(params.bubbleRise[0], params.bubbleRise[1]); const wob = rand(params.bubbleWobble[0], params.bubbleWobble[1]); const drift = rand(params.bubbleDrift[0], params.bubbleDrift[1]); bubbles.push(new Bubble(x,y,r,vy,wob,drift)); } }

  // ===== SNOW (realistic) =====
  class SnowFlake{ constructor(layer, x, y, r, spdY, tw){ this.layer=layer; this.x=x; this.y=y; this.r=r; this.spdY=spdY; this.tw=tw; this.phase=Math.random()*TAU; this.vx=params.wind*40 + rand(params.snowDrift[0], params.snowDrift[1]); this.rotate=rand(-0.3,0.3); this.isBokeh=(layer===0)&&(Math.random()<params.snowBokehProb); }
    update(dt, gustVX){ this.phase+=this.tw*dt; const sway=Math.sin(this.phase)*(this.layer===2?6:this.layer===1?9:12); const extraVX=(gustVX||0)*(this.layer===0?1.0:this.layer===1?0.6:0.3); this.x+=(this.vx*dt)+sway*dt+extraVX*dt; this.y+=this.spdY*dt; this.rotate+=(this.layer===0?0.02:0.01) * dt; if(this.y>H+30){ this.y=rand(-40,-10); this.x=rand(-20,W+20); this.vx=params.wind*40 + rand(params.snowDrift[0], params.snowDrift[1]); this.isBokeh=(this.layer===0)&&(Math.random()<params.snowBokehProb); } return (this.x>-60 && this.x<W+60); }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; if(this.isBokeh){ glow(this.x,this.y,rand(params.snowBokehSize[0], params.snowBokehSize[1])*params.bloom*params.bloomScale,[255,255,255],0.35); } else { const alpha=this.layer===2?0.45:this.layer===1?0.6:0.8; if(this.layer<=1){ ctx.translate(this.x,this.y); ctx.rotate(this.rotate); ctx.strokeStyle=`rgba(255,255,255,${alpha})`; ctx.lineWidth=this.layer===0?1.2:0.9; ctx.beginPath(); ctx.moveTo(0,-this.r*1.8); ctx.lineTo(0,this.r*1.8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-this.r*1.4,0); ctx.lineTo(this.r*1.4,0); ctx.stroke(); glow(this.x,this.y,this.r*3*params.bloom*params.bloomScale,[255,255,255],0.5); } else { ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.beginPath(); ctx.arc(this.x,this.y,this.r*0.8,0,TAU); ctx.fill(); glow(this.x,this.y,this.r*2.5*params.bloom*params.bloomScale,[255,255,255],0.4); } } ctx.restore(); }
  }
  let _snowGust={next:0,t:0,dur:0,vx:0,active:false};
  function updateSnowGust(dt){ if(_snowGust.next<=0){ _snowGust.next=rand(params.snowGustInterval[0], params.snowGustInterval[1]); } _snowGust.next-=dt; if(_snowGust.next<=0 && !_snowGust.active){ _snowGust.active=true; _snowGust.t=0; _snowGust.dur=rand(params.snowGustDuration[0], params.snowGustDuration[1]); _snowGust.vx=rand(-params.snowGustStrength, params.snowGustStrength); } if(_snowGust.active){ _snowGust.t+=dt; if(_snowGust.t>_snowGust.dur){ _snowGust.active=false; _snowGust.vx=0; _snowGust.next=rand(params.snowGustInterval[0], params.snowGustInterval[1]); } } return _snowGust.vx; }
  function ensureSnow(){ const targetBase=Math.floor((W*H)/22000 * params.snowDensity); const weights=params.snowLayers; const target=[Math.floor(targetBase*weights[0]), Math.floor(targetBase*weights[1]), Math.floor(targetBase*weights[2])]; const layerCounts=[0,0,0]; for(let i=0;i<snowFlakes.length;i++) layerCounts[snowFlakes[i].layer]++; for(let L=0; L<3; L++){ while(layerCounts[L] < target[L]){ const x=rand(-20,W+20), y=rand(-40,H+20); const r=(L===0?rand(params.snowNearSize[0], params.snowNearSize[1]):rand(params.snowFarSize[0], params.snowFarSize[1])); const spdY=rand(params.snowSpeedY[0], params.snowSpeedY[1])*params.snowLayers[L]; const tw=rand(params.snowTwirl[0], params.snowTwirl[1]); snowFlakes.push(new SnowFlake(L,x,y,r,spdY,tw)); layerCounts[L]++; } } }

  // ===== AURORA =====
  class AuroraBand{ constructor(hue, alpha){ this.hue=hue; this.rgb=hsvToRgb(hue, 0.6, 1.0); this.alpha=alpha; this.phase=Math.random()*TAU; this.speed=rand(params.auroraSpeed[0], params.auroraSpeed[1]); this.amp=rand(params.auroraAmp[0], params.auroraAmp[1]); this.yBase = rand(H*0.15, H*0.5); this.freq = rand(0.008, 0.016); }
    update(dt){ this.phase += this.speed*dt*0.2; return true; }
    draw(){ const rgb=this.rgb; const a=this.alpha; ctx.save(); ctx.globalCompositeOperation='screen'; ctx.beginPath(); const step=Math.max(12, W/40); for(let x=0;x<=W;x+=step){ const y=this.yBase + Math.sin(this.phase + x*this.freq)*this.amp; if(x===0) ctx.moveTo(x,y-10); else ctx.lineTo(x,y-10);} for(let x=W;x>=0;x-=step){ const y=this.yBase + Math.sin(this.phase + x*this.freq)*this.amp; ctx.lineTo(x,y+10);} ctx.closePath(); const grad=ctx.createLinearGradient(0, this.yBase - this.amp - 40, 0, this.yBase + this.amp + 40); grad.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a*0.05})`); grad.addColorStop(0.5,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`); grad.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a*0.05})`); ctx.fillStyle=grad; ctx.fill(); ctx.restore(); }
  }

  // ===== FIREFLIES =====
  class Firefly{ constructor(x,y,spd,blink,hue){ this.x=x; this.y=y; this.spd=spd; this.blink=blink; this.hue=hue; this.rgb=hsvToRgb(hue,0.9,1.0); this.phase=Math.random()*TAU; this.trail=[]; this.maxTrail=params.fireflyTrail; }
    update(dt){ this.phase += this.blink*dt; const a = 0.45 + 0.55*(0.5+0.5*Math.sin(this.phase)); const angle = Math.sin(this.phase*0.5)*0.6; const vx = Math.cos(angle)*this.spd + params.wind*20; const vy = Math.sin(angle)*this.spd*0.25; this.x += vx*dt; this.y += vy*dt; if(this.x < -20) this.x = W+20; if(this.x > W+20) this.x = -20; if(this.y < -20) this.y = H+20; if(this.y > H+20) this.y = -20; this.trail.push([this.x,this.y,a]); if(this.trail.length>this.maxTrail) this.trail.shift(); return true; }
    draw(){ ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=1;i<this.trail.length;i++){ const A=this.trail[i-1], B=this.trail[i]; const tAlpha = A[2]* (i/this.trail.length) * 0.25; ctx.strokeStyle=`rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${tAlpha})`; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.stroke(); } const last=this.trail[this.trail.length-1]; const a = last? last[2]: 0.8; glow(this.x,this.y,6*params.bloom*params.bloomScale,this.rgb,a); ctx.restore(); }
  }
  function ensureFireflies(){ const target = Math.floor((W*H)/38000 * params.fireflyDensity); if(fireflies.length>=target) return; for(let i=fireflies.length;i<target;i++){ const x=rand(0,W), y=rand(0,H); const spd=rand(params.fireflySpeed[0], params.fireflySpeed[1]); const blink=rand(params.fireflyBlink[0], params.fireflyBlink[1]); const hue=rand(params.fireflyHueRange[0], params.fireflyHueRange[1]); fireflies.push(new Firefly(x,y,spd,blink,hue)); } }

  // ===== CAUSTICS =====
  class Caustics{ constructor(){ this.phaseX = Math.random()*TAU; this.phaseY = Math.random()*TAU; this.speedX = rand(params.causticsSpeed[0], params.causticsSpeed[1]); this.speedY = rand(params.causticsSpeed[0], params.causticsSpeed[1]); this.scale = params.causticsScale; this.hue = rand(params.causticsHue[0], params.causticsHue[1]); this.rgb = hsvToRgb(this.hue, 0.35, 1.0); }
    update(dt){ this.phaseX += this.speedX*dt; this.phaseY += this.speedY*dt; return true; }
    draw(){ ctx.save(); ctx.globalCompositeOperation='screen'; const alpha = clamp(params.causticsStrength, 0.1, 1.0) * 0.6; const step = Math.max(16, Math.floor(W/40)); for(let band=0; band<3; band++){ ctx.beginPath(); for(let x=0; x<=W; x+=step){ const sx = (x/W)*TAU*1.5*this.scale + this.phaseX + band*0.4; const y = H*0.35 + Math.sin(sx)*28 + Math.sin(sx*0.6 + this.phaseY)*18 + band*26; if(x===0) ctx.moveTo(x, y-8); else ctx.lineTo(x, y-8); } for(let x=W; x>=0; x-=step){ const sx = (x/W)*TAU*1.5*this.scale + this.phaseX + band*0.4; const y = H*0.35 + Math.sin(sx)*28 + Math.sin(sx*0.6 + this.phaseY)*18 + band*26; ctx.lineTo(x, y+8); } ctx.closePath(); const grad = ctx.createLinearGradient(0, H*0.25, 0, H*0.55); grad.addColorStop(0, `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${alpha*0.10})`); grad.addColorStop(0.5, `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${alpha})`); grad.addColorStop(1, `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${alpha*0.10})`); ctx.fillStyle = grad; ctx.fill(); } ctx.restore(); }
  }

  // ===== Spawners by mode =====
  function ensureStarsAndMilky(){ ensureStars(); drawMilkyWayBand(); }

  // ===== Main Loop =====
  let fpsAvg=60, fpsT=0;
  function loop(ts){ if(!last) last=ts; const dt=Math.min(0.033,(ts-last)/1000); last=ts; fadeScene();
    switch(params.mode){
      case 'fireworks': spawnFireworks(dt); break;
      case 'rain': if(params.rain) spawnRain(dt); if(params.thunder) spawnLightning(); break;
      case 'meteor': spawnMeteors(dt); break;
      case 'galaxy': ensureStarsAndMilky(); break;
      case 'wetglass': spawnWetGlass(dt); break;
      case 'snow': ensureSnow(); break;
      case 'aurora': break; // bands handled below
      case 'bubbles': ensureBubbles(); break;
      case 'fireflies': ensureFireflies(); break;
      case 'caustics': if(!causticsObj.inst) causticsObj.inst = new Caustics(); break;
    }

    // Background-ish first
    for(let i=stars.length-1;i>=0;i--){ const s=stars[i]; if(!s.update(dt)) stars.splice(i,1); else s.draw(); }

    // Fireflies
    for(let i=fireflies.length-1;i>=0;i--){ const f=fireflies[i]; if(!f.update(dt)) fireflies.splice(i,1); else f.draw(); }

    // Bubbles
    for(let i=bubbles.length-1;i>=0;i--){ const b=bubbles[i]; if(!b.update(dt)) bubbles.splice(i,1); else b.draw(); }

    // Snow (with gust)
    const gustVX = updateSnowGust(dt);
    for(let i=snowFlakes.length-1;i>=0;i--){ const f=snowFlakes[i]; if(!f.update(dt, gustVX)) snowFlakes.splice(i,1); else f.draw(); }

    // Rain
    for(let i=rainDrops.length-1;i>=0;i--){ const d=rainDrops[i]; if(!d.update(dt)) rainDrops.splice(i,1); else d.draw(); }

    // Meteors
    for(let i=meteors.length-1;i>=0;i--){ const m=meteors[i]; if(!m.update(dt)) meteors.splice(i,1); else m.draw(); }

    // Wet glass
    for(let i=glassDrops.length-1;i>=0;i--){ const g=glassDrops[i]; if(!g.update(dt)) glassDrops.splice(i,1); else g.draw(); }

    // Fireworks
    for(let i=rockets.length-1;i>=0;i--){ const r=rockets[i]; if(!r.update(dt)) rockets.splice(i,1); else r.draw(); }
    for(let i=emitters.length-1;i>=0;i--){ const e=emitters[i]; if(!e.update?.(dt)) emitters.splice(i,1); else e.draw?.(ctx); }
    for(let i=fwPool.length-1;i>=0;i--){ const s=fwPool[i]; if(!s.update(dt)) fwPool.splice(i,1); else s.draw(); }

    // Aurora bands overlay
    if(params.mode==='aurora' && auroraBands.length===0){ const base=randInt(params.auroraBands[0], params.auroraBands[1]); for(let i=0;i<base;i++){ const hue=params.auroraHue[randInt(0,params.auroraHue.length-1)]; const alpha=params.auroraAlpha*(0.4+0.9*params.auroraIntensity); auroraBands.push(new AuroraBand(hue, alpha)); } }
    for(let i=auroraBands.length-1;i>=0;i--){ const a=auroraBands[i]; if(!a.update(dt)) auroraBands.splice(i,1); else a.draw(); }

    // Caustics overlay
    if(params.mode==='caustics'){ if(causticsObj.inst){ if(causticsObj.inst.update(dt)) causticsObj.inst.draw(); } }

    // Adaptive density (only affects fireworks)
    fpsT+=dt; fpsAvg = fpsAvg*0.95 + (1/dt)*0.05; if(fpsT>1.0){ fpsT=0; if(fpsAvg<48 && params.mode==='fireworks') params.fwDensity=Math.max(0.4,(params.fwDensity||0.65)*0.90); else if(fpsAvg>58 && params.mode==='fireworks') params.fwDensity=Math.min(1.0,(params.fwDensity||0.65)*1.05); }

    rafId = requestAnimationFrame(loop);
  }

  function setSkyByMode(){ const storm = (params.mode==='rain' || params.mode==='wetglass' || params.mode==='galaxy' || params.mode==='aurora' || params.mode==='snow'); canvas.style.background = storm ? 'radial-gradient(1200px 420px at 50% 80%, #070a14 0%, #04060b 65%, #010307 100%)' : 'radial-gradient(1200px 420px at 50% 80%, #0b1020 0%, #05070f 65%, #02040a 100%)'; }

  function start(opts){ params = Object.assign({}, defaults, (opts||{})); ensureCanvas(); canvas.style.display='block'; canvas.style.opacity=String(params.opacity); canvas.style.filter=`brightness(${params.brightness})`; stop(); last=0; setSkyByMode(); rafId = requestAnimationFrame(loop); }
  function stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=null; } if(ctx){ ctx.clearRect(0,0,W,H); } fwPool.length=0; rockets.length=0; emitters.length=0; rainDrops.length=0; bolts.length=0; meteors.length=0; stars.length=0; glassDrops.length=0; snowFlakes.length=0; auroraBands.length=0; bubbles.length=0; fireflies.length=0; causticsObj.inst=null; }
  function destroy(){ try{ stop(); }catch{} try{ if(onResize) window.removeEventListener('resize', onResize); }catch{} if(canvas && canvas.parentNode){ canvas.parentNode.removeChild(canvas); } canvas=null; ctx=null; }
  function setZ(z){ if(canvas) canvas.style.zIndex=String(z); }
  function setOpacity(op){ if(canvas) canvas.style.opacity=String(op); }
  function setWind(w){ params.wind = Number(w)||0; }

  window.fxBackground = { start, stop, destroy, setZ, setOpacity, setWind };
})();
