
(function(){
  if (window.__SM_PANEL_CENTERED__) return; window.__SM_PANEL_CENTERED__ = true;

  function centerPanel(){
    var p = document.getElementById('smPanel');
    if (!p) return;
    p.style.position = 'fixed';
    p.style.left = '50%';
    p.style.top = '50%';
    p.style.transform = 'translate(-50%, -50%)';
    p.style.zIndex = '99999';
    p.style.maxWidth = '94vw';
    p.style.maxHeight = '90vh';
    p.style.overflow = 'auto';
  }

  function applyCenter(){
    centerPanel();
  }

  if (document.readyState !== 'loading') applyCenter();
  else document.addEventListener('DOMContentLoaded', applyCenter, { once: true });

  window.addEventListener('resize', applyCenter);
  window.addEventListener('orientationchange', applyCenter);
})();
