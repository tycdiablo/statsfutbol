// Offline support: app shell cached, network-first for code so updates arrive quickly.
const CACHE = 'statsfutbol-v9';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/cloud.js', 'js/config.js', 'js/util.js', 'js/icons.js', 'js/ui.js', 'js/stats.js',
  'js/forms.js', 'js/components.js', 'js/session.js', 'js/demo.js', 'js/playoffs.js', 'js/import.js', 'js/lineup.js', 'js/media.js', 'js/share.js', 'js/views/shared.js',
  'js/views/home.js', 'js/views/matches.js', 'js/views/tournaments.js', 'js/views/career.js', 'js/views/notes.js', 'js/views/settings.js',
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
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !isFont) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
