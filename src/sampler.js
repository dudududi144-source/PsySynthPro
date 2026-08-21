"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});
/* Optional real-sample layer: put kick.wav/snare.wav/hatc.wav/hato.wav/shaker.wav in /samples/ and they replace synthesis. */
Psy.Sampler = { buffers: {}, ready: false,
  load: function (ctx) { var self = this; if (this._t) return; this._t = true;
    var names = ['kick', 'snare', 'hatc', 'hato', 'shaker'];
    names.forEach(function (n) { fetch('samples/' + n + '.wav').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function (b) { return ctx.decodeAudioData(b); }).then(function (buf) { self.buffers[n] = buf; self.ready = true; }).catch(function () {}); });
  },
  get: function (lane) { var m = { k: 'kick', s: 'snare', hc: 'hatc', ho: 'hato', sh: 'shaker' }; return this.buffers[m[lane]] || null; }
};
