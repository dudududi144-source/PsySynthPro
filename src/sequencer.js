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
    this.human = 0; /* 0..100 % humanize: micro timing+velocity life */
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
