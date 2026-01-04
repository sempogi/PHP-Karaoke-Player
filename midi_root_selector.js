(() => {
  'use strict';

  const API_UPDATE_CONFIG    = 'update_config.php';
  const PLAYLIST_PARTIAL_URL = 'playlist.php?partial=1';

  // ---------- Utilities ----------
  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  const pickMount = () =>
    document.querySelector('#folderList.toolbar') ||
    document.getElementById('folderList') ||
    document.getElementById('browserPanel') ||
    document.querySelector('.toolbar') ||
    document.body;

  const getClickRoot = () =>
    document.getElementById('browserPanel') ||
    document.getElementById('playlist') ||
    document.body;

  function neutralizeSongLinks(container) {
    container.querySelectorAll('a.song[href="#"]').forEach(a => {
      a.setAttribute('href', '#');
      a.setAttribute('role', 'button');
      a.setAttribute('tabindex', '0');
    });
  }

  // ---------- Delegated clicks ----------
  function bindDelegatedSongClicks() {
    const root = getClickRoot();
    if (!root || root.__songDelegationBound) return;
    root.__songDelegationBound = true;

    function activate(link) {
      const rel = link?.dataset?.path;
      if (!rel) return;
      if (typeof window.queueSong === 'function') {
        window.queueSong(rel);
      } else {
        document.dispatchEvent(new CustomEvent('queueSong', { detail: { path: rel } }));
      }
    }

    root.addEventListener('click', (e) => {
      const link = e.target.closest('a.song');
      if (!link) return;
      e.preventDefault();
      activate(link);
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const link = e.target.closest('a.song');
      if (!link) return;
      e.preventDefault();
      activate(link);
    });
  }

  // ---------- Folder selector ----------
  function initFolderSelector() {
    const mountAt = pickMount();
    if (!mountAt) return;

    const wrap = document.createElement('span');
    wrap.className = 'small';
    wrap.innerHTML = `
      <label for="midi_root_sel">Scan:</label>
      <select id="midi_root_sel"><option>Loading…</option></select>
      <button id="midi_root_apply" style="margin-left:6px;">Apply</button>
      <button id="midi_root_reset" style="margin-left:6px;">Reset</button>
      <button id="midi_root_reload" style="margin-left:6px;">Reload</button>
      <span id="midi_root_msg" class="small" role="status" aria-live="polite" style="margin-left:8px;"></span>
    `;
    mountAt.appendChild(wrap);

    const sel    = wrap.querySelector('#midi_root_sel');
    const apply  = wrap.querySelector('#midi_root_apply');
    const reset  = wrap.querySelector('#midi_root_reset');
    const reload = wrap.querySelector('#midi_root_reload');
    const msg    = wrap.querySelector('#midi_root_msg');

    const showMsg = (text, type = 'info') => {
      msg.textContent = text || '';
      msg.style.color = (type === 'ok' ? '#107c10' : type === 'err' ? '#c50f1f' : 'inherit');
      if (type === 'ok' && text) setTimeout(() => { if (msg.textContent === text) msg.textContent = ''; }, 1500);
    };

    let currentSelection = ''; // '' means base ("midi")

    // Populate dropdown
    fetch(API_UPDATE_CONFIG, { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(({ ok, midi_root, base, subfolders }) => {
        if (!ok) throw new Error('Load failed');

        // Build options
        sel.innerHTML = '';
        sel.add(new Option(`All (${base || 'root'})`, '')); // empty value means "base"
        (Array.isArray(subfolders) ? subfolders : []).forEach(name => sel.add(new Option(name, name)));
        if (!Array.from(sel.options).some(o => o.value === 'midi')) {
          sel.add(new Option('midi', 'midi')); // ensure exists for Reset visual
        }

        // Preselect based on config
        // midi_root is "midi" or "midi/sub"
        if (midi_root === base) {
          sel.value = '';           // base -> All(base)
          currentSelection = '';
        } else {
          const last = midi_root.split('/').pop();
          sel.value = last || '';
          currentSelection = sel.value;
        }
      })
      .catch(err => {
        console.error(err);
        sel.innerHTML = '<option>Error</option>';
        showMsg(`Load error: ${err.message}`, 'err');
      });

    // Refresh playlist (partial)
    function refreshPlaylistPartial() {
      const el = document.getElementById('playlist');
      if (!el) return Promise.resolve();

      const prevHTML = el.innerHTML;
      const prevScroll = el.scrollTop;
      el.innerHTML = `<div class="row"><span class="small">Loading…</span></div>`;

      return fetch(PLAYLIST_PARTIAL_URL, { credentials: 'same-origin', cache: 'no-store' })
        .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(html => {
          if (!html.trim()) throw new Error('Empty HTML');
          el.innerHTML = html;
          neutralizeSongLinks(el);
          el.scrollTop = prevScroll;
          document.dispatchEvent(new CustomEvent('browserListRefreshed'));
          showMsg('Playlist updated', 'ok');
        })
        .catch(err => {
          console.error('Partial refresh failed:', err);
          el.innerHTML = prevHTML;
          showMsg(`Refresh failed: ${err.message}`, 'err');
        });
    }

    // Apply
    apply.addEventListener('click', () => {
      const chosen = sel.value; // '' = base ("midi"), else subfolder name
      if (chosen === currentSelection) { showMsg('No change', 'ok'); return; }

      apply.disabled = true;
      showMsg('Applying…');

      fetch(API_UPDATE_CONFIG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ dir: chosen }) // '' -> base, 'sub' -> midi/sub
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(({ ok, error, midi_root }) => {
          if (!ok) throw new Error(error || 'Unknown error');
          // Update currentSelection to match UI
          if (midi_root && midi_root.includes('/')) {
            currentSelection = midi_root.split('/').pop();
          } else {
            currentSelection = '';
          }
          return refreshPlaylistPartial();
        })
        .catch(err => { console.error(err); showMsg(`Update failed: ${err.message}`, 'err'); })
        .finally(() => { apply.disabled = false; });
    });

    // ✅ Simple Reset -> save "midi"
    reset.addEventListener('click', () => {
      showMsg('Resetting to "midi"…');
      reset.disabled = true;

      fetch(API_UPDATE_CONFIG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        // Either works with the fixed PHP: { dir: '' } or { dir: 'midi' }
        body: JSON.stringify({ dir: 'midi' })
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(({ ok, error }) => {
          if (!ok) throw new Error(error || 'Unknown error');
          sel.value = '';           // UI shows All(base)
          currentSelection = '';
          return refreshPlaylistPartial();
        })
        .then(() => showMsg('Reset done', 'ok'))
        .catch(err => { console.error(err); showMsg(`Reset failed: ${err.message}`, 'err'); })
        .finally(() => { reset.disabled = false; });
    });

    // Reload
    reload.addEventListener('click', () => window.location.reload());
  }

  // ---------- Light search re-index ----------
  function initLightSearchRepair() {
    const inp   = document.getElementById('browserSearch');
    const btnGo = document.getElementById('browserSearchGo');
    const btnX  = document.getElementById('browserSearchClear');
    const cnt   = document.getElementById('browserSearchCount');
    const list  = document.getElementById('playlist');
    if (!inp || !list) return;

    const HIDE_CLS = 'is-hidden';
    if (!document.getElementById('search-hide-style')) {
      const style = document.createElement('style');
      style.id = 'search-hide-style';
      style.textContent = `#playlist .${HIDE_CLS}{display:none !important;}`;
      document.head.appendChild(style);
    }

    if (list.__searchBound) return;
    list.__searchBound = true;

    let index = [];
    function buildIndex() {
      index = Array.from(list.querySelectorAll('.row')).map(row => {
        const a = row.querySelector('a.song');
        const name  = a ? a.textContent : '';
        const title = a ? (a.getAttribute('title') || '') : '';
        const rel   = row.getAttribute('data-path') || '';
        return { row, text: (name + ' ' + title + ' ' + rel).toLowerCase() };
      });
      applyFilter(inp.value);
    }
    function setCount(matched) { if (cnt) cnt.textContent = `${matched}`; }
    function applyFilter(q) {
      const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let matched = 0;
      requestAnimationFrame(() => {
        if (!tokens.length) {
          for (const { row } of index) { row.classList.remove(HIDE_CLS); matched++; }
          setCount(matched);
          return;
        }
        for (const { row, text } of index) {
          const ok = tokens.every(t => text.includes(t));
          if (ok) { row.classList.remove(HIDE_CLS); matched++; }
          else    { row.classList.add(HIDE_CLS); }
        }
        setCount(matched);
      });
    }
    let t = null;
    const debounce = (fn, ms) => (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    const run = () => applyFilter(inp.value);
    inp.addEventListener('input', debounce(run, 250));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    btnGo?.addEventListener('click', run);
    btnX?.addEventListener('click', () => { inp.value = ''; applyFilter(''); inp.focus(); });
    document.addEventListener('browserListRefreshed', buildIndex);
    buildIndex();
  }

  // ---------- Boot ----------
  onReady(() => {
    bindDelegatedSongClicks();
    initFolderSelector();
    initLightSearchRepair();
  });
})();