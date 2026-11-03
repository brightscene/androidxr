// Network-first with offline fallback: you always get the newest version
// (and any newly recorded voice clips) when online, and MindLyte still works
// with no connection because everything it plays is generated on-device.
const CACHE = 'mindlyte-v48';
const SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // let the browser stream large audio (range requests) directly
  if (e.request.headers.has('range') || /\.mp3$/.test(new URL(e.request.url).pathname)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // bypass the 10-minute HTTP cache so updates arrive immediately
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
