// ── CONFIG ────────────────────────────────────────────────────────────
var CLOAK_DEFAULTS = { title: 'Pysium', favicon: '/favicon.ico' };
var SEARCH_ENGINE  = localStorage.getItem('pysium_engine') || 'https://www.google.com/search?q=%s';
var PANIC_URL      = localStorage.getItem('pysium_panic')  || 'https://classroom.google.com';
var cloakEnabled   = true;
var tabs           = [];
var activeTabId    = null;
var _tid           = 0;

// ── SCRAMJET INIT ─────────────────────────────────────────────────────
// Files confirmed 200 on this server: scramjet.all.js, scramjet.wasm.wasm, libcurl
var scramjet   = null;
var connection = null;
var wispUrl    = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/';

var _transportP = null;
function ensureTransport() {
  if (_transportP) return _transportP;
  if (!connection) return Promise.resolve();
  _transportP = connection.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl }])
    .then(function() { console.log('[pysium] transport ready'); })
    .catch(function(e) { console.warn('[pysium] transport failed:', e.message); _transportP = null; });
  return _transportP;
}

try {
  var _sj = $scramjetLoadController();
  scramjet = new _sj.ScramjetController({
    files: {
      wasm: '/scram/scramjet.wasm.wasm',
      all:  '/scram/scramjet.all.js',
      sync: '/scram/scramjet.sync.js',
    }
  });
  scramjet.init();
  navigator.serviceWorker.register('/sw.js');
  connection = new BareMux.BareMuxConnection('/baremux/worker.js');
  // Pre-warm transport
  ensureTransport();
  console.log('[pysium] scramjet ready');
} catch(e) {
  console.error('[pysium] scramjet init failed:', e.message);
}

// ── URL HELPERS ───────────────────────────────────────────────────────
function isURL(s) {
  try { var u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch(e) { return false; }
}
function resolveInput(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (isURL(raw)) return raw;
  if (raw.indexOf(' ') < 0 && raw.indexOf('.') >= 0) {
    var a = 'https://' + raw;
    if (isURL(a)) return a;
  }
  return SEARCH_ENGINE.replace('%s', encodeURIComponent(raw));
}

// ── VISIBILITY ────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('home-page').style.display       = 'flex';
  document.getElementById('frame-container').style.display = 'none';
}
function showFrame() {
  document.getElementById('home-page').style.display       = 'none';
  document.getElementById('frame-container').style.display = 'flex';
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

      // urlchange — best way to track navigation in scramjet
      frame.addEventListener('urlchange', function(e) {
        var t = getTab(id);
        if (!t) return;
        var u = e.url || '';
        if (u && u !== t.url) {
          // push history only if not a back/fwd navigation
          if (t.history[t.historyIdx] !== u) {
            t.history = t.history.slice(0, t.historyIdx + 1);
            t.history.push(u);
            t.historyIdx = t.history.length - 1;
          }
          t.url = u;
          if (id === activeTabId) {
            document.getElementById('address-bar').value = u;
            updateNavBtns();
          }
        }
        // poll title/favicon right after url changes
        pollMeta(id);
      });
    } catch(e) {
      console.warn('[pysium] createFrame:', e.message);
      frame = null; iframe = null;
    }
  }

  tabs.push({ id:id, title:'New Tab', favicon:null, url:'', history:[], historyIdx:-1, frame:frame, iframe:iframe });
  renderTabs();
  switchTab(id);
  if (url) navigateTo(url, id);
  return id;
}

function getTab(id) {
  for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i];
  return null;
}

function closeTab(id) {
  var idx = -1;
  for (var i = 0; i < tabs.length; i++) { if (tabs[i].id === id) { idx = i; break; } }
  if (idx < 0) return;
  if (tabs[idx].iframe) tabs[idx].iframe.remove();
  tabs.splice(idx, 1);
  if (!tabs.length) { createTab(); return; }
  if (activeTabId === id) switchTab(tabs[Math.min(idx, tabs.length-1)].id);
  else renderTabs();
}

function switchTab(id) {
  activeTabId = id;
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].iframe) tabs[i].iframe.style.display = 'none';
  }
  var tab = getTab(id);
  if (!tab) return;
  if (tab.url) {
    showFrame();
    if (tab.iframe) tab.iframe.style.display = 'block';
    document.getElementById('address-bar').value = tab.url;
  } else {
    showHome();
    document.getElementById('address-bar').value = '';
  }
  renderTabs();
  updateNavBtns();
}

function renderTabs() {
  var list = document.getElementById('tab-list');
  list.innerHTML = '';
  for (var i = 0; i < tabs.length; i++) {
    (function(tab) {
      var el = document.createElement('div');
      el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

      var fav = document.createElement('img');
      fav.className = 'tab-favicon';
      fav.src = tab.favicon || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236ee7b7' stroke-width='1.5'><circle cx='12' cy='12' r='9'/><path d='M2 12h20M12 3a15 15 0 010 18M12 3a15 15 0 000 18'/></svg>";
      fav.onerror = function() { this.style.display='none'; };

      var ttl = document.createElement('span');
      ttl.className = 'tab-title';
      ttl.textContent = tab.title || 'New Tab';

      var cls = document.createElement('button');
      cls.className = 'tab-close';
      cls.innerHTML = '&times;';
      cls.addEventListener('click', function(e) { e.stopPropagation(); closeTab(tab.id); });

      el.append(fav, ttl, cls);
      el.addEventListener('click', function() { switchTab(tab.id); });
      list.appendChild(el);
    })(tabs[i]);
  }
}

function updateNavBtns() {
  var tab = getTab(activeTabId);
  document.getElementById('back-btn').disabled    = !tab || tab.historyIdx <= 0;
  document.getElementById('forward-btn').disabled = !tab || tab.historyIdx >= tab.history.length - 1;
}

// ── POLL TITLE + FAVICON ──────────────────────────────────────────────
// ScramjetFrame has no titlechange event — poll contentDocument
function pollMeta(id) {
  var tab = getTab(id);
  if (!tab || !tab.iframe) return;
  try {
    var doc = tab.iframe.contentDocument || (tab.iframe.contentWindow && tab.iframe.contentWindow.document);
    if (!doc || !doc.title) return;
    var changed = false;
    if (doc.title && doc.title !== tab.title) {
      tab.title = doc.title.slice(0, 50);
      changed = true;
    }
    var icon = doc.querySelector('link[rel~="icon"], link[rel~="shortcut"]');
    if (icon && icon.href && icon.href !== tab.favicon) {
      tab.favicon = icon.href;
      changed = true;
    }
    if (changed) renderTabs();
  } catch(e) {}
}

// Poll every 1.5s for the active tab
setInterval(function() { pollMeta(activeTabId); }, 1500);

// ── NAVIGATION ────────────────────────────────────────────────────────
function navigateTo(raw, tabId) {
  tabId = tabId || activeTabId;
  var tab = getTab(tabId);
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
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].iframe) tabs[i].iframe.style.display = 'none';
  }
  if (tab.iframe) tab.iframe.style.display = 'block';
  if (tabId === activeTabId) document.getElementById('address-bar').value = url;
  renderTabs();
  updateNavBtns();
  showLoadingBar();

  if (tab.frame) {
    ensureTransport().then(function() {
      try { tab.frame.go(url); } catch(e) { console.error('[pysium] go():', e); }
      hideLoadingBar();
    });
  }
}

function goHome() {
  var tab = getTab(activeTabId);
  if (tab) tab.url = '';
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].iframe) tabs[i].iframe.style.display = 'none';
  }
  showHome();
  document.getElementById('address-bar').value = '';
  renderTabs();
  updateNavBtns();
}

function goBack() {
  var tab = getTab(activeTabId);
  if (!tab || tab.historyIdx <= 0) return;
  tab.historyIdx--;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  showFrame();
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].iframe) tabs[i].iframe.style.display = 'none';
  }
  if (tab.iframe) tab.iframe.style.display = 'block';
  updateNavBtns();
  showLoadingBar();
  if (tab.frame) ensureTransport().then(function() {
    try { tab.frame.back ? tab.frame.back() : tab.frame.go(tab.url); } catch(e){}
    hideLoadingBar();
  });
}

function goForward() {
  var tab = getTab(activeTabId);
  if (!tab || tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  tab.url = tab.history[tab.historyIdx];
  document.getElementById('address-bar').value = tab.url;
  showFrame();
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].iframe) tabs[i].iframe.style.display = 'none';
  }
  if (tab.iframe) tab.iframe.style.display = 'block';
  updateNavBtns();
  showLoadingBar();
  if (tab.frame) ensureTransport().then(function() {
    try { tab.frame.forward ? tab.frame.forward() : tab.frame.go(tab.url); } catch(e){}
    hideLoadingBar();
  });
}

function reloadTab() {
  var tab = getTab(activeTabId);
  if (!tab || !tab.url || !tab.frame) return;
  showLoadingBar();
  ensureTransport().then(function() {
    try { tab.frame.reload ? tab.frame.reload() : tab.frame.go(tab.url); } catch(e){}
    hideLoadingBar();
  });
}

// ── LOADING BAR ───────────────────────────────────────────────────────
function showLoadingBar() {
  var b = document.getElementById('loading-bar');
  if (b) { b.style.width = '0'; b.style.opacity = '1'; b.style.width = '80%'; }
}
function hideLoadingBar() {
  var b = document.getElementById('loading-bar');
  if (!b) return;
  b.style.width = '100%';
  setTimeout(function() { b.style.opacity = '0'; setTimeout(function() { b.style.width = '0'; }, 300); }, 200);
}

// ── OPEN IN NEW TAB (popout) ───────────────────────────────────────────
function openInNewTab() {
  var tab = getTab(activeTabId);
  if (!tab || !tab.url) return;
  // Open the real URL in a new browser tab
  window.open(tab.url, '_blank');
}

// ── FULLSCREEN (iframe content only) ──────────────────────────────────
function toggleFullscreen() {
  var tab = getTab(activeTabId);
  var el = (tab && tab.iframe) ? tab.iframe : document.getElementById('frame-container');
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  }
}

// ── CLOAK ─────────────────────────────────────────────────────────────
function applyCloak(title, fav) {
  document.title = title || CLOAK_DEFAULTS.title;
  var el = document.getElementById('cloak-favicon');
  if (el) el.href = fav || CLOAK_DEFAULTS.favicon;
}

function loadCloakSettings() {
  var s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
  cloakEnabled = s.enabled !== false;
  var title = s.title   || '';
  var fav   = s.favicon || '';
  var auto  = s.autoCloak !== false;
  document.getElementById('cloak-toggle').checked      = cloakEnabled;
  document.getElementById('cloak-title').value         = title;
  document.getElementById('cloak-favicon-url').value   = fav;
  document.getElementById('cloak-auto-toggle').checked = auto;
  if (cloakEnabled && auto && title) applyCloak(title, fav);
}

function saveCloakSettings() {
  var title = document.getElementById('cloak-title').value.trim();
  var fav   = document.getElementById('cloak-favicon-url').value.trim();
  cloakEnabled = document.getElementById('cloak-toggle').checked;
  var auto  = document.getElementById('cloak-auto-toggle').checked;
  localStorage.setItem('pysium_cloak', JSON.stringify({ enabled:cloakEnabled, title:title, favicon:fav, autoCloak:auto }));
  if (cloakEnabled && title) applyCloak(title, fav);
  else if (!cloakEnabled) { document.title = 'Pysium'; document.getElementById('cloak-favicon').href = '/favicon.ico'; }
}

// Autosave settings on any input change
function autosaveSettings() {
  saveCloakSettings();
  var url = document.getElementById('panic-url-input').value.trim();
  if (url) { PANIC_URL = url; localStorage.setItem('pysium_panic', url); }
  SEARCH_ENGINE = document.getElementById('engine-select').value;
  localStorage.setItem('pysium_engine', SEARCH_ENGINE);
}

// ── BATTERY ───────────────────────────────────────────────────────────
function initBattery() {
  if (!navigator.getBattery) return;
  navigator.getBattery().then(function(bat) {
    function update() {
      var pct = Math.round(bat.level * 100);
      document.getElementById('batt-pct').textContent    = pct + '%';
      document.getElementById('batt-status').textContent = bat.charging ? 'Charging' : (pct <= 20 ? 'Low' : 'Battery');
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

// ── SETTINGS MODAL ────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

// ── SPLASH SCREEN ─────────────────────────────────────────────────────
function hideSplash() {
  var splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash-out');
  setTimeout(function() { splash.remove(); }, 600);
}

// ── EARLY CLOAK ───────────────────────────────────────────────────────
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('pysium_cloak') || '{}');
    if (s.enabled !== false && s.autoCloak !== false && s.title) {
      document.title = s.title;
      if (s.favicon) document.getElementById('cloak-favicon').href = s.favicon;
    }
  } catch(e) {}
}());

// ── WIRE UP ───────────────────────────────────────────────────────────
// Nav
document.getElementById('home-btn').addEventListener('click', goHome);
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('forward-btn').addEventListener('click', goForward);
document.getElementById('reload-btn').addEventListener('click', reloadTab);
document.getElementById('address-bar').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); navigateTo(this.value); }
});

// Home search
document.getElementById('sj-address').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); var v = this.value.trim(); if (v) { navigateTo(v); this.value=''; } }
});

// Shortcuts
document.querySelectorAll('.shortcut').forEach(function(a) {
  a.addEventListener('click', function(e) { e.preventDefault(); if (a.dataset.url) navigateTo(a.dataset.url); });
});

// New tab
document.getElementById('new-tab-btn').addEventListener('click', function() { createTab(); });

// Open in new browser tab
document.getElementById('newtab-btn').addEventListener('click', openInNewTab);

// Fullscreen — fullscreens the iframe content only
var fsBtn = document.getElementById('fullscreen-btn');
fsBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', function() {
  fsBtn.innerHTML = document.fullscreenElement
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
});

// Panic
document.getElementById('panic-btn').addEventListener('click', function() { window.location.replace(PANIC_URL); });
document.addEventListener('keydown', function(e) { if (e.altKey && e.key === 'x') window.location.replace(PANIC_URL); });

// Settings open/close
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});

// Modal tabs
document.querySelectorAll('.mtab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.mtab').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.mpane').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('mpane-' + btn.dataset.tab).classList.add('active');
  });
});

// Cloak presets
document.querySelectorAll('.preset-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.getElementById('cloak-title').value       = btn.dataset.title;
    document.getElementById('cloak-favicon-url').value = btn.dataset.favicon;
    autosaveSettings();
  });
});

// about:blank cloak
document.getElementById('ab-cloak-btn').addEventListener('click', function() {
  var title = document.getElementById('cloak-title').value.trim() || 'Pysium';
  var fav   = document.getElementById('cloak-favicon-url').value.trim() || '/favicon.ico';
  var w = window.open('about:blank', '_blank');
  if (!w) { alert('Allow popups first.'); return; }
  // Panic still works in AB cloak — we inject a keydown listener
  var panicScript = 'document.addEventListener("keydown",function(e){if(e.altKey&&e.key==="x")window.location.replace(' + JSON.stringify(PANIC_URL) + ')});';
  w.document.write('<!doctype html><html><head><title>'+title+'</title><link rel="icon" href="'+fav+'"/><style>*{margin:0;padding:0;border:none;overflow:hidden}html,body,iframe{width:100%;height:100%;display:block}</style><script>'+panicScript+'<\/script></head><body><iframe src="'+location.href+'" allow="fullscreen" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"></iframe></body></html>');
  w.document.close();
});

// Autosave all settings on change
['cloak-toggle','cloak-auto-toggle','cloak-title','cloak-favicon-url','panic-url-input','engine-select'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', autosaveSettings);
  if (el && (el.tagName === 'INPUT' && el.type === 'text')) el.addEventListener('input', autosaveSettings);
});

// Init
loadCloakSettings();
document.getElementById('panic-url-input').value = PANIC_URL;
document.getElementById('engine-select').value   = SEARCH_ENGINE;
initBattery();

// Hide splash after short delay
setTimeout(hideSplash, 1800);

// Open first tab
createTab();
updateNavBtns();
