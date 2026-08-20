/* PsySynthPro SW v10: offline-capable PWA.
   navigate = network-first (always fresh shell); assets = stale-while-revalidate (fast + offline). */
var CACHE = 'psy-v10';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(['manifest.json', 'assets/icon.svg', 'psysynth-worklet.js']);
  }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }
  var url = new URL(e.request.url);
  if (url.origin === location.origin && e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        var fresh = fetch(e.request).then(function (r) {
          if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
          return r;
        }).catch(function () { return hit; });
        return hit || fresh;
      })
    );
  }
});
