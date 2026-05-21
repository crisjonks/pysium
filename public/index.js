"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	try {
		await registerSW();
	} catch (err) {
		error.textContent = "Failed to register service worker.";
		errorCode.textContent = err.toString();
		throw err;
	}

	const url = search(address.value, searchEngine.value);

	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";
	document.body.appendChild(frame.frame);
	frame.go(url);
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

// Shortcuts -> proxy
document.querySelectorAll('.shortcut').forEach(s => {
    s.addEventListener('click', (e) => {
        e.preventDefault();
        const url = s.dataset.url;
        const input = document.getElementById('sj-address');
        input.value = url;
        document.getElementById('sj-form').dispatchEvent(new Event('submit'));
    });
});

// AB Cloak - opens current page inside about:blank
function abCloak() {
    const win = window.open('about:blank', '_blank');
    if (!win || win.closed) {
        alert('Popup blocked! Please allow popups for this site.');
        return;
    }
    const iframe = win.document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;margin:0;padding:0;';
    iframe.src = location.href;
    win.document.body.style.margin = '0';
    win.document.title = 'about:blank';
    win.document.body.appendChild(iframe);
    location.replace('https://www.google.com');
}

document.getElementById('cloak-btn')?.addEventListener('click', abCloak);
document.getElementById('ab-cloak')?.addEventListener('click', abCloak);

// Tab Cloak
const cloaks = {
    none: { title: 'Scramjet', icon: 'favicon.webp' },
    google: { title: 'Google', icon: 'https://www.google.com/favicon.ico' },
    classroom: { title: 'Home', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
    docs: { title: 'Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
    drive: { title: 'My Drive - Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png' },
    canvas: { title: 'Dashboard', icon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' }
};

document.getElementById('cloak-preset')?.addEventListener('change', (e) => {
    const c = cloaks[e.target.value];
    document.title = c.title;
    let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.rel = 'shortcut icon';
    link.href = c.icon;
    document.head.appendChild(link);
    localStorage.setItem('cloak', e.target.value);
});

// Load saved cloak
const savedCloak = localStorage.getItem('cloak');
if (savedCloak && cloaks[savedCloak]) {
    document.getElementById('cloak-preset').value = savedCloak;
    document.getElementById('cloak-preset').dispatchEvent(new Event('change'));
}

// Panic key
document.addEventListener('keydown', (e) => {
    if (e.key === '`' && document.getElementById('panic-toggle')?.checked) {
        location.replace('https://www.google.com');
    }
});

