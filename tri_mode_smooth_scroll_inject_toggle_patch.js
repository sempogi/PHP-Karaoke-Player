
(function(){
    const KEY = 'triSmoothScroll';
    let enabled = (localStorage.getItem(KEY) || 'on') === 'on';

    function injectToggle(){
        const ccPanel = document.getElementById('ccPanel');
        if(!ccPanel) return;
        const list = ccPanel.querySelector('.list');
        if(!list) return;

        // Avoid duplicate injection
        if(document.getElementById('ccTriScrollRow')) return;

        const row = document.createElement('div');
        row.className = 'row';
        row.id = 'ccTriScrollRow';

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = 'Tri Scroll';

        const wrap = document.createElement('label');
        wrap.className = 'small';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'ccTriScroll';
        cb.checked = enabled;

        cb.addEventListener('change', function(){
            enabled = cb.checked;
            localStorage.setItem(KEY, enabled ? 'on' : 'off');
        });

        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode(' Smooth scroll in Tri Mode'));

        row.appendChild(label);
        row.appendChild(wrap);
        list.appendChild(row);
    }

    document.addEventListener('DOMContentLoaded', injectToggle);

    const origRepaint = window.repaintLyricsTri;
    if (typeof origRepaint === 'function') {
        window.repaintLyricsTri = function(now){
            origRepaint(now);
            try {
                if (window.lyrMode === 'tri' && enabled) {
                    const container = document.getElementById('lyBody');
                    const current = document.getElementById('lyAct');
                    const next = document.getElementById('lyNext');
                    if (container && current) {
                        const target = next && next.textContent.trim() ? next : current;
                        container.scrollTo({
                            top: target.offsetTop - container.clientHeight / 3,
                            behavior: 'smooth'
                        });
                    }
                }
            } catch(e) { console.warn('Tri Mode scroll failed', e); }
        };
    }
})();
