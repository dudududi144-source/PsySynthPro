"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ Step Sequencer (Phase 8) ═══════════
   16-step gate pattern with per-step accents. Held notes cycle through
   the active steps; scheduled sample-accurately via the worklet queue
   using the same lookahead technique as the arpeggiator.             */

const SEQ_LEN = 16;

class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.hold = false;
    this.bpm = 141;
    this.stepIdxDiv = 2;   /* Psy.ARP_STEPS index - 1/16 default */
    this.gate = 70;        /* % of step */
    this.steps = [];
    for (let i = 0; i < SEQ_LEN; i++) {
      /* rolling psy default: all gates on, accents on the quarter steps */
      this.steps.push({ on: true, accent: (i % 4 === 0) });
    }
    this.held = [];
    this.notePtr = 0;
    this.stepPos = 0;
    this.nextTime = 0;
    this.timer = null;
    this.onStep = null;   /* callback(pos, note) for UI */
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.stepPos = 0;
      this.notePtr = 0;
      if (this.engine.ctx) this.nextTime = this.engine.ctx.currentTime + 0.08;
      this.startTimer();
    } else {
      this.stopTimer();
      if (!this.hold) this.held = [];
    }
  }

  startTimer() {
    if (this.timer) return;
    const self = this;
    this.timer = setInterval(function () { self.tick(); }, 25);
  }
  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /* 3-state step toggle: off -> on -> accent -> off */
  toggleStep(i) {
    const s = this.steps[i];
    if (!s.on) { s.on = true; s.accent = false; }
    else if (!s.accent) { s.accent = true; }
    else { s.on = false; s.accent = false; }
    return s;
  }

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
      this.steps[i].accent = p.a[i] === 1;
    }
    return true;
  }

  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;

    const stepBeats = Psy.ARP_STEPS[this.stepIdxDiv].beats;
    const stepDur = (60 / this.bpm) * stepBeats;

    while (this.nextTime < ctx.currentTime + 0.12) {
      const st = this.steps[this.stepPos];
      if (st.on && this.held.length > 0) {
        const note = this.held[this.notePtr % this.held.length].note;
        this.notePtr++;
        const vel = st.accent ? 1.0 : 0.72;
        const gateSec = Math.max(0.03, stepDur * (this.gate / 100));
        this.engine.noteOnAt(note, vel, this.nextTime);
        this.engine.noteOffAt(note, this.nextTime + gateSec);
        if (this.onStep) this.onStep(this.stepPos, note);
      } else if (this.onStep) {
        this.onStep(this.stepPos, -1);
      }
      this.stepPos = (this.stepPos + 1) % SEQ_LEN;
      this.nextTime += stepDur;
    }
  }
}


/* ═══════════ PSY-TRANCE PATTERN BANK ═══════════
   16-step gate/accent patterns. g = gate on, A = gate on + accent.
   Step grid: 4 beats x 4 sixteenths (beat heads at 0, 4, 8, 12).   */

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
