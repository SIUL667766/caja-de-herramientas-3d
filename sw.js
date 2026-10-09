const CACHE = 'caja3d-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './tools.js', './search.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isCdn = u.hostname === 'cdn.jsdelivr.net';
  if (u.origin !== location.origin && !isCdn) return;
  // red primero para el sitio (siempre fresco), caché como respaldo sin conexión; CDN: caché primero
  if (isCdn) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })));
  else e.respondWith(fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
