const CACHE_NAME = 'ai-accountant-shell-v3';

// Hashed, immutable build assets (JS/CSS/fonts)
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

  // HTML document / app shell: NETWORK-FIRST
  const isNav = req.mode === 'navigate';
  const isHtml = url.pathname === '/' || url.pathname === '/index.html';
  if (isNav || isHtml) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets: NETWORK-FIRST with cache fallback to avoid stale chunk 404s on redeploy
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && req.method === 'GET' && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
