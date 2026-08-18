"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ Procedural Variation Generator ═══════════
   Generates musical-quality variations of a base preset by varying
   parameters within musical ranges (not random garbage). Seeded (mulberry32)
   so every variation is reproducible.                                */

/* mulberry32 seeded PRNG */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Psy.Variation = {
  /* vary a value by up to +/-amt, optionally clamped to [lo,hi] */
  _vary: function (rng, base, amt, lo, hi) {
    let v = base + (rng() * 2 - 1) * amt;
    if (lo !== undefined) v = Math.max(lo, v);
    if (hi !== undefined) v = Math.min(hi, v);
    return v;
  },

  /* Generate a variation of a base preset. seed makes it reproducible.
     intensity 0..1 controls how far parameters drift. */
  generate: function (base, seed, intensity) {
    const rng = mulberry32(seed);
    const it = (intensity === undefined) ? 0.5 : intensity;
    const p = Object.assign({}, base);

    /* timbre: keep wave & filterType (preserve character), vary color */
    p.detune = this._vary(rng, base.detune, 8 * it, -50, 50);
    p.unison = base.unison; /* keep voicing structure */
    p.spread = this._vary(rng, base.spread, 6 * it, 0, 50);
    p.sub = this._vary(rng, base.sub, 15 * it, 0, 100);
    p.noise = this._vary(rng, base.noise, 10 * it, 0, 60);

    /* FM: keep ratio (musical interval), vary depth */
    p.fmRatio = base.fmRatio;
    p.fmDepth = this._vary(rng, base.fmDepth, 12 * it, 0, 100);

    /* filter: vary cutoff logarithmically around base, vary res/env */
    const cutMul = Math.pow(2, (rng() * 2 - 1) * 1.2 * it); /* up to ~2.3x either way */
    p.cutoff = Math.max(40, Math.min(16000, base.cutoff * cutMul));
    p.res = this._vary(rng, base.res, 3 * it, 0.1, 20);
    p.filterEnv = this._vary(rng, base.filterEnv, 15 * it, 0, 100);

    /* envelope: vary within musical bounds, keep shape family */
    p.attack = this._vary(rng, base.attack, base.attack * 0.5 * it, 1, 3000);
    p.decay = this._vary(rng, base.decay, base.decay * 0.4 * it, 10, 3000);
    p.sustain = this._vary(rng, base.sustain, 12 * it, 0, 100);
    p.release = this._vary(rng, base.release, base.release * 0.4 * it, 30, 5000);

    /* LFO: vary rate within musical range, vary depth */
    p.lfoRate = this._vary(rng, base.lfoRate, base.lfoRate * 0.5 * it, 0.1, 20);
    p.lfoDepth = this._vary(rng, base.lfoDepth, 15 * it, 0, 100);

    /* FX: vary within musical range */
    p.reverb = this._vary(rng, base.reverb, 15 * it, 0, 100);
    p.delay = this._vary(rng, base.delay, 12 * it, 0, 100);
    p.master = this._vary(rng, base.master, 8 * it, 60, 95);

    return p;
  },

  /* Generate N named variations of a base preset */
  generateMany: function (base, baseName, count, intensity) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const seed = (baseName.length * 7919) + i * 104729 + 13;
      out.push({
        name: baseName + ' V' + (i + 1),
        patch: this.generate(base, seed, intensity)
      });
    }
    return out;
  }
};
