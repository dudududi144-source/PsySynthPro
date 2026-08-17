"use strict";
const Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ Arpeggiator (Phase 7) ═══════════
   Web-Audio lookahead scheduler: a 25ms timer schedules steps up to
   120ms ahead with sample-accurate timestamps in the worklet queue.
   Patterns: UP / DOWN / UP-DOWN / RANDOM, multi-octave, hold/latch.  */

const ARP_PATTERNS = ['UP', 'DWN', 'UPDN', 'RND'];
const ARP_STEPS = [
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 }
];

class Arpeggiator {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.hold = false;
    this.bpm = 132;
    this.stepIdxDiv = 2;      /* index into ARP_STEPS (1/16 default) */
    this.pattern = 0;         /* index into ARP_PATTERNS */
    this.gate = 60;           /* % of step */
    this.octaves = 1;
    this.held = [];
    this.stepIdx = 0;
    this.nextTime = 0;
    this.timer = null;
    this.onStep = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.stepIdx = 0;
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

  /* note input — transparent pass-through when disabled */
  noteOn(note, vel) {
    if (!this.enabled) { this.engine.noteOn(note, vel); return; }
    if (!this.held.some(function (h) { return h.note === note; })) {
      this.held.push({ note: note, vel: vel || 0.8 });
    }
  }
  noteOff(note) {
    if (!this.enabled) { this.engine.noteOff(note); return; }
    if (this.hold) return; /* latch mode keeps notes */
    this.held = this.held.filter(function (h) { return h.note !== note; });
  }
  panic() { this.held = []; }

  buildSequence() {
    const sorted = this.held.map(function (h) { return h.note; }).sort(function (a, b) { return a - b; });
    const seq = [];
    for (let o = 0; o < this.octaves; o++) {
      for (let i = 0; i < sorted.length; i++) seq.push(sorted[i] + o * 12);
    }
    return seq;
  }

  pick(seq) {
    const n = seq.length;
    if (n === 0) return -1;
    if (n === 1 || this.pattern === 0) return seq[this.stepIdx % n];
    if (this.pattern === 1) return seq[n - 1 - (this.stepIdx % n)];
    if (this.pattern === 2) {
      const len = n * 2 - 2;
      let i = this.stepIdx % len;
      if (i >= n) i = len - i;
      return seq[i];
    }
    return seq[Math.floor(Math.random() * n)];
  }

  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    const stepBeats = ARP_STEPS[this.stepIdxDiv].beats;
    const stepDur = (60 / this.bpm) * stepBeats;

    while (this.nextTime < ctx.currentTime + 0.12) {
      const seq = this.buildSequence();
      if (seq.length > 0) {
        const note = this.pick(seq);
        const gateSec = Math.max(0.03, stepDur * (this.gate / 100));
        this.engine.noteOnAt(note, 0.82, this.nextTime);
        this.engine.noteOffAt(note, this.nextTime + gateSec);
        if (this.onStep) this.onStep(note, this.stepIdx);
      }
      this.stepIdx++;
      this.nextTime += stepDur;
    }
  }
}

Psy.ARP_PATTERNS = ARP_PATTERNS;
Psy.ARP_STEPS = ARP_STEPS;
Psy.Arpeggiator = Arpeggiator;
