var Psy = (window.PsySynth = window.PsySynth || {});

/* CONDUCTOR: autonomous harmonic+rhythmic intelligence.
   Generates bass/lead/pad within key & scale, euclidean rhythms,
   and steers macros/FX end-to-end for evolving arrangements. */

Psy.SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11]
};

function euclid(n, k) {
  var res = [], bucket = 0;
  for (var i = 0; i < n; i++) { bucket += k; if (bucket >= n) { bucket -= n; res.push(1); } else res.push(0); }
  return res;
}

class Conductor {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.key = 45; this.scale = 'minor';
    this.bpm = 141; this.complexity = 0.6;
    this.stepPos = 0; this.bar = 0; this.nextTime = 0;
    this.timer = null; this.padHeld = [];
    this.leadDeg = 0; this.seed = 1;
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  reseed(s) { this.seed = (s || 12345) % 2147483646 + 1; }
  deg2note(deg, oct) {
    var sc = Psy.SCALES[this.scale] || Psy.SCALES.minor;
    var L = sc.length;
    var idx = ((deg % L) + L) % L;
    return this.key + 12 * oct + sc[idx] + 12 * Math.floor(deg / L);
  }
  prog() {
    var P = [[0, 5, 3, 4], [0, 6, 5, 4], [0, 3, 5, 4], [0, 2, 5, 4]];
    return P[this.bar % P.length];
  }
  setEnabled(on) {
    this.enabled = on;
    if (on) { this.startTimer(); } else { this.stopTimer(); this.releasePad(); }
  }
  startTimer() { if (this.timer) return; var self = this; this.nextTime = 0; this.timer = setInterval(function () { self.tick(); }, 25); }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  releasePad() { for (var i = 0; i < this.padHeld.length; i++) this.engine.noteOff(this.padHeld[i]); this.padHeld = []; }
  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    var ctx = this.engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    var stepDur = (60 / this.bpm) / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.stepPos, this.nextTime, stepDur);
      this.stepPos = (this.stepPos + 1) % 16;
      if (this.stepPos === 0) this.bar++;
      this.nextTime += stepDur;
    }
  }
  playStep(i, t, stepDur) {
    var PH = [[0, 5, 3, 4], [0, 6, 5, 4], [0, 3, 5, 4], [0, 2, 5, 4]];
    var root = PH[Math.floor(this.bar / 2) % PH.length][this.bar % 4];
    var drive = this.complexity;
    /* BASS: rolling 16ths on chord root (psytrance) */
    var bassPat = euclid(16, drive > 0.85 ? 16 : (drive > 0.55 ? 8 : 4));
    if (bassPat[i]) {
      var bn = this.deg2note(root, 0);
      var vel = (i % 4 === 0) ? 0.95 : 0.7;
      this.engine.noteOnAt(bn, vel, t);
      this.engine.noteOffAt(bn, t + stepDur * 0.9);
    }
    /* LEAD: euclidean + scale-walk */
    var leadPat = euclid(16, Math.round(2 + drive * 6));
    if (leadPat[i] && this.rnd() < drive * 0.7) {
      this.leadDeg += (this.rnd() < 0.5 ? 1 : (this.rnd() < 0.3 ? 2 : -1));
      if (this.leadDeg > 7) this.leadDeg -= 7; if (this.leadDeg < 0) this.leadDeg += 7;
      var ln = this.deg2note(root + this.leadDeg, 2);
      this.engine.noteOnAt(ln, 0.6, t);
      this.engine.noteOffAt(ln, t + stepDur * (this.rnd() < 0.3 ? 3 : 1.5));
    }
    /* PAD: chord on bar start */
    if (i === 0 && (this.bar % 2 === 0)) {
      this.releasePad();
      var tones = [root, root + 4];
      for (var k = 0; k < 3; k++) { var pn = this.deg2note(tones[k], 1); this.engine.noteOnAt(pn, 0.35, t); this.padHeld.push(pn); }
    }
    /* AUTONOMOUS MACRO MANAGEMENT: filter sweep + space over bars */
    if (i === 0) {
      var ph = (this.bar % 8) / 8;
      var cut = 600 + Math.sin(ph * Math.PI * 2) * 0.5 * 3000 + 2200;
      this.engine.set('cutoff', Math.max(200, Math.min(8000, cut)));
      this.engine.set('reverb', Math.round(25 + Math.sin(ph * Math.PI) * 20));
    }
  }
}

Psy.Conductor = Conductor;
