const CACHE = 'beatboss-v1';
const SHELL = [
  '/',
  '/src/db.js',
  '/src/store.js',
  '/src/audio-engine.js',
  '/src/audio-player.js',
  '/src/dash-parser.js',
  '/src/dash-loader.js',
  '/src/addon-service.js',
  '/src/lastfm-service.js',
  '/src/import-service.js',
  '/src/lrclib-handler.js',
  '/src/download-manager.js',
  '/src/media-session.js',
  '/src/ios-audio-unlock.js',
  '/src/router.js',
  '/src/ui/app-shell.js',
  '/src/ui/home.js',
  '/src/ui/search.js',
  '/src/ui/library.js',
  '/src/ui/downloads.js',
  '/src/ui/settings.js',
  '/src/ui/addons.js',
  '/src/ui/player-bar.js',
  '/src/ui/lyrics-view.js',
  '/src/ui/queue-view.js',
  '/src/ui/components.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Worker proxy domains — always network, never cache
const BYPASS = [
  'thevolecitor.workers.dev',
  'lrclib.net',
  'ws.audioscrobbler.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (BYPASS.some(d => url.hostname.includes(d))) return; // pass through
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});
