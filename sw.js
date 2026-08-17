"use strict";
/* PsySynthPro service worker v5 — network-first:
   online  -> always fresh from network (cache updated in background)
   offline -> last good copy from cache
   This eliminates stale-cache failure modes from earlier cache-first versions. */

const CACHE = 'psysynthpro-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './css/synth.css',
  './src/presets.js',
  './src/wavetable.js',
  './src/synth-engine.js',
  './src/knob.js',
  './src/midi.js',
  './src/viz3d.js',
  './src/recorder.js',
  './src/arpeggiator.js',
  './src/sequencer.js',
  './src/midi-export.js',
  './src/ui.js'
];

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
        return hit || caches.match('./index.html');
      });
    })
  );
});
