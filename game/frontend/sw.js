const CACHE = 'gfy-v27';

const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/styles.css',
  '/css/landing.css',
  '/css/profile.css',
  '/css/profile-gate.css',
  '/css/card-stacks.css',
  '/css/game-theatre.css',
  '/css/gfy-board.css',
  '/css/book-celebration.css',
  '/css/ask-flow.css',
  '/css/avatars.css',
  '/js/app.js',
  '/js/avatar.js',
  '/js/landing.js',
  '/js/api.js',
  '/js/game.js',
  '/js/bac.js',
  '/js/mobile.js',
  '/js/profile.js',
  '/js/session-memory.js',
  '/js/chaos-events.js',
  '/js/sidegames/hub.js',
  '/js/sidegames/uno.js',
  '/offline.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never cache WebSocket upgrades
  if (url.pathname.startsWith('/ws')) return;

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  const isAsset = url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/');

  // JS/CSS: network-first so profile & game updates ship without stale PWA cache
  if (isAsset) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then(cached => cached ?? new Response('', { status: 408 })))
    );
    return;
  }

  // HTML + rest: cache-first; network fallback → offline page
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('/offline.html');
          return new Response('', { status: 408 });
        });
    })
  );
});
