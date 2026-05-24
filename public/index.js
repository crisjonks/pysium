/* ── PYSIUM index.js ── */

const CLOAK_DEFAULTS = { title: 'Google Drive', favicon: 'https://drive.google.com/favicon.ico' };
let SEARCH_ENGINE = localStorage.getItem('pysium_engine') || 'https://www.google.com/search?q=%s';
let PANIC_URL     = localStorage.getItem('pysium_panic')  || 'https://classroom.google.com';

let tabs        = [];
let activeTabId = null;
let cloakEnabled = true;
let scramjet    = null;
let sjFrame     = null;

// ── SCRAMJET ─────────────────────────────────────────────────────────
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
    sjFrame = scramjet.createFrame(document.getElementById('proxy-frame'));
    console.log('[pysium] Scramjet ready');
  } catch (e) {
    console.error('[pysium] Scramjet init failed:', e);
  }
}

// ── URL HELPERS ───────────────────────────────────────────────────────
function isURL(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function resolveInput(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (isURL(raw)) return raw;
  if (!raw.includes(' ') && raw.includes('.')) {
    const a = 'https://' + raw;
    if (isURL(a)) return a;
  }
  return SEARCH_ENGINE.replace('%s', encodeURIComponent(raw));
}

function proxyGo(url) {
  if (!sjFrame) { console.warn('[pysium] not ready'); return; }
  if (typeof sjFrame.go === 'function')       return sjFrame.go(url);
  if (typeof sjFrame.navigate === 'function') return sjFrame.navigate(url);
  // last-resort fallback
  const enc = scramjet?.encodeUrl ? scramjet.encodeUrl(url) : '/scram/' + encodeURIComponent(url);
  document.getElementById('proxy-frame').src = enc;
}

// ── CLOAK ─────────────────────────────────────────────────────────────
function applyCloak(title, fav) {
  document.title = title || CLOAK_DEFAULTS.title;
  const el = document.getElementById('cloak-favicon');
  if (el) el.href = fav || CLOAK_DEFAULTS.favicon;
}

function loadCloakSettings() {
  const s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
  cloakEnabled = s.enabled !== false;
  const title = s.title   || CLOAK_DEFAULTS.title;
  const fav   = s.favicon || CLOAK_DEFAULTS.favicon;
  const auto  = s.autoCloak !== false;
  document.getElementById('cloak-toggle').checked      = cloakEnabled;
  document.getElementById('cloak-title').value         = title;
  document.getElementById('cloak-favicon-url').value   = fav;
  document.getElementById('cloak-auto-toggle').checked = auto;
  if (cloakEnabled && auto) applyCloak(title, fav);
}

function saveCloakSettings() {
  const title   = document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title;
  const favicon = document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon;
  cloakEnabled  = document.getElementById('cloak-toggle').checked;
  const auto    = document.getElementById('cloak-auto-toggle').checked;
  localStorage.setItem('pysium_cloak', JSON.stringify({ enabled: cloakEnabled, title, favicon, autoCloak: auto }));
  if (cloakEnabled) applyCloak(title, favicon);
  else { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = 'favicon.webp'; }
}

// ── TABS ──────────────────────────────────────────────────────────────
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
  if (idx < 0) return;
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

  if (tab.url) {
    home.style.display  = 'none';
    frame.style.display = 'block';
    document.getElementById('address-bar').value = tab.url;
    proxyGo(tab.url);
  } else {
    home.style.display  = 'flex';
    frame.style.display = 'none';
    document.getElementById('address-bar').value = '';
  }
  updateNavButtons();
}

function renderTabBar() {
  const list = document.getElementById('tab-list');
  list.innerHTML = '';
  tabs.forEach(tab => {
    const el  = document.createElement('div');
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

function updateNavButtons() {
  const tab = tabs.find(t => t.id === activeTabId);
  const canBack    = tab && tab.historyIdx > 0;
  const canForward = tab && tab.historyIdx < tab.history.length - 1;
  document.getElementById('back-btn').disabled    = !canBack;
  document.getElementById('forward-btn').disabled = !canForward;
}

// ── NAVIGATION ────────────────────────────────────────────────────────
function navigateTo(raw, tabId = activeTabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  const url = resolveInput(raw);
  if (!url) { goHome(); return; }

  // push history only if different from current
  if (tab.history[tab.historyIdx] !== url) {
    tab.history = tab.history.slice(0, tab.historyIdx + 1);
    tab.history.push(url);
    tab.historyIdx = tab.history.length - 1;
  }
  tab.url = url;

  document.getElementById('home-page').style.display   = 'none';
  document.getElementById('proxy-frame').style.display = 'block';
  document.getElementById('address-bar').value = url;
  proxyGo(url);
  updateNavButtons();
}

function goHome() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.url = '';
  document.getElementById('home-page').style.display   = 'flex';
  document.getElementById('proxy-frame').style.display = 'none';
  document.getElementById('address-bar').value = '';
  renderTabBar();
  updateNavButtons();
}

function goBack() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || tab.historyIdx <= 0) return;
  tab.historyIdx--;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  document.getElementById('home-page').style.display   = 'none';
  document.getElementById('proxy-frame').style.display = 'block';
  proxyGo(tab.url);
  updateNavButtons();
}

function goForward() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  proxyGo(tab.url);
  updateNavButtons();
}

function reloadTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.url) return;
  proxyGo(tab.url);
}

// ── WEATHER WIDGET ────────────────────────────────────────────────────
const WX_ICONS = {
  0:'☀️', 1:'🌤', 2:'⛅', 3:'☁️', 45:'🌫', 48:'🌫',
  51:'🌦', 53:'🌦', 55:'🌧', 61:'🌧', 63:'🌧', 65:'🌧',
  71:'🌨', 73:'🌨', 75:'❄️', 80:'🌦', 81:'🌧', 82:'⛈',
  95:'⛈', 96:'⛈', 99:'⛈'
};
const WX_DESC = {
  0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Fog', 51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow',
  75:'Heavy snow', 80:'Showers', 81:'Heavy showers', 82:'Violent showers',
  95:'Thunderstorm', 96:'Thunderstorm', 99:'Thunderstorm'
};

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius`;
  const res  = await fetch(url);
  const data = await res.json();
  return data.current_weather;
}

async function fetchCity(lat, lon) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
  } catch { return ''; }
}

function showWeatherData(wx, city) {
  document.getElementById('weather-loading').classList.add('hidden');
  document.getElementById('weather-data').classList.remove('hidden');
  const code = wx.weathercode ?? wx.weather_code ?? 0;
  document.getElementById('weather-temp').textContent = Math.round(wx.temperature) + '°C';
  document.getElementById('weather-desc').textContent = WX_DESC[code] || 'Unknown';
  document.getElementById('weather-city').textContent = city || '';
  // swap SVG for emoji
  const wrap = document.getElementById('weather-icon-wrap');
  wrap.innerHTML = `<span style="font-size:30px;line-height:1">${WX_ICONS[code] || '🌡️'}</span>`;
}

async function initWeather() {
  const cached = localStorage.getItem('pysium_weather_cache');
  if (cached) {
    try {
      const { wx, city } = JSON.parse(cached);
      showWeatherData(wx, city);
    } catch {}
  }

  const widget = document.getElementById('weather-widget');
  widget.addEventListener('click', async () => {
    if (!('geolocation' in navigator)) { alert('Geolocation not supported.'); return; }
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
      const { latitude: lat, longitude: lon } = pos.coords;
      localStorage.setItem('pysium_weather_pos', JSON.stringify({ lat, lon }));
      const [wx, city] = await Promise.all([fetchWeather(lat, lon), fetchCity(lat, lon)]);
      localStorage.setItem('pysium_weather_cache', JSON.stringify({ wx, city, ts: Date.now() }));
      showWeatherData(wx, city);
    } catch (e) {
      console.warn('[pysium] weather error:', e);
    }
  });

  // Auto-refresh from saved position if cache is old (>15 min)
  const savedPos = localStorage.getItem('pysium_weather_pos');
  if (savedPos) {
    try {
      const { lat, lon } = JSON.parse(savedPos);
      const cacheAge = cached ? (Date.now() - JSON.parse(cached).ts) : Infinity;
      if (cacheAge > 15 * 60 * 1000) {
        const [wx, city] = await Promise.all([fetchWeather(lat, lon), fetchCity(lat, lon)]);
        localStorage.setItem('pysium_weather_cache', JSON.stringify({ wx, city, ts: Date.now() }));
        showWeatherData(wx, city);
      }
    } catch {}
  }
}

// ── BATTERY WIDGET ────────────────────────────────────────────────────
async function initBattery() {
  if (!navigator.getBattery) return;
  try {
    const bat = await navigator.getBattery();
    function update() {
      const pct = Math.round(bat.level * 100);
      document.getElementById('batt-pct').textContent    = pct + '%';
      document.getElementById('batt-status').textContent = bat.charging ? 'Charging' : (pct <= 20 ? 'Low battery' : 'Battery');
      const fill = document.getElementById('batt-fill');
      if (fill) {
        // max usable width inside the SVG body rect is 26px
        const w = Math.max(1, Math.round(pct / 100 * 26));
        fill.setAttribute('width', w);
        fill.setAttribute('fill', pct <= 20 ? '#f87171' : pct <= 50 ? '#fbbf24' : '#6ee7b7');
      }
    }
    update();
    bat.addEventListener('levelchange',   update);
    bat.addEventListener('chargingchange', update);
  } catch {}
}

// ── IFRAME LOAD ───────────────────────────────────────────────────────
function onFrameLoad() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.url) return;
  try {
    const fdoc = document.getElementById('proxy-frame').contentDocument;
    if (fdoc) {
      if (fdoc.title) tab.title = fdoc.title.trim().slice(0, 40);
      const icon = fdoc.querySelector('link[rel~="icon"],link[rel~="shortcut"]');
      if (icon?.href) tab.favicon = icon.href;
      renderTabBar();
    }
  } catch {}
}

// ── FULLSCREEN ────────────────────────────────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

// ── PANELS ────────────────────────────────────────────────────────────
function openPanel(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}
function closeAllPanels() {
  document.querySelectorAll('.glass-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('overlay').classList.add('hidden');
}

// ── EARLY CLOAK ───────────────────────────────────────────────────────
;(function earlyCloak() {
  try {
    const s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
    if (s.enabled !== false && s.autoCloak !== false)
      document.title = s.title || CLOAK_DEFAULTS.title;
  } catch {}
})();

// ── INIT ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {

  // Restore search engine
  document.getElementById('engine-select').value     = SEARCH_ENGINE;
  document.getElementById('panic-url-input').value   = PANIC_URL;

  loadCloakSettings();

  // ── Nav buttons ──────────────────────────────────────────────────
  document.getElementById('home-btn').addEventListener('click', goHome);
  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('forward-btn').addEventListener('click', goForward);
  document.getElementById('reload-btn').addEventListener('click', reloadTab);

  document.getElementById('address-bar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); navigateTo(e.target.value); }
  });

  // ── Home search ───────────────────────────────────────────────────
  document.getElementById('sj-form').addEventListener('submit', e => e.preventDefault());
  document.getElementById('sj-address').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) { navigateTo(v); e.target.value = ''; }
    }
  });

  // ── Shortcuts ─────────────────────────────────────────────────────
  document.querySelectorAll('.shortcut').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); if (a.dataset.url) navigateTo(a.dataset.url); });
  });

  // ── Tabs ──────────────────────────────────────────────────────────
  document.getElementById('new-tab-btn').addEventListener('click', () => createTab());

  // ── Iframe load ───────────────────────────────────────────────────
  document.getElementById('proxy-frame').addEventListener('load', onFrameLoad);

  // ── Fullscreen ────────────────────────────────────────────────────
  const fsBtn = document.getElementById('fullscreen-btn');
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    fsBtn.innerHTML = document.fullscreenElement
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;
  });

  // ── Panic ─────────────────────────────────────────────────────────
  const triggerPanic = () => window.location.replace(PANIC_URL);
  document.getElementById('panic-btn').addEventListener('click', triggerPanic);
  document.addEventListener('keydown', e => { if (e.altKey && e.key === 'x') triggerPanic(); });

  // ── Settings ──────────────────────────────────────────────────────
  document.getElementById('settings-fab').addEventListener('click', () => openPanel('settings-panel'));
  document.getElementById('overlay').addEventListener('click', closeAllPanels);
  document.querySelectorAll('.panel-close').forEach(b => b.addEventListener('click', closeAllPanels));

  document.querySelectorAll('.stab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('stab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('cloak-title').value       = btn.dataset.title;
      document.getElementById('cloak-favicon-url').value = btn.dataset.favicon;
    });
  });

  document.getElementById('cloak-apply').addEventListener('click', () => { saveCloakSettings(); closeAllPanels(); });

  document.getElementById('cloak-toggle').addEventListener('change', function () {
    cloakEnabled = this.checked;
    if (!cloakEnabled) { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = 'favicon.webp'; }
    else applyCloak(
      document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title,
      document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon
    );
  });

  document.getElementById('ab-cloak-btn').addEventListener('click', () => {
    const title = document.getElementById('cloak-title').value.trim()       || CLOAK_DEFAULTS.title;
    const fav   = document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon;
    const w = window.open('about:blank', '_blank');
    if (!w) { alert('Allow popups for this site first.'); return; }
    w.document.write(`<!doctype html><html><head><title>${title}</title><link rel="icon" href="${fav}"/><style>*{margin:0;padding:0;border:none;overflow:hidden}html,body,iframe{width:100%;height:100%;display:block}</style></head><body><iframe src="${location.href}" allow="fullscreen" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"></iframe></body></html>`);
    w.document.close();
  });

  document.getElementById('panic-save').addEventListener('click', () => {
    const url = document.getElementById('panic-url-input').value.trim();
    if (url) { PANIC_URL = url; localStorage.setItem('pysium_panic', url); }
    closeAllPanels();
  });

  document.getElementById('engine-select').addEventListener('change', function () {
    SEARCH_ENGINE = this.value;
    localStorage.setItem('pysium_engine', this.value);
  });

  // ── Widgets ───────────────────────────────────────────────────────
  initBattery();
  initWeather();

  // ── Boot scramjet then open first tab ─────────────────────────────
  await initScramjet();
  createTab();
  updateNavButtons();
});
