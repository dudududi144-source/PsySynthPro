"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});
const SEQ_LEN = 16;
const LANES = ['k','s','hc','ho','sh'];

class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false; this.hold = false;
    this.bpm = 141; this.stepIdxDiv = 2;
    this.glide = false; this.lastNote = -1; this.selected = -1;
    this.steps = [];
    for (let i = 0; i < SEQ_LEN; i++) this.steps.push({ on: i % 2 === 0, vel: (i % 4 === 0 ? 1 : 0.75), tr: 0, len: 75, tie: false, rat: 1 });
    this.drums = { k: [], s: [], hc: [], ho: [], sh: [] };
    for (let i = 0; i < SEQ_LEN; i++) {
      this.drums.k.push(i % 4 === 0);
      this.drums.s.push(i === 4 || i === 12);
      this.drums.hc.push(i % 2 === 0);
      this.drums.ho.push(i % 2 === 1);
      this.drums.sh.push(true);
    }
    this.dmix = { k: 1.0, s: 0.7, hc: 0.45, ho: 0.5, sh: 0.35 };
    this.dmute = { k: false, s: false, hc: false, ho: false, sh: false };
    this.offbass = true;
    this.held = []; this.notePtr = 0; this.stepPos = 0; this.nextTime = 0; this.timer = null; this.onStep = null;
    this.root = 45; this.swing = 0; this.human = 0; this.barCount = 0;
  }
  setEnabled(on) { this.enabled = on; if (on) { this.stepPos = 0; this.notePtr = 0; if (this.engine.ctx) this.nextTime = this.engine.ctx.currentTime + 0.08; this.startTimer(); } else { this.stopTimer(); if (!this.hold) this.held = []; if (this.lastNote >= 0) { this.engine.noteOff(this.lastNote); this.lastNote = -1; } } }
  startTimer() { if (this.timer) return; const s = this; this.timer = setInterval(function () { s.tick(); }, 25); }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  toggleStep(i) { this.steps[i].on = !this.steps[i].on; return this.steps[i]; }
  setStep(i, p) { Object.assign(this.steps[i], p); }
  toggleDrum(lane, i) { this.drums[lane][i] = !this.drums[lane][i]; return this.drums[lane][i]; }
  noteOn(n, v) { if (!this.enabled) { this.engine.noteOn(n, v); return; } if (!this.held.some(h => h.note === n)) { this.held.push({ note: n, vel: v || 0.8 }); this.held.sort((a, b) => a.note - b.note); } }
  noteOff(n) { if (!this.enabled) { this.engine.noteOff(n); return; } if (this.hold) return; this.held = this.held.filter(h => h.note !== n); }
  panic() { this.held = []; }
  loadPattern(name) { const p = Psy.SEQ_PATTERNS[name]; if (!p) return false; for (let i = 0; i < SEQ_LEN; i++) { this.steps[i].on = p.g[i] === 1; this.steps[i].vel = p.a[i] === 1 ? 1 : 0.72; this.steps[i].tie = false; this.steps[i].tr = 0; this.steps[i].len = 75; this.steps[i].rat = 1; } return true; }
  melodic() { const l = [0,0,3,0,5,0,3,0,0,0,7,5,3,0,2,0]; for (let i = 0; i < SEQ_LEN; i++) { this.steps[i].on = true; this.steps[i].tr = l[i]; this.steps[i].tie = (l[i] === l[(i+1)%SEQ_LEN]); this.steps[i].len = (i%4===3)?95:80; this.steps[i].vel = (i%4===0)?1:0.75; this.steps[i].rat = 1; } }
  chords() { const d = [0,0,0,0,3,3,3,3,5,5,5,5,7,7,3,3]; for (let i = 0; i < SEQ_LEN; i++) { this.steps[i].on = (i%4===0); this.steps[i].tr = d[i]; this.steps[i].tie = false; this.steps[i].len = 60; this.steps[i].vel = (i%8===0)?1:0.8; this.steps[i].rat = 1; } }
  style(name) {
    const S = {
      'PSY FULL-ON': { line:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], acc:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], k:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], s:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hc:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], ho:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], sh:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], swing:0 },
      'DARK PROG': { line:[0,0,3,0,0,0,3,0,0,0,5,0,3,0,2,0], acc:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], k:[1,0,0,0,1,0,0,1,1,0,0,0,1,0,0,0], s:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1], hc:[1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0], ho:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0], sh:[1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1], swing:8 },
      'HI-TECH': { line:[0,3,0,5,0,3,0,7,0,3,0,5,0,7,10,7], acc:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], k:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0], s:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hc:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], ho:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], sh:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], swing:0 },
      'GOA': { line:[0,0,7,0,5,0,3,0,0,0,7,0,5,0,3,2], acc:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], k:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], s:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hc:[1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1], ho:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], sh:[1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1], swing:12 }
    };
    const g = S[name]; if (!g) return;
    for (let i = 0; i < SEQ_LEN; i++) {
      this.steps[i].on = true; this.steps[i].tr = g.line[i]; this.steps[i].vel = g.acc[i] ? 1 : 0.7; this.steps[i].len = 75; this.steps[i].tie = false; this.steps[i].rat = (name === 'HI-TECH' && i % 2 === 1) ? 2 : 1;
      this.drums.k[i] = !!g.k[i]; this.drums.s[i] = !!g.s[i]; this.drums.hc[i] = !!g.hc[i]; this.drums.ho[i] = !!g.ho[i]; this.drums.sh[i] = !!g.sh[i];
    }
    this.swing = g.swing;
  }
  ensureDrumBus() { if (!this.engine.ctx) return; if (this._dbus) return; this._dbus = this.engine.ctx.createGain(); this._dbus.gain.value = 1; this._dbus.connect(this.engine.master || this.engine.fxInput); }
  _renderDrums() { if (this._rd || !this.engine.ctx) return; const ctx = this.engine.ctx; const sr = ctx.sampleRate;
    const mk = function (len, fn) { const n = Math.floor(sr * len); const b = ctx.createBuffer(1, n, sr); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = fn(i / sr); return b; };
    this._rd = {
      k: mk(0.34, function (t) { var click = (Math.random()*2-1)*Math.exp(-t/0.0035)*0.7; var thump = Math.sin(2*Math.PI*(44*t+130*0.04*(1-Math.exp(-t/0.016))))*Math.exp(-t/0.12); var sub = Math.sin(2*Math.PI*48*t)*Math.exp(-t/0.16)*0.6; var x = click+thump+sub; return Math.tanh(x*1.6); }),
      s: mk(0.22, function (t) { return ((Math.random()*2-1)*0.7*Math.exp(-t/0.07) + Math.sin(2*Math.PI*190*t)*0.35*Math.exp(-t/0.05)); }),
      hc: mk(0.05, function (t) { return (Math.random()*2-1)*Math.exp(-t/0.015); }),
      ho: mk(0.3, function (t) { return (Math.random()*2-1)*Math.exp(-t/0.13); }),
      sh: mk(0.09, function (t) { return (Math.random()*2-1)*Math.exp(-t/0.03)*Math.sin(2*Math.PI*40*t+1); })
    }; }
  _play(buf, t, lvl) { const ctx = this.engine.ctx; const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = lvl; src.connect(g); g.connect(this._dbus); src.start(t); }
  hit(lane, t, open) { if (this.dmute[lane]) return; this.ensureDrumBus(); this._renderDrums(); if (!this._rd) return;
    if (lane === 'k') { this._play(this._rd.k, t, this.dmix.k); var fx = this.engine.fxInput; if (fx && fx.gain) { fx.gain.cancelScheduledValues(t); fx.gain.setValueAtTime(0.4, t); fx.gain.setTargetAtTime(1.0, t + 0.03, 0.12); } }
    else if (lane === 's') this._play(this._rd.s, t, this.dmix.s);
    else if (lane === 'hc') this._play(this._rd.hc, t, this.dmix.hc);
    else if (lane === 'ho') this._play(this._rd.ho, t, this.dmix.ho);
    else if (lane === 'sh') this._play(this._rd.sh, t, this.dmix.sh); }
  _bass(t, f, vel) { const ctx = this.engine.ctx; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(700, t); fl.frequency.exponentialRampToValueAtTime(120, t + 0.12); fl.Q.value = 6; const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(fl); fl.connect(g); g.connect(this.engine.master || this.engine.fxInput); o.start(t); o.stop(t + 0.16); }
  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    const stepBeats = (Psy.ARP_STEPS && Psy.ARP_STEPS[this.stepIdxDiv]) ? Psy.ARP_STEPS[this.stepIdxDiv].beats : 0.25;
    const stepDur = (60 / this.bpm) * stepBeats;
    try {
      while (this.nextTime < ctx.currentTime + 0.12) {
        const i = this.stepPos;
        const st = this.steps[i];
        const tStep = this.nextTime + ((i % 2 === 1) ? (this.swing / 100) * stepDur * 0.5 : 0);
        // drums (lane-gated)
        try {
          if (this.drums.k[i]) this.hit('k', tStep);
          if (this.drums.s[i]) this.hit('s', tStep);
          if (this.drums.hc[i]) this.hit('hc', tStep);
          if (this.drums.ho[i]) this.hit('ho', tStep);
          if (this.drums.sh[i]) this.hit('sh', tStep, );
          if (this.offbass && i % 2 === 1) this._bass(tStep, 440 * Math.pow(2, (this.root - 12 - 69) / 12), 0.5);
        } catch (e) {}
        const src = this.held.length ? this.held : [{ note: this.root, vel: 0.85 }];
        if (st.on && src.length) {
          const base = src[this.notePtr % src.length].note; this.notePtr++;
          const note = base + (st.tr | 0);
          let vel = Math.max(0.05, Math.min(1, st.vel));
          const gateSec = Math.max(0.03, stepDur * ((st.len == null ? 75 : st.len) / 100));
          const hum = (this.human || 0) / 100;
          const jt = tStep + (Math.random() - 0.5) * hum * stepDur * 0.12;
          vel = Math.max(0.05, Math.min(1, vel * (1 + (Math.random() - 0.5) * hum * 0.35)));
          const rat = Math.max(1, Math.min(4, st.rat || 1));
          if (rat === 1) { this.engine.noteOnAt(note, vel, jt); if (!st.tie) this.engine.noteOffAt(note, jt + gateSec); }
          else { const sub = stepDur / rat; for (let r = 0; r < rat; r++) { this.engine.noteOnAt(note, vel, jt + r * sub); this.engine.noteOffAt(note, jt + r * sub + Math.min(gateSec, sub * 0.9)); } }
          this.lastNote = st.tie ? note : -1;
          if (this.onStep) this.onStep(i, note);
        } else { this.lastNote = -1; if (this.onStep) this.onStep(i, -1); }
        this.stepPos = (i + 1) % SEQ_LEN;
        if (this.stepPos === 0) this.barCount++;
        this.nextTime += stepDur;
      }
    } catch (e) {}
  }
}

Psy.SEQ_PATTERNS = {
  'ROLLING 16': { g:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], a:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0] },
  'OFFBEAT BASS': { g:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0], a:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0] },
  'PSY PUMP': { g:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], a:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0] },
  'ACID LINE': { g:[1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], a:[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0] },
  'TRANCE STAB': { g:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0], a:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0] },
  'DARK ROLL': { g:[1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1], a:[1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0] },
  'GOA BLEEP': { g:[1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0], a:[1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0] }
};
Psy.SEQ_LEN = SEQ_LEN;
Psy.SEQ_LANES = LANES;
Psy.Sequencer = Sequencer;
