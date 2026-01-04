/*!
 * fx_presets_config.js — Optional presets for fx_engine_full_plus.js
 * Purpose: Provide simple, file-based presets without localStorage or a panel.
 * Usage: Include after fx_engine_full_plus.js, then call applyFxPreset('preset_name').
 */
(function(){
  'use strict';
  // --- Helper: device & reduced motion ---
  function isMobile(){
    const ua = navigator.userAgent||'';
    const mobileHint = /(Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini)/i.test(ua);
    const smallScreen = Math.min(window.screen.width, window.screen.height) <= 768;
    return mobileHint || smallScreen;
  }
  function prefersReducedMotion(){
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){ return false; }
  }

  // --- Presets ---
  const FX_PRESETS = {
    // Rain with Thunder OFF by default
    'rain_default': {
      mode: 'rain',
      rain: true,
      thunder: false,
      rainDensity: 0.65,
      wind: -0.02,
      brightness: 0.95,
      opacity: 0.92
    },

    // Fireworks on mobile at fwDensity=0.80 (styles default ON)
    'fireworks_mobile': {
      mode: 'fireworks',
      fwDensity: 0.80,
      wind: 0.06,
      brightness: 0.95,
      opacity: 0.92,
      // optional: you can tailor styles here — keeping defaults ON
      // fireworksStyles: { peony:true, chrysanthemum:true, palm:true, crossette:true, strobe:true, crackle:true }
    },

    // Desktop Fireworks baseline
    'fireworks_desktop': {
      mode: 'fireworks',
      fwDensity: 0.85,
      wind: 0.06,
      brightness: 0.95,
      opacity: 0.92
    },

    // Quiet ambient fallback for reduced motion
    'galaxy_quiet': {
      mode: 'galaxy',
      starDensity: 0.40,
      wind: 0.00,
      brightness: 1.00,
      opacity: 0.95
    }
  };

  // --- Router for a single intensity slider (optional) ---
  function withIntensity(preset, level){
    const p = Object.assign({}, preset);
    const m = p.mode;
    if (typeof level === 'number') {
      p.fwDensity        = m==='fireworks' ? level : p.fwDensity;
      p.rainDensity      = m==='rain'      ? level : p.rainDensity;
      p.meteorDensity    = m==='meteor'    ? level : p.meteorDensity;
      p.starDensity      = m==='galaxy'    ? level : p.starDensity;
      p.wetglassDensity  = m==='wetglass'  ? level : p.wetglassDensity;
      p.snowDensity      = m==='snow'      ? level : p.snowDensity;
      p.auroraIntensity  = m==='aurora'    ? level : p.auroraIntensity;
      p.bubbleDensity    = m==='bubbles'   ? level : p.bubbleDensity;
      p.fireflyDensity   = m==='fireflies' ? level : p.fireflyDensity;
      p.causticsStrength = m==='caustics'  ? level : p.causticsStrength;
    }
    return p;
  }

  // --- Apply preset ---
  function applyFxPreset(name, overrides, level){
    if (!window.fxBackground) {
      console.error('fxBackground engine not loaded');
      return false;
    }
    const p = FX_PRESETS[name];
    if (!p) {
      console.error('Unknown preset:', name);
      return false;
    }
    const merged = Object.assign({}, withIntensity(p, level), overrides||{});
    window.fxBackground.start(merged);
    window.fxBackground.setZ(1);
    return true;
  }

  // --- Auto preset chooser (optional) ---
  function applyAutoPreset(){
    if (prefersReducedMotion()) {
      return applyFxPreset('galaxy_quiet');
    }
    if (isMobile()) {
      return applyFxPreset('fireworks_mobile');
    }
    // default desktop choice
    return applyFxPreset('fireworks_desktop');
  }

  // Expose helpers
  window.FXPresets = {
    apply: applyFxPreset,
    auto: applyAutoPreset,
    presets: FX_PRESETS,
    isMobile,
    prefersReducedMotion
  };
})();
