"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* Minimal pro step-sequencer: per-step velocity / transpose / length / tie. */

const SEQ_LEN = 16;

class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.hold = false;
    this.bpm = 141;
    this.stepIdxDiv = 2;
    this.glide = false;
    this.lastNote = -1;
    this.selected = -1;
    this.steps = [];
    for (let i = 0; i < SEQ_LEN; i++)
      this.steps.push({ on: true, vel: (i % 4 === 0 ? 1 : 0.72), tr: 0, len: 70, tie: false, rat: 1 });
    this.held = []; this.notePtr = 0; this.stepPos = 0; this.nextTime = 0; this.timer = null; this.onStep = null;
    this.root = 45; /* A1 default rolling-bass root when nothing held */
    this.swing = 0; /* 0..60 % swing on offbeats */
    this.drums = { k: [], s: [], h: [] };
    for (let di = 0; di < SEQ_LEN; di++) { this.drums.k.push(di % 4 === 0); this.drums.s.push(di === 4 || di === 12); this.drums.h.push(true); }
    this.human = 0; /* 0..100 % humanize: micro timing+velocity life */
    this.dmix = { k: 0.9, s: 0.7, h: 0.5 };
    this.dmute = { k: false, s: false, h: false };
  }
  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.stepPos = 0; this.notePtr = 0;
      if (this.engine.ctx) this.nextTime = this.engine.ctx.currentTime + 0.08;
      this.startTimer();
    } else {
      this.stopTimer();
      if (!this.hold) this.held = [];
      if (this.lastNote >= 0) { this.engine.noteOff(this.lastNote); this.lastNote = -1; }
    }
  }
  startTimer() { if (this.timer) return; const s = this; this.timer = setInterval(function () { s.tick(); }, 25); }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  toggleStep(i) { this.steps[i].on = !this.steps[i].on; return this.steps[i]; }
  ensureDrumBus() { if (!this.engine.ctx) return; if (this._dbus) return; this._dbus = this.engine.ctx.createGain(); this._dbus.gain.value = 1; this._dbus.connect(this.engine.master || this.engine.fxInput); }
  _noise() { const ctx = this.engine.ctx; if (!this._nb) { const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this._nb = b; } return this._nb; }
  _renderDrums() { if (this._rd || !this.engine.ctx) return; const ctx = this.engine.ctx; const sr = ctx.sampleRate;
    const mk = function (len, fn) { const n = Math.floor(sr * len); const b = ctx.createBuffer(1, n, sr); const dd = b.getChannelData(0); for (let i = 0; i < n; i++) dd[i] = fn(i / sr); return b; };
    this._rd = {
      k: mk(0.32, function (t) { var click = (Math.random() * 2 - 1) * Math.exp(-t / 0.004) * 0.6; var body = Math.sin(2 * Math.PI * (42 * t + 120 * 0.035 * (1 - Math.exp(-t / 0.018)))) * Math.exp(-t / 0.11); return click + body; }),
      s: mk(0.2, function (t) { return (Math.random() * 2 - 1) * 0.7 * Math.exp(-t / 0.06) + Math.sin(2 * Math.PI * 180 * t) * 0.3 * Math.exp(-t / 0.05); }),
      hc: mk(0.06, function (t) { return (Math.random() * 2 - 1) * Math.exp(-t / 0.02); }),
      ho: mk(0.3, function (t) { return (Math.random() * 2 - 1) * Math.exp(-t / 0.12); })
    }; }
  _play(buf, t, lvl) { const ctx = this.engine.ctx; const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = lvl; src.connect(g); g.connect(this._dbus); src.start(t); }
  kick(t) { if (this.dmute.k) return; this.ensureDrumBus(); this._renderDrums(); if (this._rd) this._play(this._rd.k, t, this.dmix.k);
    var fx = this.engine.fxInput; if (fx && fx.gain) { fx.gain.cancelScheduledValues(t); fx.gain.setValueAtTime(0.45, t); fx.gain.setTargetAtTime(1.0, t + 0.03, 0.11); } }
  snare(t) { if (this.dmute.s) return; this.ensureDrumBus(); this._renderDrums(); if (this._rd) this._play(this._rd.s, t, this.dmix.s); }
  hat(t, open) { if (this.dmute.h) return; this.ensureDrumBus(); this._renderDrums(); if (this._rd) this._play(open ? this._rd.ho : this._rd.hc, t, this.dmix.h); }


    toggleDrum(lane, i) { this.drums[lane][i] = !this.drums[lane][i]; return this.drums[lane][i]; }
  style(name) {
    const S = {
      'PSY FULL-ON': { line: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], acc: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], k: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], s: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], h: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], swing: 0 },
      'DARK PROG': { line: [0,0,3,0,0,0,3,0,0,0,5,0,3,0,2,0], acc: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], k: [1,0,0,0,1,0,0,1,1,0,0,0,1,0,0,0], s: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1], h: [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0], swing: 8 },
      'HI-TECH': { line: [0,3,0,5,0,3,0,7,0,3,0,5,0,7,10,7], acc: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], k: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0], s: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], h: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], swing: 0 },
      'GOA': { line: [0,0,7,0,5,0,3,0,0,0,7,0,5,0,3,2], acc: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], k: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], s: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], h: [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1], swing: 12 }
    };
    const g = S[name]; if (!g) return;
    for (let i = 0; i < SEQ_LEN; i++) {
      this.steps[i].on = true; this.steps[i].tr = g.line[i]; this.steps[i].vel = g.acc[i] ? 1 : 0.7; this.steps[i].len = 75; this.steps[i].tie = false; this.steps[i].rat = (name === 'HI-TECH' && i % 2 === 1) ? 2 : 1;
      this.drums.k[i] = !!g.k[i]; this.drums.s[i] = !!g.s[i]; this.drums.h[i] = !!g.h[i];
    }
    this.swing = g.swing;
  }
    chords() {
    const deg = [0,0,0,0, 3,3,3,3, 5,5,5,5, 7,7,3,3];
    for (let i = 0; i < SEQ_LEN; i++) { this.steps[i].on = (i % 4 === 0); this.steps[i].tr = deg[i]; this.steps[i].tie = false; this.steps[i].len = 60; this.steps[i].vel = (i % 8 === 0) ? 1 : 0.8; this.steps[i].rat = 1; }
  }
    melodic() {
    const line = [0,0,3,0, 5,0,3,0, 0,0,7,5, 3,0,2,0];
    for (let i = 0; i < SEQ_LEN; i++) {
      this.steps[i].on = true; this.steps[i].tr = line[i];
      this.steps[i].tie = (line[i] === line[(i+1)%SEQ_LEN]);
      this.steps[i].len = (i % 4 === 3) ? 95 : 80; this.steps[i].vel = (i % 4 === 0) ? 1 : 0.75; this.steps[i].rat = 1;
    }
  }

  setStep(i, patch) { Object.assign(this.steps[i], patch); }
  noteOn(note, vel) {
    if (!this.enabled) { this.engine.noteOn(note, vel); return; }
    if (!this.held.some(function (h) { return h.note === note; })) {
      this.held.push({ note: note, vel: vel || 0.8 });
      this.held.sort(function (a, b) { return a.note - b.note; });
    }
  }
  noteOff(note) {
    if (!this.enabled) { this.engine.noteOff(note); return; }
    if (this.hold) return;
    this.held = this.held.filter(function (h) { return h.note !== note; });
  }
  panic() { this.held = []; }
  loadPattern(name) {
    const p = Psy.SEQ_PATTERNS[name];
    if (!p) return false;
    for (let i = 0; i < SEQ_LEN; i++) {
      this.steps[i].on = p.g[i] === 1;
      this.steps[i].vel = p.a[i] === 1 ? 1 : 0.72;
      this.steps[i].tie = false; this.steps[i].tr = 0; this.steps[i].len = 70; this.steps[i].rat = 1;
    }
    return true;
  }
  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    const stepBeats = Psy.ARP_STEPS[this.stepIdxDiv].beats;
    const stepDur = (60 / this.bpm) * stepBeats;
    try {
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.stepPos;
      const st = this.steps[i];
      const tStep = this.nextTime + ((i % 2 === 1) ? (this.swing / 100) * stepDur * 0.5 : 0);
      var C = window.__cond;
      try { if (this.drums) {
        if (this.drums.k[i]) this.kick(tStep);
        if (this.drums.s[i]) this.snare(tStep);
        if (this.drums.h[i]) this.hat(tStep, (i % 2 === 1));
      } } catch (e) {}
      const prev = this.steps[(i + SEQ_LEN - 1) % SEQ_LEN];
      const src = this.held.length ? this.held : [{ note: this.root, vel: 0.85 }];
      if (st.on && src.length) {
        const base = src[this.notePtr % src.length].note;
        this.notePtr++;
        const note = base + (st.tr | 0);
        let vel = Math.max(0.05, Math.min(1, st.vel));
        const gateSec = Math.max(0.03, stepDur * ((st.len == null ? 70 : st.len) / 100));
        const t = this.nextTime + ((i % 2 === 1) ? (this.swing / 100) * stepDur * 0.5 : 0);
        const hum = (this.human || 0) / 100;
        const jt = t + (Math.random() - 0.5) * hum * stepDur * 0.12;
        vel = Math.max(0.05, Math.min(1, vel * (1 + (Math.random() - 0.5) * hum * 0.35)));
        const rat = Math.max(1, Math.min(4, st.rat || 1));
        if (rat === 1) {
          const cont = prev.on && prev.tie && this.lastNote === note;
          if (!cont) this.engine.noteOnAt(note, vel, jt);
          if (!st.tie) this.engine.noteOffAt(note, jt + gateSec);
        } else {
          const sub = stepDur / rat;
          for (let r = 0; r < rat; r++) {
            this.engine.noteOnAt(note, vel, jt + r * sub);
            this.engine.noteOffAt(note, jt + r * sub + Math.min(gateSec, sub * 0.9));
          }
        }
        this.lastNote = st.tie ? note : -1;
        if (this.onStep) this.onStep(i, note);
      } else {
        this.lastNote = -1;
        if (this.onStep) this.onStep(i, -1);
      }
      this.stepPos = (i + 1) % SEQ_LEN;
      this.nextTime += stepDur;
    }
    } catch (e) { /* never kill the loop */ }
  }
}

Psy.SEQ_PATTERNS = {
  'ROLLING 16':   { g: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], a: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] },
  'OFFBEAT BASS': { g: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0], a: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
  'PSY PUMP':     { g: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], a: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
  'ACID LINE':    { g: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0], a: [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0] },
  'TRANCE STAB':  { g: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0], a: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] },
  'GATE 8':       { g: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], a: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  'DARK ROLL':    { g: [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,0,1], a: [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0] },
  'GOA BLEEP':    { g: [1,0,0,0, 0,1,0,0, 0,0,0,1, 0,0,0,0], a: [1,0,0,0, 0,1,0,0, 0,0,0,1, 0,0,0,0] }
};

Psy.SEQ_LEN = SEQ_LEN;
Psy.Sequencer = Sequencer;
