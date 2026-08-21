"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});
var SEQ_GT = [0, -0.06, 0.04, -0.02, 0, -0.05, 0.03, -0.02, 0, -0.06, 0.04, -0.01, 0, -0.04, 0.03, -0.02];
var SEQ_GV = [0, 0.05, -0.06, 0.03, 0, 0.04, -0.05, 0.02, 0, 0.05, -0.04, 0.02, 0, 0.04, -0.05, 0.02];
const SEQ_LEN = 16;
const LANES = ['k','s','hc','ho','sh'];

class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false; this.hold = false;
    this.bpm = 141; this.stepIdxDiv = 2; this.div = 0.25;
    this.scaleName = 'minor';
    this.glide = false; this.lastNote = -1; this.selected = -1;
    this.steps = [];
    for (let i = 0; i < SEQ_LEN; i++) this.steps.push({ on: i % 2 === 0, vel: (i % 4 === 0 ? 1 : 0.75), tr: 0, len: 75, tie: false, rat: 1, prob: 100, chord: false });
    this.drums = { k: [], s: [], hc: [], ho: [], sh: [] };
    for (let i = 0; i < SEQ_LEN; i++) {
      this.drums.k.push(i % 4 === 0);
      this.drums.s.push(i === 4 || i === 12);
      this.drums.hc.push(i % 2 === 0);
      this.drums.ho.push(i % 2 === 1);
      this.drums.sh.push(true);
    }
    this.dmix = { k: 1.0, s: 0.7, hc: 0.45, ho: 0.5, sh: 0.35 };
    this.dtune = { k: 1, s: 1, hc: 1, ho: 1, sh: 1 };
    this.dpunch = 50; this.dswing = 0;
    this.dmute = { k: false, s: false, hc: false, ho: false, sh: false };
    this.offbass = true; this.fillOn = true; this.ghostOn = true; this.crashOn = true; this.songOn = false; this.songSlot = 0; this.onPatternChanged = null;
    this.held = []; this.notePtr = 0; this.stepPos = 0; this.nextTime = 0; this.timer = null; this.onStep = null;
    this.noteStep = 0; this.drumStep = 0; this.noteTime = null; this.drumTime = null; this.poly = false;
    this.root = 45; this.swing = 0; this.human = 0; this.strum = 0.012; this.legato = false; this.humanDrum = 0; this.barCount = 0;
  }
  setEnabled(on) { this.enabled = on; if (on) { this.stepPos = 0; this.notePtr = 0; if (this.engine.ctx) this.nextTime = this.engine.ctx.currentTime + 0.08; this.startTimer(); } else { this.stopTimer(); if (!this.hold) this.held = []; if (this.lastNote >= 0) { this.engine.noteOff(this.lastNote); this.lastNote = -1; } } }
  startTimer() { if (this.timer) return; const s = this; this.timer = setInterval(function () { s.tick(); }, 25); }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  get len() { return this.steps.length; }
  setLen(n) { n = (n === 32) ? 32 : 16; while (this.steps.length < n) this.steps.push({ on: false, vel: 0.75, tr: 0, len: 75, tie: false, rat: 1 });
    for (const L of ['k','s','hc','ho','sh']) { while (this.drums[L].length < n) this.drums[L].push(false); }
    this.steps.length = n; for (const L of ['k','s','hc','ho','sh']) this.drums[L].length = n; this.stepPos = this.stepPos % n; }
  applyCurve(name) {
    const N = this.steps.length;
    for (let i = 0; i < N; i++) {
      if (name === 'FLAT') this.steps[i].vel = 0.8;
      else if (name === 'ACCENT') this.steps[i].vel = (i % 4 === 0) ? 1 : 0.6;
      else if (name === 'RAMP') this.steps[i].vel = 0.4 + 0.6 * (i / (N - 1));
      else if (name === 'PUMP') this.steps[i].vel = (i % 4 === 2) ? 1 : 0.6;
      else if (name === 'FUNK') this.steps[i].vel = [1,0.5,0.7,0.5,0.9,0.5,0.7,0.6,1,0.5,0.7,0.5,0.9,0.6,0.7,0.8][i % 16];
    }
  }
    mutateDrums() {
    for (let i = 0; i < this.drums.hc.length; i++) {
      if (i % 2 === 1 && Math.random() < 0.2) this.drums.ho[i] = !this.drums.ho[i];
      if (Math.random() < 0.18) this.drums.hc[i] = !this.drums.hc[i];
      if (Math.random() < 0.2) this.drums.sh[i] = !this.drums.sh[i];
      if (i % 4 === 3 && Math.random() < 0.15) this.drums.k[i] = !this.drums.k[i];
    }
    if (this.onPatternChanged) this.onPatternChanged();
  }
    mutateSeq() {
    const degs = [0, 3, 5, 7, 10, 12];
    for (let i = 0; i < this.steps.length; i++) {
      const st = this.steps[i];
      if (Math.random() < 0.3) st.tr = (st.tr + degs[Math.floor(Math.random() * degs.length)] * (Math.random() < 0.5 ? 1 : -1)) % 24;
      if (Math.random() < 0.15) st.on = !st.on;
      if (Math.random() < 0.2) st.vel = 0.5 + Math.random() * 0.5;
      if (Math.random() < 0.12) st.rat = Math.random() < 0.5 ? 2 : 1;
      if (Math.random() < 0.15) st.prob = 60 + Math.floor(Math.random() * 41);
    }
    for (let i = 0; i < this.drums.hc.length; i++) { if (Math.random() < 0.2) this.drums.hc[i] = !this.drums.hc[i]; if (Math.random() < 0.15) this.drums.sh[i] = !this.drums.sh[i]; }
    for (let i = 0; i < this.drums.k.length; i++) { if (i % 4 !== 0 && Math.random() < 0.08) this.drums.k[i] = !this.drums.k[i]; }
  }
    double() { const half = Math.floor(this.steps.length / 2); for (let i = half; i < this.steps.length; i++) { this.steps[i] = Object.assign({}, this.steps[i - half]); for (const L of ['k','s','hc','ho','sh']) this.drums[L][i] = this.drums[L][i - half]; } }
  saveSlot(i) { try { const bank = JSON.parse(localStorage.getItem('psy.seq.v1') || '[]'); bank[i] = { steps: this.steps, drums: this.drums }; localStorage.setItem('psy.seq.v1', JSON.stringify(bank)); } catch (e) {} }
  loadSlot(i) { try { const bank = JSON.parse(localStorage.getItem('psy.seq.v1') || '[]'); if (bank[i]) { this.steps = bank[i].steps; this.drums = bank[i].drums; } } catch (e) {} }
    toggleStep(i) { this.steps[i].on = !this.steps[i].on; return this.steps[i]; }
  static get SCALES() { return { minor: [0,2,3,5,7,8,10], phrygian: [0,1,3,5,7,8,10], major: [0,2,4,5,7,9,11], dorian: [0,2,3,5,7,9,10], harmonic: [0,2,3,5,7,8,11], lydian: [0,2,4,6,7,9,11], mixolydian: [0,2,4,5,7,9,10], blues: [0,3,5,6,7,10], hungarian: [0,2,3,6,7,8,11] }; }
  scale() { return Sequencer.SCALES[this.scaleName] || Sequencer.SCALES.minor; }
  snap(tr) { const sc = this.scale(); const oct = Math.floor(tr / 12) * 12; const n = ((tr % 12) + 12) % 12; let best = sc[0], bd = 99; for (let q = 0; q < sc.length; q++) { const d0 = Math.abs(sc[q] - n); if (d0 < bd) { bd = d0; best = sc[q]; } } return oct + best; }
    setDiv(name) { const M = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/8T': 1 / 3, '1/16T': 1 / 6 }; if (M[name] != null) this.div = M[name]; }
    setStep(i, p) { Object.assign(this.steps[i], p); }
  toggleDrum(lane, i) { this.drums[lane][i] = !this.drums[lane][i]; return this.drums[lane][i]; }
  noteOn(n, v) { if (!this.enabled) { this.engine.noteOn(n, v); return; } if (!this.held.some(h => h.note === n)) { this.held.push({ note: n, vel: v || 0.8 }); this.held.sort((a, b) => a.note - b.note); } }
  noteOff(n) { if (!this.enabled) { this.engine.noteOff(n); return; } if (this.hold) return; this.held = this.held.filter(h => h.note !== n); }
  suspend(on) { if (on) { this.stopTimer(); } else if (this.enabled) { if (this.engine.ctx) this.nextTime = this.engine.ctx.currentTime + 0.08; this.startTimer(); } }
  toJSON() { return { steps: this.steps, drums: this.drums, div: this.div, scaleName: this.scaleName, bpm: this.bpm }; }
  fromJSON(o) { if (!o) return; if (o.steps) this.steps = o.steps; if (o.drums) this.drums = o.drums; if (o.div) this.div = o.div; if (o.scaleName) this.scaleName = o.scaleName; if (o.bpm) this.bpm = o.bpm; }
  autosave() { try { localStorage.setItem('psy.seq.auto', JSON.stringify(this.toJSON())); } catch (e) {} }
  autorestore() { try { this.fromJSON(JSON.parse(localStorage.getItem('psy.seq.auto') || 'null')); } catch (e) {} }
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
  ensureDrumBus() { if (!this.engine.ctx) return; if (!this._smpTried) { this._smpTried = true; if (window.Psy && Psy.Sampler) Psy.Sampler.load(this.engine.ctx); } if (this._dbus) return;
    this._dbus = this.engine.ctx.createGain(); this._dbus.gain.value = 1;
    this._dcomp = this.engine.ctx.createDynamicsCompressor();
    this._dcomp.attack.value = 0.003; this._dcomp.release.value = 0.15; this._setPunch();
    this._dbus.connect(this._dcomp); this._dcomp.connect(this.engine.master || this.engine.fxInput); }
  _setPunch() { if (!this._dcomp) return; const p = (this.dpunch || 0) / 100; this._dcomp.threshold.value = -8 - p * 14; this._dcomp.ratio.value = 2 + p * 6; }
  _metal(f0, dec) { return function (t) { var rs = [1, 1.483, 1.98, 2.54, 3.1, 3.66, 4.2]; var s = 0; for (var q = 0; q < rs.length; q++) s += Math.sin(2 * Math.PI * f0 * rs[q] * t) * Math.exp(-t * dec * (1 + q * 0.4)); return s; }; }
  _renderDrums() { if (this._rd || !this.engine.ctx) return; const ctx = this.engine.ctx; const sr = ctx.sampleRate;
    const mk = function (len, fn) { const n = Math.floor(sr * len); const b = ctx.createBuffer(1, n, sr); const dd = b.getChannelData(0); for (let i = 0; i < n; i++) dd[i] = fn(i / sr); return b; };
    const hatM = this._metal(620, 90); const crM = this._metal(520, 22); const rdM = this._metal(700, 60);
    this._rd = {
      k: mk(0.34, function (t) { var click = (Math.random()*2-1)*Math.exp(-t/0.0035)*0.7; var thump = Math.sin(2*Math.PI*(44*t+130*0.04*(1-Math.exp(-t/0.016))))*Math.exp(-t/0.12); var sub = Math.sin(2*Math.PI*48*t)*Math.exp(-t/0.16)*0.6; return Math.tanh((click+thump+sub)*1.6); }),
      s: mk(0.24, function (t) { var n = (Math.random()*2-1); var bp = n*Math.exp(-t/0.09)*0.8; var body = Math.sin(2*Math.PI*186*t)*Math.exp(-t/0.06)*0.4 + Math.sin(2*Math.PI*240*t)*Math.exp(-t/0.04)*0.2; return bp+body; }),
      hc: mk(0.06, function (t) { return (hatM(t)*0.6 + (Math.random()*2-1)*0.4)*Math.exp(-t/0.02); }),
      ho: mk(0.32, function (t) { return (hatM(t)*0.7 + (Math.random()*2-1)*0.3)*Math.exp(-t/0.14); }),
      sh: mk(0.1, function (t) { return (Math.random()*2-1)*Math.exp(-t/0.035)*(0.5+0.5*Math.sin(2*Math.PI*30*t)); }),
      cr: mk(1.2, function (t) { return (crM(t)*0.5 + (Math.random()*2-1)*0.5)*Math.exp(-t/0.5)*(1-Math.exp(-t/0.002)); }),
      rd: mk(0.4, function (t) { return (rdM(t)*0.5 + (Math.random()*2-1)*0.3)*Math.exp(-t/0.18) + Math.sin(2*Math.PI*4200*t)*Math.exp(-t/0.01)*0.3; })
    }; }
  _play(buf, t, lvl, rate) { const ctx = this.engine.ctx; const src = ctx.createBufferSource(); src.buffer = buf; if (rate && rate !== 1) src.playbackRate.value = rate; const g = ctx.createGain(); g.gain.value = lvl; src.connect(g); g.connect(this._dbus); src.start(t); }
  hit(lane, t, open) { if (this.dmute[lane]) return; this.ensureDrumBus();
    var sb = (window.Psy && Psy.Sampler) ? Psy.Sampler.get(lane) : null;
    if (sb) { const ctx = this.engine.ctx; const src = ctx.createBufferSource(); src.buffer = sb; const g = ctx.createGain(); g.gain.value = this.dmix[lane] != null ? this.dmix[lane] : 0.8; if (this.dtune[lane]) src.playbackRate.value = this.dtune[lane]; src.connect(g); g.connect(this._dbus); src.start(t); return; }
    this._renderDrums(); if (!this._rd) return;
    if (lane === 'k') { this._play(this._rd.k, t, this.dmix.k, this.dtune.k); var fx = this.engine.fxInput; if (fx && fx.gain) { fx.gain.cancelScheduledValues(t); fx.gain.setValueAtTime(0.4, t); fx.gain.setTargetAtTime(1.0, t + 0.03, 0.12); } }
    else if (lane === 's') this._play(this._rd.s, t, this.dmix.s, this.dtune.s);
    else if (lane === 'hc') this._play(this._rd.hc, t, this.dmix.hc, this.dtune.hc);
    else if (lane === 'ho') this._play(this._rd.ho, t, this.dmix.ho, this.dtune.ho);
    else if (lane === 'sh') this._play(this._rd.sh, t, this.dmix.sh, this.dtune.sh);
    else if (lane === 'cr') this._play(this._rd.cr, t, 0.6);
    else if (lane === 'rd') this._play(this._rd.rd, t, 0.4); }
  _bass(t, f, vel) { const ctx = this.engine.ctx; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(700, t); fl.frequency.exponentialRampToValueAtTime(120, t + 0.12); fl.Q.value = 6; const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(fl); fl.connect(g); g.connect(this.engine.master || this.engine.fxInput); o.start(t); o.stop(t + 0.16); }
  fireDrum(i, t, dur, oct) {
    t = t + ((i % 2 === 1) ? ((this.dswing || 0) / 100) * dur * 0.5 : 0);
    const dh = (this.human || 0) / 100; if (dh > 0) t = t + SEQ_GT[i % 16] * dh * dur * 0.3;
    try {
      if (i === 0 && this.crashOn && this.barCount % 4 === 0) this.hit('cr', t);
      if (this.fillOn && this.barCount % 4 === 3 && i >= 14) this._playSn(t, 0.3 + (i - 13) * 0.3);
      if (this.ghostOn && i % 4 === 2 && !this.drums.s[i]) this._playSn(t, 0.18);
      if (this.drums.k[i]) this.hit('k', t);
      if (this.drums.s[i]) this.hit('s', t);
      if (this.drums.hc[i]) this.hit('hc', t);
      if (this.drums.ho[i]) this.hit('ho', t);
      if (this.drums.sh[i]) this.hit('sh', t);
      if (this.offbass && i % 2 === 1) this._bass(t, 440 * Math.pow(2, (this.root - 12 + oct - 69) / 12), 0.5);
    } catch (e) {}
  }
  fireNote(i, t, dur, oct) {
    const st = this.steps[i];
    const tStep = t + ((i % 2 === 1) ? (this.swing / 100) * dur * 0.5 : 0);
    const src = this.held.length ? this.held : [{ note: this.root + oct, vel: 0.85 }];
    if (st.on && src.length && ((st.prob == null) || st.prob >= 100 || Math.random() * 100 < st.prob)) {
      const base = src[this.notePtr % src.length].note; this.notePtr++;
      const note = base + this.snap(st.tr | 0) + oct;
      let vel = Math.max(0.05, Math.min(1, st.vel));
      const gateSec = this.legato ? Math.max(0.03, dur * 0.98) : Math.max(0.03, dur * ((st.len == null ? 75 : st.len) / 100));
      const hum = (this.human || 0) / 100; const gi = i % 16;
      const jt = tStep + SEQ_GT[gi] * hum * dur * 0.5;
      vel = Math.max(0.05, Math.min(1, vel * (1 + SEQ_GV[gi] * hum)));
      const rat = Math.max(1, Math.min(4, st.rat || 1));
      if (st.chord) { const sc = this.scale(); const c1 = note + sc[2], c2 = note + sc[4]; const sm = this.strum || 0;
        this.engine.noteOnAt(c1, vel * 0.7, jt + sm); this.engine.noteOnAt(c2, vel * 0.6, jt + sm * 2);
        if (!st.tie) { this.engine.noteOffAt(c1, jt + sm + gateSec); this.engine.noteOffAt(c2, jt + sm * 2 + gateSec); } }
      if (rat === 1) { this.engine.noteOnAt(note, vel, jt); if (!st.tie) this.engine.noteOffAt(note, jt + gateSec); }
      else { const sub = dur / rat; for (let r = 0; r < rat; r++) { this.engine.noteOnAt(note, vel, jt + r * sub); this.engine.noteOffAt(note, jt + r * sub + Math.min(gateSec, sub * 0.9)); } }
      this.lastNote = st.tie ? note : -1; if (this.onStep) this.onStep(i, note);
    } else { this.lastNote = -1; if (this.onStep) this.onStep(i, -1); }
  }
  tick() {
    if (!this.enabled || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    if (this.noteTime == null) this.noteTime = this.nextTime;
    if (this.drumTime == null) this.drumTime = this.nextTime;
    const oct = ((window.__octShift || 0) | 0) * 12;
    const baseDiv = this.div || 0.25;
    const drumDur = (60 / this.bpm) * baseDiv;
    const noteDur = (60 / this.bpm) * (this.poly ? (1 / 3) : baseDiv);
    try {
      while (Math.min(this.noteTime, this.drumTime) < ctx.currentTime + 0.12) {
        if (this.noteTime <= this.drumTime) {
          this.fireNote(this.noteStep, this.noteTime, noteDur, oct);
          this.noteStep = (this.noteStep + 1) % this.steps.length;
          if (this.noteStep === 0) { this.barCount++;
            if (this.autovar && this.barCount % 8 === 0) this.mutateDrums();
            if (this.songOn && this.barCount % 4 === 0) { this.songSlot = (this.songSlot + 1) % 4; const before = JSON.stringify(this.steps); this.loadSlot(this.songSlot); if (JSON.stringify(this.steps) !== before && this.onPatternChanged) this.onPatternChanged(); } }
          this.noteTime += noteDur;
        } else {
          this.fireDrum(this.drumStep, this.drumTime, drumDur, oct);
          this.drumStep = (this.drumStep + 1) % this.steps.length;
          this.drumTime += drumDur;
        }
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
