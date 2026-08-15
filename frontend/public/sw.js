const CACHE_NAME = 'ai-accountant-shell-v2';

// Hashed, immutable build assets (JS/CSS/fonts) are safe to cache-first.
// Map asset URLs -> cache-busted key so redeploys fetch the new chunk.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const req = event.request;

  // API calls always go straight to the network (Python backend).
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML document / app shell: NETWORK-FIRST so every deploy serves the
  // latest index.html (with fresh chunk hashes). Fall back to cache offline.
  const isNav = req.mode === 'navigate';
  const isHtml = url.pathname === '/' || url.pathname === '/index.html';
  if (isNav || isHtml) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then(c => c || fetch(req)))
    );
    return;
  }

  // Everything else (hashed assets): CACHE-FIRST with network fallback.
  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
