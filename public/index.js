/* ── PYSIUM index.js ── */

// ─── CONFIG ───────────────────────────────────────────────────────────
const CLOAK_DEFAULTS = { title: 'Google Drive', favicon: 'https://drive.google.com/favicon.ico' };
let SEARCH_ENGINE = 'https://www.google.com/search?q=%s';
let PANIC_URL     = localStorage.getItem('pysium_panic') || 'https://classroom.google.com';

// ─── STATE ────────────────────────────────────────────────────────────
let tabs        = [];
let activeTabId = null;
let cloakEnabled = true;
let scramjet    = null;
let sjFrame     = null;

// ─── SCRAMJET INIT ────────────────────────────────────────────────────
async function initScramjet() {
  try {
    scramjet = new ScramjetController({
      prefix: '/scram/',
      files: {
        wasm:   '/scram/scramjet.wasm.wasm',
        worker: '/scram/scramjet.worker.js',
        client: '/scram/scramjet.client.js',
        shared: '/scram/scramjet.shared.js',
        sync:   '/scram/scramjet.sync.js',
      },
      flags: { captureErrors: true }
    });
    await scramjet.init();
    const iframe = document.getElementById('proxy-frame');
    sjFrame = scramjet.createFrame(iframe);
    console.log('[pysium] Scramjet ready');
  } catch (e) {
    console.error('[pysium] Scramjet init error:', e);
  }
}

// ─── URL HELPERS ──────────────────────────────────────────────────────
function isValidURL(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function resolveInput(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (isValidURL(raw)) return raw;
  if (!raw.includes(' ') && raw.includes('.')) {
    const a = 'https://' + raw;
    if (isValidURL(a)) return a;
  }
  return SEARCH_ENGINE.replace('%s', encodeURIComponent(raw));
}

function proxyNavigate(url) {
  if (!sjFrame) { console.warn('[pysium] sjFrame not ready'); return; }
  try {
    if (typeof sjFrame.go === 'function')       { sjFrame.go(url); return; }
    if (typeof sjFrame.navigate === 'function') { sjFrame.navigate(url); return; }
    // fallback
    const enc = scramjet && scramjet.encodeUrl ? scramjet.encodeUrl(url) : '/scram/' + encodeURIComponent(url);
    document.getElementById('proxy-frame').src = enc;
  } catch (e) { console.error('[pysium] navigate error:', e); }
}

// ─── CLOAK ────────────────────────────────────────────────────────────
function applyCloak(title, faviconUrl) {
  document.title = title || CLOAK_DEFAULTS.title;
  const link = document.getElementById('cloak-favicon');
  if (link) link.href = faviconUrl || CLOAK_DEFAULTS.favicon;
}

function loadCloakSettings() {
  const s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
  cloakEnabled = s.enabled !== false;
  const title   = s.title   || CLOAK_DEFAULTS.title;
  const favicon = s.favicon || CLOAK_DEFAULTS.favicon;
  const auto    = s.autoCloak !== false;
  document.getElementById('cloak-toggle').checked      = cloakEnabled;
  document.getElementById('cloak-title').value         = title;
  document.getElementById('cloak-favicon-url').value   = favicon;
  document.getElementById('cloak-auto-toggle').checked = auto;
  if (cloakEnabled && auto) applyCloak(title, favicon);
}

function saveCloakSettings() {
  const title     = document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title;
  const favicon   = document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon;
  cloakEnabled    = document.getElementById('cloak-toggle').checked;
  const autoCloak = document.getElementById('cloak-auto-toggle').checked;
  localStorage.setItem('pysium_cloak', JSON.stringify({ enabled: cloakEnabled, title, favicon, autoCloak }));
  if (cloakEnabled) applyCloak(title, favicon);
  else { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = 'favicon.webp'; }
}

// ─── TABS ─────────────────────────────────────────────────────────────
let _tid = 0;

function createTab(url = null) {
  const id = ++_tid;
  tabs.push({ id, title: 'New Tab', favicon: null, url: '', history: [], historyIdx: -1 });
  renderTabBar();
  switchTab(id);
  if (url) navigateTo(url, id);
  return id;
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  if (!tabs.length) { createTab(); return; }
  if (activeTabId === id) switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else renderTabBar();
}

function switchTab(id) {
  activeTabId = id;
  renderTabBar();
  const tab   = tabs.find(t => t.id === id);
  if (!tab) return;
  const home  = document.getElementById('home-page');
  const frame = document.getElementById('proxy-frame');
  const bar   = document.getElementById('address-bar');

  if (tab.url) {
    home.style.display  = 'none';
    frame.style.display = 'block';
    bar.value = tab.url;
    proxyNavigate(tab.url);
  } else {
    home.style.display  = 'flex';
    frame.style.display = 'none';
    bar.value = '';
  }
}

function renderTabBar() {
  const list = document.getElementById('tab-list');
  list.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

    const fav = document.createElement('img');
    fav.className = 'tab-favicon';
    fav.src = tab.favicon || `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236ee7b7' stroke-width='1.5'><circle cx='12' cy='12' r='9'/><path d='M2 12h20M12 3a15 15 0 010 18M12 3a15 15 0 000 18'/></svg>`;
    fav.onerror = () => { fav.style.display = 'none'; };

    const ttl = document.createElement('span');
    ttl.className = 'tab-title';
    ttl.textContent = tab.title || 'New Tab';

    const cls = document.createElement('button');
    cls.className = 'tab-close';
    cls.innerHTML = '&times;';
    cls.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    el.append(fav, ttl, cls);
    el.addEventListener('click', () => switchTab(tab.id));
    list.appendChild(el);
  });
}

// ─── NAVIGATION ───────────────────────────────────────────────────────
function navigateTo(raw, tabId = activeTabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  const url = resolveInput(raw);
  if (!url) { goHome(); return; }

  tab.url = url;
  tab.history = tab.history.slice(0, tab.historyIdx + 1);
  tab.history.push(url);
  tab.historyIdx = tab.history.length - 1;

  document.getElementById('home-page').style.display  = 'none';
  document.getElementById('proxy-frame').style.display = 'block';
  document.getElementById('address-bar').value = url;
  proxyNavigate(url);
}

function goHome() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.url = '';
  document.getElementById('home-page').style.display   = 'flex';
  document.getElementById('proxy-frame').style.display = 'none';
  document.getElementById('address-bar').value = '';
  renderTabBar();
}

// ─── EARLY CLOAK (runs at script parse, before DOM ready) ─────────────
;(function () {
  try {
    const s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
    if (s.enabled !== false && s.autoCloak !== false)
      document.title = s.title || CLOAK_DEFAULTS.title;
  } catch {}
})();

// ─── DOM READY ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {

  // ── Restore prefs ──────────────────────────────────────────────────
  const savedEngine = localStorage.getItem('pysium_engine');
  if (savedEngine) {
    SEARCH_ENGINE = savedEngine;
    const sel = document.getElementById('engine-select');
    if (sel) sel.value = savedEngine;
  }
  const savedPanic = localStorage.getItem('pysium_panic');
  if (savedPanic) document.getElementById('panic-url-input').value = savedPanic;

  loadCloakSettings();
  initBattery();

  // ── Iframe load → update tab title/favicon ─────────────────────────
  document.getElementById('proxy-frame').addEventListener('load', function () {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || !tab.url) return;
    try {
      const fdoc = this.contentDocument || this.contentWindow?.document;
      if (fdoc) {
        if (fdoc.title) tab.title = fdoc.title.trim().slice(0, 40);
        const icon = fdoc.querySelector('link[rel~="icon"], link[rel~="shortcut"]');
        if (icon?.href) tab.favicon = icon.href;
      }
    } catch {}
    renderTabBar();
  });

  // ── Nav buttons ────────────────────────────────────────────────────
  document.getElementById('home-btn').addEventListener('click', goHome);

  document.getElementById('back-btn').addEventListener('click', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.historyIdx <= 0) return;
    tab.historyIdx--;
    tab.url = tab.history[tab.historyIdx];
    document.getElementById('address-bar').value = tab.url;
    proxyNavigate(tab.url);
  });

  document.getElementById('forward-btn').addEventListener('click', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.historyIdx >= tab.history.length - 1) return;
    tab.historyIdx++;
    tab.url = tab.history[tab.historyIdx];
    document.getElementById('address-bar').value = tab.url;
    proxyNavigate(tab.url);
  });

  document.getElementById('reload-btn').addEventListener('click', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.url) proxyNavigate(tab.url);
  });

  document.getElementById('address-bar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); navigateTo(e.target.value); }
  });

  // ── Home search ────────────────────────────────────────────────────
  document.getElementById('sj-form').addEventListener('submit', e => e.preventDefault());
  document.getElementById('sj-address').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) { navigateTo(v); e.target.value = ''; }
    }
  });

  // ── Shortcuts ──────────────────────────────────────────────────────
  document.querySelectorAll('.shortcut').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      if (a.dataset.url) navigateTo(a.dataset.url);
    });
  });

  // ── New tab ────────────────────────────────────────────────────────
  document.getElementById('new-tab-btn').addEventListener('click', () => createTab());

  // ── Fullscreen ─────────────────────────────────────────────────────
  const fullBtn = document.getElementById('fullscreen-btn');
  fullBtn.addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    fullBtn.innerHTML = isFs
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;
  });

  // ── Panic ──────────────────────────────────────────────────────────
  const triggerPanic = () => window.location.replace(PANIC_URL);
  document.getElementById('panic-btn').addEventListener('click', triggerPanic);
  document.addEventListener('keydown', e => { if (e.altKey && e.key === 'x') triggerPanic(); });

  // ── Settings panel ─────────────────────────────────────────────────
  const openPanel = id => {
    document.getElementById(id).classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
  };
  const closeAllPanels = () => {
    document.querySelectorAll('.glass-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('overlay').classList.add('hidden');
  };

  document.getElementById('settings-fab').addEventListener('click', () => openPanel('settings-panel'));
  document.getElementById('overlay').addEventListener('click', closeAllPanels);
  document.querySelectorAll('.panel-close').forEach(btn => btn.addEventListener('click', closeAllPanels));

  // Settings sub-tabs
  document.querySelectorAll('.stab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('stab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Cloak presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('cloak-title').value       = btn.dataset.title;
      document.getElementById('cloak-favicon-url').value = btn.dataset.favicon;
    });
  });

  document.getElementById('cloak-apply').addEventListener('click', () => {
    saveCloakSettings();
    closeAllPanels();
  });

  document.getElementById('cloak-toggle').addEventListener('change', function () {
    cloakEnabled = this.checked;
    if (!cloakEnabled) {
      document.title = 'Pysium';
      document.getElementById('cloak-favicon').href = 'favicon.webp';
    } else {
      applyCloak(
        document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title,
        document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon
      );
    }
  });

  // About:blank cloak
  document.getElementById('ab-cloak-btn').addEventListener('click', () => {
    const title   = document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title;
    const favicon = document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon;
    const w = window.open('about:blank', '_blank');
    if (!w) { alert('Allow popups for this site first.'); return; }
    w.document.write(`<!doctype html><html><head>
      <title>${title}</title>
      <link rel="icon" href="${favicon}"/>
      <style>*{margin:0;padding:0;border:none;overflow:hidden}html,body,iframe{width:100%;height:100%;display:block}</style>
    </head><body>
      <iframe src="${location.href}" allow="fullscreen" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"></iframe>
    </body></html>`);
    w.document.close();
  });

  // Panic URL save
  document.getElementById('panic-save').addEventListener('click', () => {
    const url = document.getElementById('panic-url-input').value.trim();
    if (url) { PANIC_URL = url; localStorage.setItem('pysium_panic', url); }
    closeAllPanels();
  });

  // Search engine save
  document.getElementById('engine-select').addEventListener('change', function () {
    SEARCH_ENGINE = this.value;
    localStorage.setItem('pysium_engine', this.value);
  });

  // ── Init Scramjet then open first tab ──────────────────────────────
  await initScramjet();
  createTab();
});

// ─── BATTERY ──────────────────────────────────────────────────────────
async function initBattery() {
  if (!navigator.getBattery) return;
  try {
    const bat = await navigator.getBattery();
    function update() {
      const pct = Math.round(bat.level * 100);
      const pctEl = document.getElementById('battery-pct');
      const fill  = document.getElementById('battery-fill');
      if (pctEl) pctEl.textContent = pct + '%';
      if (fill) {
        fill.setAttribute('width', Math.max(1, Math.round(pct / 100 * 10)));
        fill.style.fill = pct <= 20 ? '#f87171' : pct <= 50 ? '#fbbf24' : '#6ee7b7';
      }
    }
    update();
    bat.addEventListener('levelchange', update);
    bat.addEventListener('chargingchange', update);
  } catch {}
}
