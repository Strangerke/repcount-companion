// RepCount Companion service worker: offline cache + Android share target.
const CACHE = 'rc-app-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'rc-share').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('file');
      if (file) {
        const c = await caches.open('rc-share');
        await c.put('shared-file', new Response(file, { headers: { 'x-name': encodeURIComponent(file.name || 'shared.csv') } }));
      }
      return Response.redirect('./?shared=1#data', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first (so updates show up), cache as fallback when offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
