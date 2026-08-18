"use strict";
/* PsySynthPro Engine - Phase 7
   AudioWorklet DSP: PolyBLEP + wavetable, ZDF SVF, analog envelopes, FM,
   per-note pitch bend, sample-accurate event queue for tight sequencing.  */

const WORKLET_SOURCE = String.raw`
class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {
      wave: 0, detune: 0, unison: 3, spread: 12, sub: 25,
      fmRatio: 2, fmDepth: 12,
      filterType: 0, cutoff: 2600, res: 2, filterEnv: 55,
      attack: 12, decay: 260, sustain: 70, release: 650,
      lfoTarget: 0, lfoRate: 2.2, lfoDepth: 35, lfoWave: 0,
      lfoCutoff: 0, lfoPitch: 0, lfoAmp: 0, lfoFM: 0, envPitch: 0, envFM: 0,
      modLC: 0, modLP: 0, modLA: 0, modLF: 0, modLR: 0,
      modEC: 0, modEP: 0, modEA: 0, modEF: 0, modER: 0,
      modVC: 0, modVP: 0, modVA: 0, modVF: 0, modVR: 0,
      glideTime: 0,
      master: 80, reverb: 35, delay: 22
    };
    this.voices = [];
    for (let i = 0; i < 16; i++) {
      this.voices.push({
        active: false, note: -1, vel: 0, age: 0, bend: 0, baseFreq: 440, bendMul: 1,
        phase: 0, modPhase: 0, subPhase: 0, triInt: 0,
        uniPhase: [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()],
        amp: 0, stage: 0, ic1eq: 0, ic2eq: 0, smoothFc: 0,
        coefTick: 0, a1: 0, a2: 0, a3: 0, resEffCached: -1,
        targetBaseFreq: 0, glideRate: 0
      });
    }
    this.lfoPhase = 0;
    this.queue = [];
    this._voiceTick = 0;
    this.wtable = this.renderDefaultTable();
    this.wtLen = this.wtable.length;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  renderDefaultTable() {
    const size = 2048;
    const harms = [1, 0.6, 0.42, 0.3, 0.22, 0.16, 0.11, 0.07, 0.045, 0.028, 0.017, 0.01];
    const t = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      let s = 0; const ph = i / size;
      for (let h = 0; h < harms.length; h++) s += harms[h] * Math.sin(6.28318530718 * (h + 1) * ph);
      t[i] = s;
    }
    let mx = 0; for (let i = 0; i < size; i++) mx = Math.max(mx, Math.abs(t[i]));
    if (mx > 0) for (let i = 0; i < size; i++) t[i] = (t[i] / mx) * 0.9;
    return t;
  }

  findVoice(note) {
    for (const v of this.voices) if (v.note === note && v.active) return v;
    return null;
  }

  onMessage(m) {
    if (m.type === 'params') Object.assign(this.p, m.values);
    else if (m.type === 'noteOn') this.noteOn(m.note, m.vel);
    else if (m.type === 'noteOff') this.noteOff(m.note);
    else if (m.type === 'noteOnAt') {
      if (m.when <= currentTime) this.noteOn(m.note, m.vel);
      else this.queue.push({ time: m.when, action: 'on', note: m.note, vel: m.vel });
    }
    else if (m.type === 'noteOffAt') {
      if (m.when <= currentTime) this.noteOff(m.note);
      else this.queue.push({ time: m.when, action: 'off', note: m.note });
    }
    else if (m.type === 'noteBend') {
      const v = this.findVoice(m.note);
      if (v) { v.bend = m.bend; v.bendMul = Math.pow(2, v.bend / 12); }
    }
    else if (m.type === 'wavetable') { this.wtable = m.table; this.wtLen = m.table.length; }
    else if (m.type === 'panic') {
      this.queue = [];
      for (const v of this.voices) { v.active = false; v.stage = 0; v.amp = 0; }
    }
  }

  drainQueue() {
    if (this.queue.length === 0) return;
    this.queue.sort(function (a, b) { return a.time - b.time; });
    while (this.queue.length > 0 && this.queue[0].time <= currentTime) {
      const ev = this.queue.shift();
      if (ev.action === 'on') this.noteOn(ev.note, ev.vel);
      else this.noteOff(ev.note);
    }
  }

  noteOn(note, vel) {
    /* Glide (legato): glideTime>0 & exactly one sounding voice -> glide it, no retrigger */
    if (this.p.glideTime > 0) {
      let activeCount = 0, lastActive = null;
      for (const x of this.voices) if (x.active) { activeCount++; lastActive = x; }
      if (activeCount === 1 && lastActive) {
        const gv = lastActive;
        gv.note = note;
        const newBase = 440 * Math.pow(2, (note - 69) / 12);
        const glideSec = Math.max(0.001, this.p.glideTime / 1000);
        gv.glideRate = (newBase - gv.baseFreq) / glideSec;
        gv.targetBaseFreq = newBase;
        gv.vel = vel;
        if (gv.stage === 4) gv.stage = 3;
        gv.age = 0;
        for (const x of this.voices) if (x !== gv) x.age++;
        return;
      }
    }
    let v = this.voices.find(x => x.note === note && x.active && x.stage !== 4);
    if (!v) v = this.voices.find(x => !x.active);
    if (!v) {
      let oldest = this.voices[0];
      for (const x of this.voices) if (x.age > oldest.age) oldest = x;
      v = oldest;
    }
    for (const x of this.voices) if (x !== v) x.age++;
    v.active = true; v.note = note; v.vel = vel; v.age = 0; v.bend = 0;
    v.baseFreq = 440 * Math.pow(2, (note - 69) / 12);
    v.bendMul = 1;
    v.coefTick = 0; v.resEffCached = -1;
    v.stage = 1; v.phase = 0; v.modPhase = 0; v.subPhase = 0; v.triInt = 0;
    v.ic1eq = 0; v.ic2eq = 0;
  }

  noteOff(note) {
    for (const v of this.voices) {
      if (v.note === note && v.active && v.stage !== 4) v.stage = 4;
    }
  }

  polyblep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }

  readWavetable(phase) {
    const pos = phase * this.wtLen;
    const i0 = Math.floor(pos) % this.wtLen;
    const i1 = (i0 + 1) % this.wtLen;
    const frac = pos - Math.floor(pos);
    return this.wtable[i0] + (this.wtable[i1] - this.wtable[i0]) * frac;
  }

  oscSample(phase, inc, wave, v) {
    const TWO_PI = 6.28318530718;
    if (wave === 4) return this.readWavetable(phase);
    if (wave === 3) return Math.sin(TWO_PI * phase);
    if (wave === 0) return (2 * phase - 1) - this.polyblep(phase, inc);
    if (wave === 1) {
      const sq = phase < 0.5 ? 1 : -1;
      return sq + this.polyblep(phase, inc) - this.polyblep((phase + 0.5) % 1, inc);
    }
    if (wave === 2) {
      const sq = phase < 0.5 ? 1 : -1;
      const c = sq + this.polyblep(phase, inc) - this.polyblep((phase + 0.5) % 1, inc);
      v.triInt += c * inc * 4;
      v.triInt = Math.max(-1.2, Math.min(1.2, v.triInt));
      return Math.max(-1, Math.min(1, v.triInt));
    }
    return Math.sin(TWO_PI * phase);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const nCh = out.length;
    const N = out[0].length;
    const p = this.p;
    const sr = sampleRate;

    this.drainQueue();

    const aC = 1 - Math.exp(-1 / (Math.max(1, p.attack) / 1000 * sr));
    const dC = 1 - Math.exp(-1 / (Math.max(10, p.decay) / 1000 * sr));
    const rC = 1 - Math.exp(-1 / (Math.max(30, p.release) / 1000 * sr));
    const sus = p.sustain / 100;
    const un = Math.max(1, Math.round(p.unison));
    const lfoInc = p.lfoRate / sr;
    const TWO_PI = 6.28318530718;
    const uniMuls = [];
    for (let u = 0; u < un; u++) {
      const off = un === 1 ? 0 : ((u - (un - 1) / 2) / ((un - 1) / 2)) * p.spread;
      uniMuls.push(Math.pow(2, (p.detune + off) / 1200));
    }
    const matrixActive = (p.modLC || p.modLP || p.modLA || p.modLF || p.modLR || p.modEC || p.modEP || p.modEA || p.modEF || p.modER || p.modVC || p.modVP || p.modVA || p.modVF || p.modVR) !== 0;

    for (let i = 0; i < N; i++) {
      this.lfoPhase += lfoInc;
      if (this.lfoPhase >= 1) this.lfoPhase -= 1;
      const lfoSin = Math.sin(TWO_PI * this.lfoPhase);
      const lfoVal = p.lfoWave === 1 ? (lfoSin >= 0 ? 1 : -1) : lfoSin;
      let acc = 0;

      for (const v of this.voices) {
        if (!v.active) continue;

        let target = 0, coef = 0;
        if (v.stage === 1) { target = v.vel; coef = aC; if (v.amp >= v.vel * 0.995) v.stage = 2; }
        else if (v.stage === 2) { target = v.vel * sus; coef = dC; if (Math.abs(v.amp - target) < 0.002) v.stage = 3; }
        else if (v.stage === 3) { target = v.vel * sus; coef = dC * 0.2; }
        else if (v.stage === 4) { target = 0; coef = rC; if (v.amp < 0.0004) { v.active = false; v.stage = 0; } }
        v.amp += (target - v.amp) * coef;
        if (!v.active) continue;

        /* Glide: move baseFreq toward targetBaseFreq */
        if (v.targetBaseFreq !== 0) {
          v.baseFreq += v.glideRate / sr;
          if ((v.glideRate >= 0 && v.baseFreq >= v.targetBaseFreq) || (v.glideRate < 0 && v.baseFreq <= v.targetBaseFreq)) {
            v.baseFreq = v.targetBaseFreq;
            v.targetBaseFreq = 0;
            v.glideRate = 0;
          }
        }

        const baseFreq = v.baseFreq;
        const bendMul = v.bendMul;
        const envNorm = v.vel > 0 ? Math.min(1, v.amp / v.vel) : 0;
        let modCut = 0, modAmp = 0, modFmCoef = 0, modRes = 0;
        let pitchExp = 0;
        if (p.lfoTarget === 1) pitchExp += (lfoVal * (p.lfoDepth / 100) * 80) / 1200;
        pitchExp += lfoVal * (p.lfoPitch / 100);
        pitchExp += envNorm * (p.envPitch / 100) * 2;
        if (matrixActive) {
          /* NxM bipolar matrix: sources LFO/ENV/VEL -> dest CUT/PIT/AMP/FM/RES */
          const envSrc = (envNorm - 0.5) * 2;
          const velSrc = (v.vel - 0.5) * 2;
          modCut = (lfoVal * p.modLC + envSrc * p.modEC + velSrc * p.modVC) * 40;
          const modPitCents = (lfoVal * p.modLP + envSrc * p.modEP + velSrc * p.modVP) * 12;
          modAmp = (lfoVal * p.modLA + envSrc * p.modEA + velSrc * p.modVA) / 100;
          modFmCoef = (lfoVal * p.modLF + envSrc * p.modEF + velSrc * p.modVF) / 100;
          modRes = (lfoVal * p.modLR + envSrc * p.modER + velSrc * p.modVR) * 0.1;
          pitchExp += modPitCents / 1200;
        }
        const pitchMod = Math.pow(2, pitchExp);

        let sig = 0;
        for (let u = 0; u < un; u++) {
          const f = baseFreq * bendMul * pitchMod * uniMuls[u];
          v.modPhase += (f * p.fmRatio) / sr;
          if (v.modPhase >= 1) v.modPhase -= 1;
          const fmDepthEff = (p.fmDepth / 100) * f * 2 + lfoVal * (p.lfoFM / 100) * f * 2 + envNorm * (p.envFM / 100) * f * 2 + modFmCoef * f * 2;
          const fmHz = Math.sin(TWO_PI * v.modPhase) * fmDepthEff;
          const inc = Math.max(0.00001, (f + fmHz) / sr);
          v.uniPhase[u] += inc;
          if (v.uniPhase[u] >= 1) v.uniPhase[u] -= 1;
          sig += this.oscSample(v.uniPhase[u], Math.min(inc, 0.49), p.wave, v);
        }
        sig /= un;

        if (p.sub > 0) {
          v.subPhase += (baseFreq * bendMul / 2) / sr;
          if (v.subPhase >= 1) v.subPhase -= 1;
          sig += (p.sub / 100) * Math.sin(TWO_PI * v.subPhase);
        }

        let fc = p.cutoff + (p.filterEnv / 100) * 9000 * (v.vel > 0 ? v.amp / v.vel : 0);
        if (p.lfoTarget === 0) fc += lfoVal * (p.lfoDepth / 100) * 3500;
        fc += lfoVal * (p.lfoCutoff / 100) * 4000;
        fc += modCut;
        fc = Math.min(18000, Math.max(40, fc));
        v.smoothFc = v.smoothFc === 0 ? fc : v.smoothFc + (fc - v.smoothFc) * 0.0015;
        const resEff = Math.max(0.1, Math.min(25, p.res + modRes));
        if (v.coefTick <= 0 || Math.abs(resEff - v.resEffCached) > 0.05) {
          const g = Math.tan(3.14159265359 * v.smoothFc / sr);
          const k = Math.max(0.02, 2 - (resEff / 10));
          v.a1 = 1 / (1 + g * (g + k));
          v.a2 = g * v.a1;
          v.a3 = g * v.a2;
          v.coefTick = 16;
          v.resEffCached = resEff;
        }
        v.coefTick--;
        const a1 = v.a1, a2 = v.a2, a3 = v.a3;
        const v3 = sig - v.ic2eq;
        const v1 = a1 * v.ic1eq + a2 * v3;
        const v2 = v.ic2eq + a2 * v.ic1eq + a3 * v3;
        v.ic1eq = 2 * v1 - v.ic1eq;
        v.ic2eq = 2 * v2 - v.ic2eq;
        let fsig;
        if (p.filterType === 0) fsig = v2;
        else if (p.filterType === 1) fsig = sig - k * v1 - v2;
        else if (p.filterType === 2) fsig = v1;
        else fsig = sig - v1;

        let ampMod = 1;
        if (p.lfoTarget === 2) ampMod = 1 - (p.lfoDepth / 200) + lfoVal * (p.lfoDepth / 200);
        ampMod *= 1 - (p.lfoAmp / 200) + lfoVal * (p.lfoAmp / 200);
        ampMod *= Math.max(0, 1 + modAmp);
        acc += fsig * v.amp * ampMod;
      }

      const master = p.master / 100;
      const s = Math.tanh(acc * master * 0.28);
      for (let c = 0; c < nCh; c++) out[c][i] = s;
    }
    this._voiceTick += N;
    if (this._voiceTick >= 2048) {
      this._voiceTick = 0;
      let count = 0;
      for (const v of this.voices) if (v.active) count++;
      this.port.postMessage({ type: 'voices', count: count });
    }
    return true;
  }
}
registerProcessor('psysynth-processor', SynthProcessor);
`;

var PsySynth = (window.PsySynth = window.PsySynth || {});

class SynthEngine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.analyser = null;
    this.ready = false;
    this.onVoices = null;
    this.params = Object.assign({}, PsySynth.DEFAULT);
  }

  boot() {
    if (this.ready) return Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const self = this;
    return this.ctx.audioWorklet.addModule(url).then(function () {
      self.node = new AudioWorkletNode(self.ctx, 'psysynth-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
      });
      self.node.port.onmessage = function (e) {
        if (e.data && e.data.type === 'voices' && self.onVoices) self.onVoices(e.data.count);
      };

      self.fxInput = self.ctx.createGain();
      self.node.connect(self.fxInput);

      self.master = self.ctx.createGain();
      self.master.gain.value = self.params.master / 100;

      self.dry = self.ctx.createGain();
      self.dry.gain.value = 0.9;
      self.fxInput.connect(self.dry);
      self.dry.connect(self.master);

      self.delSend = self.ctx.createGain();
      self.delSend.gain.value = (self.params.delay / 100) * 0.55;
      self.delay = self.ctx.createDelay(2);
      self.delay.delayTime.value = 0.32;
      self.delFb = self.ctx.createGain();
      self.delFb.gain.value = 0.38;
      self.fxInput.connect(self.delSend);
      self.delSend.connect(self.delay);
      self.delay.connect(self.delFb);
      self.delFb.connect(self.delay);
      self.delay.connect(self.master);

      self.revSend = self.ctx.createGain();
      self.revSend.gain.value = (self.params.reverb / 100) * 0.85;
      self.conv = self.ctx.createConvolver();
      self.conv.buffer = self.makeIR(2.6, 3.1);
      self.fxInput.connect(self.revSend);
      self.revSend.connect(self.conv);
      self.conv.connect(self.master);

      self.analyser = self.ctx.createAnalyser();
      self.analyser.fftSize = 2048;
      self.master.connect(self.analyser);
      self.analyser.connect(self.ctx.destination);

      self.ready = true;
      self.sendParams();
      URL.revokeObjectURL(url);
      return self.ctx.resume();
    });
  }

  makeIR(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  sendParams() { if (this.node) this.node.port.postMessage({ type: 'params', values: this.params }); }
  setWavetable(table) { if (this.node) this.node.port.postMessage({ type: 'wavetable', table: table }); }

  set(key, value) {
    this.params[key] = value;
    if (key === 'delay' && this.delSend) this.delSend.gain.value = (value / 100) * 0.55;
    else if (key === 'reverb' && this.revSend) this.revSend.gain.value = (value / 100) * 0.85;
    else if (key === 'master' && this.master) this.master.gain.value = value / 100;
    else this.sendParams();
  }
  setAll(obj) {
    Object.assign(this.params, obj);
    if (this.delSend) this.delSend.gain.value = (this.params.delay / 100) * 0.55;
    if (this.revSend) this.revSend.gain.value = (this.params.reverb / 100) * 0.85;
    if (this.master) this.master.gain.value = this.params.master / 100;
    this.sendParams();
  }
  noteOn(note, vel) { if (this.node) this.node.port.postMessage({ type: 'noteOn', note: note, vel: vel }); }
  noteOff(note) { if (this.node) this.node.port.postMessage({ type: 'noteOff', note: note }); }
  noteOnAt(note, vel, when) { if (this.node) this.node.port.postMessage({ type: 'noteOnAt', note: note, vel: vel, when: when }); }
  noteOffAt(note, when) { if (this.node) this.node.port.postMessage({ type: 'noteOffAt', note: note, when: when }); }
  noteBend(note, semis) { if (this.node) this.node.port.postMessage({ type: 'noteBend', note: note, bend: semis }); }
  panic() { if (this.node) this.node.port.postMessage({ type: 'panic' }); }
  latencyMs() {
    if (!this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }
}

PsySynth.SynthEngine = SynthEngine;
