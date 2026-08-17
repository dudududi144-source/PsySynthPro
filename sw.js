/* PsySynthPro — service worker intentionally DISABLED.
   SW caching caused stale-page / blank-panel bugs, so the app is now served as a
   single self-contained bundle with no worker. If an old registration still points
   here, this worker self-destructs immediately. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    self.registration.unregister().then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function () { /* never intercept */ });
