"use strict";
/* PsySynthPro service worker v6 — network-first, minimal surface.
   index.html is a self-contained bundle, so only 3 assets exist. */

const CACHE = 'psysynthpro-v6';
const ASSETS = ['./', './manifest.json', './assets/icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./');
      });
    })
  );
});
