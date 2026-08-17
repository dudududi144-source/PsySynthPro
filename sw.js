"use strict";
/* PsySynthPro service worker — offline-first cache (Phase 9) */

const CACHE = 'psysynthpro-v4';
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
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
