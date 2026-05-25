/* PYSIUM index.js — scripts load at end of body, DOM already ready */
'use strict';

var CLOAK_DEFAULTS = { title: 'Pysium', favicon: '/favicon.ico' };
var SEARCH_ENGINE  = localStorage.getItem('pysium_engine') || 'https://www.google.com/search?q=%s';
var PANIC_URL      = localStorage.getItem('pysium_panic')  || 'https://classroom.google.com';

var tabs         = [];
var activeTabId  = null;
var cloakEnabled = true;
var scramjet     = null;
var connection   = null;
var transportOK  = false;
var _tid         = 0;

// ── HELPERS ───────────────────────────────────────────────────────────
function isURL(s) {
  try { var u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch(e) { return false; }
}
function resolveInput(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (isURL(raw)) return raw;
  if (raw.indexOf(' ') === -1 && raw.indexOf('.') !== -1) {
    var a = 'https://' + raw;
    if (isURL(a)) return a;
  }
  return SEARCH_ENGINE.replace('%s', encodeURIComponent(raw));
}

// ── HOME / PROXY VISIBILITY ───────────────────────────────────────────
function showHome() {
  document.getElementById('home-page').style.display    = 'flex';
  document.getElementById('frame-container').style.display = 'none';
  document.getElementById('fab-row').style.display      = 'flex';
}
function showFrame() {
  document.getElementById('home-page').style.display    = 'none';
  document.getElementById('frame-container').style.display = 'flex';
  document.getElementById('fab-row').style.display      = 'none';
  document.getElementById('settings-panel').style.display = 'none';
}

// ── SCRAMJET ──────────────────────────────────────────────────────────
function initScramjet() {
  try {
    scramjet   = new ScramjetController({
      files: {
        wasm:   '/scram/scramjet.wasm.wasm',
        worker: '/scram/scramjet.worker.js',
        client: '/scram/scramjet.client.js',
        shared: '/scram/scramjet.shared.js',
        sync:   '/scram/scramjet.sync.js',
      }
    });
    scramjet.init();
    connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    console.log('[pysium] scramjet ready');
  } catch(e) {
    console.warn('[pysium] scramjet unavailable:', e.message);
  }
}

function ensureTransport() {
  if (transportOK || !connection) return Promise.resolve();
  var wisp = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/';
  var bare = location.protocol + '//' + location.host + '/bare/';
  var list = [
    ['/epoxy/index.mjs',   [{wisp: wisp}]],
    ['/libcurl/index.mjs', [{wisp: wisp}]],
    ['/baremod/index.mjs', [bare]],
  ];
  function tryNext(i) {
    if (i >= list.length) { console.warn('[pysium] no transport'); return Promise.resolve(); }
    return connection.setTransport(list[i][0], list[i][1]).then(function() {
      transportOK = true;
      console.log('[pysium] transport:', list[i][0]);
    }).catch(function() { return tryNext(i + 1); });
  }
  return tryNext(0);
}

// ── TABS ──────────────────────────────────────────────────────────────
function createTab(url) {
  var id     = ++_tid;
  var frame  = null;
  var iframe = null;
  if (scramjet) {
    try {
      frame  = scramjet.createFrame();
      iframe = frame.frame;
      iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;display:none;background:#fff';
      document.getElementById('frame-container').appendChild(iframe);
    } catch(e) {
      console.warn('[pysium] createFrame:', e.message);
      frame = null; iframe = null;
    }
  }
  tabs.push({ id: id, title: 'New Tab', favicon: null, url: '', history: [], historyIdx: -1, frame: frame, iframe: iframe });
  renderTabBar();
  switchTab(id);
  if (url) navigateTo(url, id);
  return id;
}

function closeTab(id) {
  var idx = tabs.findIndex(function(t) { return t.id === id; });
  if (idx < 0) return;
  var tab = tabs[idx];
  if (tab.iframe) tab.iframe.remove();
  tabs.splice(idx, 1);
  if (!tabs.length) { createTab(); return; }
  if (activeTabId === id) switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else renderTabBar();
}

function switchTab(id) {
  activeTabId = id;
  tabs.forEach(function(t) { if (t.iframe) t.iframe.style.display = 'none'; });
  var tab = tabs.find(function(t) { return t.id === id; });
  if (!tab) return;

  if (tab.url) {
    showFrame();
    if (tab.iframe) tab.iframe.style.display = 'block';
    document.getElementById('address-bar').value = tab.url;
  } else {
    showHome();
    document.getElementById('address-bar').value = '';
  }
  renderTabBar();
  updateNavBtns();
}

function renderTabBar() {
  var list = document.getElementById('tab-list');
  list.innerHTML = '';
  tabs.forEach(function(tab) {
    var el  = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

    var fav = document.createElement('img');
    fav.className = 'tab-favicon';
    fav.src = tab.favicon || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236ee7b7' stroke-width='1.5'><circle cx='12' cy='12' r='9'/><path d='M2 12h20M12 3a15 15 0 010 18M12 3a15 15 0 000 18'/></svg>";
    fav.onerror = function() { this.style.display = 'none'; };

    var ttl = document.createElement('span');
    ttl.className = 'tab-title';
    ttl.textContent = tab.title || 'New Tab';

    var cls = document.createElement('button');
    cls.className = 'tab-close';
    cls.innerHTML = '&times;';
    cls.addEventListener('click', (function(tid) {
      return function(e) { e.stopPropagation(); closeTab(tid); };
    })(tab.id));

    el.append(fav, ttl, cls);
    el.addEventListener('click', (function(tid) {
      return function() { switchTab(tid); };
    })(tab.id));
    list.appendChild(el);
  });
}

function updateNavBtns() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  document.getElementById('back-btn').disabled    = !tab || tab.historyIdx <= 0;
  document.getElementById('forward-btn').disabled = !tab || tab.historyIdx >= tab.history.length - 1;
}

// ── NAVIGATION ────────────────────────────────────────────────────────
function navigateTo(raw, tabId) {
  tabId = tabId || activeTabId;
  var tab = tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;
  var url = resolveInput(raw);
  if (!url) { goHome(); return; }

  if (tab.history[tab.historyIdx] !== url) {
    tab.history = tab.history.slice(0, tab.historyIdx + 1);
    tab.history.push(url);
    tab.historyIdx = tab.history.length - 1;
  }
  tab.url = url;

  showFrame();
  tabs.forEach(function(t) { if (t.iframe) t.iframe.style.display = 'none'; });
  if (tab.iframe) tab.iframe.style.display = 'block';
  document.getElementById('address-bar').value = url;
  renderTabBar();
  updateNavBtns();

  if (tab.frame) {
    ensureTransport().then(function() {
      try { tab.frame.go(url); } catch(e) { console.error('[pysium] go():', e); }
    });
  }
}

function goHome() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (tab) { tab.url = ''; }
  tabs.forEach(function(t) { if (t.iframe) t.iframe.style.display = 'none'; });
  showHome();
  document.getElementById('address-bar').value = '';
  renderTabBar();
  updateNavBtns();
}

function goBack() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (!tab || tab.historyIdx <= 0) return;
  tab.historyIdx--;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  showFrame();
  tabs.forEach(function(t) { if (t.iframe) t.iframe.style.display = 'none'; });
  if (tab.iframe) tab.iframe.style.display = 'block';
  updateNavBtns();
  if (tab.frame) ensureTransport().then(function() { try { tab.frame.go(tab.url); } catch(e){} });
}

function goForward() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (!tab || tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  showFrame();
  tabs.forEach(function(t) { if (t.iframe) t.iframe.style.display = 'none'; });
  if (tab.iframe) tab.iframe.style.display = 'block';
  updateNavBtns();
  if (tab.frame) ensureTransport().then(function() { try { tab.frame.go(tab.url); } catch(e){} });
}

function reloadTab() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (!tab || !tab.url || !tab.frame) return;
  ensureTransport().then(function() { try { tab.frame.go(tab.url); } catch(e){} });
}

// ── TAB META (title + favicon) ────────────────────────────────────────
function pollTabMeta() {
  var tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (!tab || !tab.iframe) return;
  try {
    var doc = tab.iframe.contentDocument || (tab.iframe.contentWindow && tab.iframe.contentWindow.document);
    if (!doc) return;
    if (doc.title && doc.title !== tab.title) {
      tab.title = doc.title.slice(0, 40);
      renderTabBar();
    }
    var icon = doc.querySelector('link[rel~="icon"],link[rel~="shortcut icon"]');
    if (icon && icon.href && icon.href !== tab.favicon) {
      tab.favicon = icon.href;
      renderTabBar();
    }
  } catch(e) {}
}
setInterval(pollTabMeta, 1500);

// ── CLOAK ─────────────────────────────────────────────────────────────
function applyCloak(title, fav) {
  document.title = title || CLOAK_DEFAULTS.title;
  var el = document.getElementById('cloak-favicon');
  if (el) el.href = fav || CLOAK_DEFAULTS.favicon;
}
function loadCloakSettings() {
  var s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
  cloakEnabled = s.enabled !== false;
  var title = s.title   || CLOAK_DEFAULTS.title;
  var fav   = s.favicon || CLOAK_DEFAULTS.favicon;
  var auto  = s.autoCloak !== false;
  document.getElementById('cloak-toggle').checked      = cloakEnabled;
  document.getElementById('cloak-title').value         = title;
  document.getElementById('cloak-favicon-url').value   = fav;
  document.getElementById('cloak-auto-toggle').checked = auto;
  if (cloakEnabled && auto) applyCloak(title, fav);
}
function saveCloakSettings() {
  var title = (document.getElementById('cloak-title').value.trim())       || CLOAK_DEFAULTS.title;
  var fav   = (document.getElementById('cloak-favicon-url').value.trim()) || CLOAK_DEFAULTS.favicon;
  cloakEnabled = document.getElementById('cloak-toggle').checked;
  var auto = document.getElementById('cloak-auto-toggle').checked;
  localStorage.setItem('pysium_cloak', JSON.stringify({ enabled: cloakEnabled, title: title, favicon: fav, autoCloak: auto }));
  if (cloakEnabled) applyCloak(title, fav);
  else { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = '/favicon.ico'; }
}

// ── WEATHER ───────────────────────────────────────────────────────────
var WX_ICONS = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌧',63:'🌧',65:'🌧',71:'🌨',73:'🌨',75:'❄️',80:'🌦',81:'🌧',82:'⛈',95:'⛈',96:'⛈',99:'⛈'};
var WX_DESC  = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Heavy showers',82:'Violent showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};

function showWeatherData(wx, city) {
  document.getElementById('weather-loading').style.display = 'none';
  document.getElementById('weather-data').style.display    = 'flex';
  var code = wx.weathercode || 0;
  document.getElementById('weather-temp').textContent = Math.round(wx.temperature) + '°C';
  document.getElementById('weather-desc').textContent = WX_DESC[code] || 'Clear';
  document.getElementById('weather-city').textContent = city || '';
  document.getElementById('weather-icon-wrap').innerHTML = '<span style="font-size:28px;line-height:1">' + (WX_ICONS[code] || '🌡️') + '</span>';
}
function loadWeather(lat, lon) {
  return Promise.all([
    fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,weathercode&timezone=auto')
      .then(function(r){return r.json();})
      .then(function(d){
        var c = d.current || d.current_weather || {};
        return { temperature: c.temperature_2m !== undefined ? c.temperature_2m : (c.temperature || 0), weathercode: c.weathercode || 0 };
      }),
    fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json', {headers:{'Accept-Language':'en'}})
      .then(function(r){return r.json();})
      .then(function(d){ return d.address && (d.address.city || d.address.town || d.address.village || d.address.county) || ''; })
      .catch(function(){return '';})
  ]).then(function(results) {
    var wx = results[0], city = results[1];
    localStorage.setItem('pysium_weather_cache', JSON.stringify({wx:wx, city:city, ts:Date.now()}));
    showWeatherData(wx, city);
  });
}
function initWeather() {
  var cached = localStorage.getItem('pysium_weather_cache');
  if (cached) {
    try { var d = JSON.parse(cached); showWeatherData(d.wx, d.city); } catch(e){}
  }
  var savedPos = localStorage.getItem('pysium_weather_pos');
  if (savedPos) {
    try {
      var p = JSON.parse(savedPos);
      var age = cached ? Date.now() - JSON.parse(cached).ts : Infinity;
      if (age > 15*60*1000) loadWeather(p.lat, p.lon);
    } catch(e){}
  }
  document.getElementById('weather-widget').addEventListener('click', function() {
    if (!navigator.geolocation) { alert('Geolocation not available'); return; }
    var loading = document.getElementById('weather-loading');
    var data    = document.getElementById('weather-data');
    loading.style.display = 'flex'; data.style.display = 'none';
    loading.querySelector('span').textContent = 'Getting location…';
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        localStorage.setItem('pysium_weather_pos', JSON.stringify({lat:lat,lon:lon}));
        loading.querySelector('span').textContent = 'Loading…';
        loadWeather(lat, lon).catch(function() {
          loading.querySelector('span').textContent = 'Unavailable';
        });
      },
      function(err) {
        loading.querySelector('span').textContent = err.code === 1 ? 'Location denied' : 'Unavailable';
      },
      {timeout:10000}
    );
  });
}

// ── BATTERY ───────────────────────────────────────────────────────────
function initBattery() {
  if (!navigator.getBattery) return;
  navigator.getBattery().then(function(bat) {
    function update() {
      var pct = Math.round(bat.level * 100);
      document.getElementById('batt-pct').textContent    = pct + '%';
      document.getElementById('batt-status').textContent = bat.charging ? '⚡ Charging' : (pct <= 20 ? '⚠ Low' : 'Battery');
      var fill = document.getElementById('batt-fill');
      if (fill) {
        fill.setAttribute('width', (bat.level * 31).toFixed(1));
        fill.setAttribute('fill', pct <= 20 ? '#f87171' : pct <= 50 ? '#fbbf24' : '#6ee7b7');
      }
    }
    update();
    bat.addEventListener('levelchange', update);
    bat.addEventListener('chargingchange', update);
  }).catch(function(){});
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-panel').style.display = 'flex';
  document.getElementById('overlay').style.display = 'block';
}
function closeSettings() {
  document.getElementById('settings-panel').style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
}

// ── WIRE UP ───────────────────────────────────────────────────────────
// By now DOM is fully ready (scripts at end of body)

// Early cloak
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
    if (s.enabled !== false && s.autoCloak !== false) document.title = s.title || CLOAK_DEFAULTS.title;
  } catch(e){}
}());

initScramjet();
loadCloakSettings();
initBattery();
initWeather();
document.getElementById('engine-select').value   = SEARCH_ENGINE;
document.getElementById('panic-url-input').value = PANIC_URL;

// Nav
document.getElementById('home-btn').addEventListener('click', goHome);
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('forward-btn').addEventListener('click', goForward);
document.getElementById('reload-btn').addEventListener('click', reloadTab);
document.getElementById('address-bar').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); navigateTo(this.value); }
});

// Search
document.getElementById('sj-form').addEventListener('submit', function(e) { e.preventDefault(); });
document.getElementById('sj-address').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); var v = this.value.trim(); if (v) { navigateTo(v); this.value=''; } }
});

// Shortcuts
document.querySelectorAll('.shortcut').forEach(function(a) {
  a.addEventListener('click', function(e) {
    e.preventDefault(); if (a.dataset.url) navigateTo(a.dataset.url);
  });
});

// New tab
document.getElementById('new-tab-btn').addEventListener('click', function() { createTab(); });

// Fullscreen
var fsBtn = document.getElementById('fullscreen-btn');
fsBtn.addEventListener('click', function() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  else document.exitFullscreen && document.exitFullscreen();
});
document.addEventListener('fullscreenchange', function() {
  fsBtn.innerHTML = document.fullscreenElement
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
});

// Panic
document.getElementById('panic-btn').addEventListener('click', function() { window.location.replace(PANIC_URL); });
document.addEventListener('keydown', function(e) { if (e.altKey && e.key === 'x') window.location.replace(PANIC_URL); });

// Settings FAB
document.getElementById('settings-fab').addEventListener('click', openSettings);
document.getElementById('overlay').addEventListener('click', closeSettings);
document.querySelectorAll('.panel-close').forEach(function(b) { b.addEventListener('click', closeSettings); });

// Settings sub-tabs
document.querySelectorAll('.stab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.stab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.stab-pane').forEach(function(p) { p.style.display = 'none'; });
    btn.classList.add('active');
    document.getElementById('stab-' + btn.dataset.tab).style.display = 'flex';
  });
});

// Cloak presets
document.querySelectorAll('.preset-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.getElementById('cloak-title').value       = btn.dataset.title;
    document.getElementById('cloak-favicon-url').value = btn.dataset.favicon;
  });
});
document.getElementById('cloak-apply').addEventListener('click', function() { saveCloakSettings(); closeSettings(); });
document.getElementById('cloak-toggle').addEventListener('change', function() {
  cloakEnabled = this.checked;
  if (!cloakEnabled) { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = '/favicon.ico'; }
  else applyCloak(
    document.getElementById('cloak-title').value.trim() || CLOAK_DEFAULTS.title,
    document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon
  );
});
document.getElementById('ab-cloak-btn').addEventListener('click', function() {
  var title = document.getElementById('cloak-title').value.trim() || CLOAK_DEFAULTS.title;
  var fav   = document.getElementById('cloak-favicon-url').value.trim() || CLOAK_DEFAULTS.favicon;
  var w = window.open('about:blank', '_blank');
  if (!w) { alert('Allow popups first.'); return; }
  w.document.write('<!doctype html><html><head><title>'+title+'</title><link rel="icon" href="'+fav+'"/><style>*{margin:0;padding:0;border:none;overflow:hidden}html,body,iframe{width:100%;height:100%;display:block}</style></head><body><iframe src="'+location.href+'" allow="fullscreen" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"></iframe></body></html>');
  w.document.close();
});
document.getElementById('panic-save').addEventListener('click', function() {
  var url = document.getElementById('panic-url-input').value.trim();
  if (url) { PANIC_URL = url; localStorage.setItem('pysium_panic', url); }
  closeSettings();
});
document.getElementById('engine-select').addEventListener('change', function() {
  SEARCH_ENGINE = this.value; localStorage.setItem('pysium_engine', this.value);
});

// Boot
createTab();
updateNavBtns();
