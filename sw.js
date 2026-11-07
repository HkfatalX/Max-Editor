// Max Editor — service worker: funciona offline; aviso de update é feito pelo app (version.json)
const CACHE = 'maxeditor-shell-v2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/storage.js', 'js/state.js', 'js/engine.js', 'js/media.js', 'js/files.js',
  'js/export.js', 'js/auth.js', 'js/permissions.js', 'js/templates.js', 'js/updater.js', 'js/icons.js', 'js/timeline.js', 'js/ui.js', 'js/panels.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png', 'assets/brand/max-editor-foto.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // sempre da rede
  // rede primeiro (pega versão nova quando online), cache como reserva offline
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
