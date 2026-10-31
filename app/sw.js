// Offline support: network first, cached copy as fallback. Only same-origin files.
const CACHE = 'pogo-radar-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/main.js', 'js/ui.js', 'js/data.js', 'js/store.js', 'js/notify.js',
  'lib/time.js', 'lib/pokemon.js', 'lib/watchlist.js', 'lib/normalize.js', 'lib/dashboard.js', 'lib/sources.js', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname.endsWith('feed.json') ? new Request(url.pathname) : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(url.pathname.endsWith('feed.json') ? new Request(url.pathname) : e.request)
        .then((hit) => hit || caches.match('index.html'))),
  );
});

// Tapping a notification opens the event's source page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.openWindow(url));
});

// Future: self.addEventListener('push', ...) for background alerts from a push server.
