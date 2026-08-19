"use strict";
/* PsySynthPro Engine - Phase 7
   AudioWorklet DSP: PolyBLEP + wavetable, ZDF SVF, analog envelopes, FM,
   per-note pitch bend, sample-accurate event queue for tight sequencing.  */

const WORKLET_SOURCE = String.raw`
class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {
      wave: 0, detune: 0, unison: 3, spread: 12, sub: 25, noise: 0,
      fmRatio: 2, fmDepth: 12, fm2Ratio: 3, fm2Depth: 0, fm3Ratio: 4, fm3Depth: 0, fm4Ratio: 5, fm4Depth: 0, fm5Ratio: 6, fm5Depth: 0, fm6Ratio: 7, fm6Depth: 0,
      filterType: 0, cutoff: 2600, res: 2, filterEnv: 55, wtPos: 0,
      attack: 12, decay: 260, sustain: 70, release: 650,
      fAttack: 5, fDecay: 300, fSustain: 40, fRelease: 400, fEnvAmt: 60,
      lfo2Rate: 5, lfo2Wave: 0,
      lfoTarget: 0, lfoRate: 2.2, lfoDepth: 35, lfoWave: 0,
      lfoCutoff: 0, lfoPitch: 0, lfoAmp: 0, lfoFM: 0, envPitch: 0, envFM: 0,
      modLC: 0, modLP: 0, modLA: 0, modLF: 0, modLR: 0,
      modEC: 0, modEP: 0, modEA: 0, modEF: 0, modER: 0,
      modVC: 0, modVP: 0, modVA: 0, modVF: 0, modVR: 0,
      m0s: 0, m0a: 0, m0d: 0,
      m1s: 0, m1a: 0, m1d: 0,
      m2s: 0, m2a: 0, m2d: 0,
      m3s: 0, m3a: 0, m3d: 0,
      m4s: 0, m4a: 0, m4d: 0,
      m5s: 0, m5a: 0, m5d: 0,
      m6s: 0, m6a: 0, m6d: 0,
      m7s: 0, m7a: 0, m7d: 0,
      glideTime: 0,
      master: 80, reverb: 35, delay: 22,
      fxDist: 0, fxChorus: 0, fxCrush: 0, chRate: 0.8,
    };
    this.voices = [];
    for (let i = 0; i < 16; i++) {
      this.voices.push({
        active: false, note: -1, vel: 0, age: 0, bend: 0, baseFreq: 440, bendMul: 1,
        phase: 0, modPhase: 0, mod2Phase: 0, mod3Phase: 0, mod4Phase: 0, mod5Phase: 0, mod6Phase: 0, subPhase: 0, triInt: 0,
        uniPhase: [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()],
        amp: 0, stage: 0, fAmp: 0, fStage: 0, ic1eq: 0, ic2eq: 0, smoothFc: 0, z1: 0, z2: 0, z3: 0, z4: 0,
        coefTick: 0, a1: 0, a2: 0, a3: 0, resEffCached: -1,
        targetBaseFreq: 0, glideRate: 0
      });
    }
    this.lfoPhase = 0;
    this.lfo2Phase = 0;
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
    else if (m.type === 'wavetable') { this.wtable = m.table; this.wtLen = m.table.length; this.wtMips = null; }
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
    v.fStage = 1; v.fAmp = 0; v.phase = 0; v.modPhase = 0; v.subPhase = 0; v.triInt = 0;
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

  /* band-limited wavetable: mipmap levels keep harmonics under Nyquist */
  buildMips(table) {
    const L = table.length;
    const mips = [table];
    let cur = table;
    for (let m = 0; m < 5; m++) {
      const next = new Float32Array(L);
      for (let i = 0; i < L; i++) {
        next[i] = (cur[(i - 1 + L) % L] + cur[i] * 2 + cur[(i + 1) % L]) * 0.25;
      }
      mips.push(next);
      cur = next;
    }
    return mips;
  }

  readWavetable(phase, inc) {
    if (!this.wtMips) this.wtMips = this.buildMips(this.wtable);
    const mips = this.wtMips;
    const maxH = 0.5 / Math.max(inc, 0.00001);
    const halfLen = this.wtLen / 2;
    let aaLvl = Math.floor(Math.log2(Math.max(1, halfLen / Math.max(1, maxH))));
    aaLvl = Math.max(0, Math.min(mips.length - 1, aaLvl));
    const scanPos = Math.max(0, Math.min(1, p.wtPos / 100)) * (mips.length - 1);
    const baseLvl = Math.max(aaLvl, Math.min(mips.length - 1, Math.floor(scanPos)));
    const nextLvl = Math.min(mips.length - 1, baseLvl + 1);
    const blend = scanPos - Math.floor(scanPos);
    const FA = mips[baseLvl], FB = mips[nextLvl];
    const wpos = phase * this.wtLen;
    const w0 = Math.floor(wpos) % this.wtLen;
    const w1 = (w0 + 1) % this.wtLen;
    const wfrac = wpos - Math.floor(wpos);
    const sA = FA[w0] + (FA[w1] - FA[w0]) * wfrac;
    const sB = FB[w0] + (FB[w1] - FB[w0]) * wfrac;
    return sA + (sB - sA) * blend;
  }

  oscSample(phase, inc, wave, v) {
    const TWO_PI = 6.28318530718;
    if (wave === 4) return this.readWavetable(phase, inc);
    if (wave === 3) return Math.sin(TWO_PI * phase);
    if (wave === 0) return (2 * phase - 1) - this.polyblep(phase, inc);
    if (wave === 1) {
      const sq = phase < 0.5 ? 1 : -1;
      return sq + this.polyblep(phase, inc) - this.polyblep((phase + 0.5) % 1, inc);
    }
    if (wave === 2) {
      /* band-limited triangle: integrate PolyBLEP square, with slow DC servo to prevent drift */
      const sq = phase < 0.5 ? 1 : -1;
      const c = sq + this.polyblep(phase, inc) - this.polyblep((phase + 0.5) % 1, inc);
      v.triInt += c * inc * 4;
      v.triInt -= v.triInt * 0.0008;   /* DC servo: gently pull toward 0, no hard clamp distortion */
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
    const fAC = 1 - Math.exp(-1 / (Math.max(1, p.fAttack) / 1000 * sr));
    const fDC = 1 - Math.exp(-1 / (Math.max(10, p.fDecay) / 1000 * sr));
    const fRC = 1 - Math.exp(-1 / (Math.max(30, p.fRelease) / 1000 * sr));
    const sus = p.sustain / 100;
    const un = Math.min(7, Math.max(1, Math.round(p.unison)));
    const lfoInc = p.lfoRate / sr;
    const lfo2Inc = p.lfo2Rate / sr;
    const TWO_PI = 6.28318530718;
    const uniMuls = [];
    for (let u = 0; u < un; u++) {
      const off = un === 1 ? 0 : ((u - (un - 1) / 2) / ((un - 1) / 2)) * p.spread;
      uniMuls.push(Math.pow(2, (p.detune + off) / 1200));
    }

    for (let i = 0; i < N; i++) {
      this.lfoPhase += lfoInc;
      if (this.lfoPhase >= 1) this.lfoPhase -= 1;
      const lfoSin = Math.sin(TWO_PI * this.lfoPhase);
      const lfoVal = p.lfoWave === 1 ? (lfoSin >= 0 ? 1 : -1) : lfoSin;
      this.lfo2Phase += lfo2Inc;
      if (this.lfo2Phase >= 1) this.lfo2Phase -= 1;
      const lfo2Sin = Math.sin(TWO_PI * this.lfo2Phase);
      const lfo2Val = p.lfo2Wave === 1 ? (lfo2Sin >= 0 ? 1 : -1) : lfo2Sin;
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
        let fT=0, fC=0;
        if (v.fStage===1){ fT=1; fC=fAC; if (v.fAmp>=0.995) v.fStage=2; }
        else if (v.fStage===2){ fT=p.fSustain/100; fC=fDC; if (Math.abs(v.fAmp-fT)<0.002) v.fStage=3; }
        else if (v.fStage===3){ fT=p.fSustain/100; fC=fDC*0.2; }
        else if (v.fStage===4){ fT=0; fC=fRC; }
        v.fAmp += (fT - v.fAmp) * fC;
        const fEnvNorm = v.fAmp;
        let mCut=0, mPit=0, mAmp=0, mFm=0, mRes=0;
        const srcs=[0,lfoVal,lfo2Val,envNorm,fEnvNorm,(v.vel-0.5)*2];
        for (let mi=0; mi<8; mi++) {
          const ms=p['m'+mi+'s'], ma=p['m'+mi+'a']/100, md=p['m'+mi+'d'];
          if (!ms || !ma || !md) continue;
          const mv = srcs[ms]*ma;
          if (md===1) mCut += mv*4000;
          else if (md===2) mPit += mv*12;
          else if (md===3) mAmp += mv;
          else if (md===4) mFm += mv;
          else if (md===5) mRes += mv*10;
        }
        let pitchExp = 0;
        if (p.lfoTarget === 1) pitchExp += (lfoVal * (p.lfoDepth / 100) * 80) / 1200;
        pitchExp += lfoVal * (p.lfoPitch / 100);
        pitchExp += envNorm * (p.envPitch / 100) * 2;
        pitchExp += mPit/100;
        const pitchMod = Math.pow(2, pitchExp);

        let sig = 0;
        for (let u = 0; u < un; u++) {
          const f = baseFreq * bendMul * pitchMod * uniMuls[u];
          v.modPhase += (f * p.fmRatio) / sr;
          if (v.modPhase >= 1) v.modPhase -= 1;
          v.mod2Phase += (f * p.fm2Ratio) / sr;
          if (v.mod2Phase >= 1) v.mod2Phase -= 1;
          v.mod3Phase += (f * p.fm3Ratio) / sr;
          if (v.mod3Phase >= 1) v.mod3Phase -= 1;
          v.mod4Phase += (f * p.fm4Ratio) / sr;
          if (v.mod4Phase >= 1) v.mod4Phase -= 1;
          v.mod5Phase += (f * p.fm5Ratio) / sr;
          if (v.mod5Phase >= 1) v.mod5Phase -= 1;
          v.mod6Phase += (f * p.fm6Ratio) / sr;
          if (v.mod6Phase >= 1) v.mod6Phase -= 1;
          const fmDepthEff = (p.fmDepth / 100) * f * 2 + lfoVal * (p.lfoFM / 100) * f * 2 + envNorm * (p.envFM / 100) * f * 2 + mFm * f * 2;
          const fm2Hz = Math.sin(TWO_PI * v.mod2Phase) * (p.fm2Depth / 100) * f * 2;
          const fm3Hz = Math.sin(TWO_PI * v.mod3Phase) * (p.fm3Depth / 100) * f * 2;
          const fm4Hz = Math.sin(TWO_PI * v.mod4Phase) * (p.fm4Depth / 100) * f * 2;
          const fm5Hz = Math.sin(TWO_PI * v.mod5Phase) * (p.fm5Depth / 100) * f * 2;
          const fm6Hz = Math.sin(TWO_PI * v.mod6Phase) * (p.fm6Depth / 100) * f * 2;
          const fmHz = Math.sin(TWO_PI * v.modPhase) * fmDepthEff;
          const inc = Math.max(0.00001, (f + fmHz + fm2Hz + fm3Hz + fm4Hz + fm5Hz + fm6Hz) / sr);
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
        /* noise oscillator (white noise mix) */
        if (p.noise > 0) {
          sig += (Math.random() * 2 - 1) * (p.noise / 100);
        }

        let fc = p.cutoff + (p.filterEnv / 100) * 9000 * (v.vel > 0 ? v.amp / v.vel : 0);
        if (p.lfoTarget === 0) fc += lfoVal * (p.lfoDepth / 100) * 3500;
        fc += lfoVal * (p.lfoCutoff / 100) * 4000;
        fc += mCut + fEnvNorm * (p.fEnvAmt/100) * 6000;
        fc = Math.min(18000, Math.max(40, fc));
        v.smoothFc = v.smoothFc === 0 ? fc : v.smoothFc + (fc - v.smoothFc) * 0.0015;
        const resEff = Math.max(0.1, Math.min(25, p.res + mRes));
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
        if (p.filterType === 4) {
          /* Moog-style 4-pole ladder with tanh saturation */
          const g = Math.min(1, Math.max(0.001, v.smoothFc / 18000));
          const kk = Math.min(3.8, Math.max(0, (p.res / 20) * 3.8));
          const fb = kk * v.z4;
          const inp = sig - fb;
          v.z1 += g * (Math.tanh(inp * 0.6) - Math.tanh(v.z1));
          v.z2 += g * (Math.tanh(v.z1) - Math.tanh(v.z2));
          v.z3 += g * (Math.tanh(v.z2) - Math.tanh(v.z3));
          v.z4 += g * (Math.tanh(v.z3) - Math.tanh(v.z4));
          fsig = v.z4;
        }
        else if (p.filterType === 0) fsig = v2;
        else if (p.filterType === 1) fsig = sig - k * v1 - v2;
        else if (p.filterType === 2) fsig = v1;
        else fsig = sig - v1;

        let ampMod = 1;
        if (p.lfoTarget === 2) ampMod = 1 - (p.lfoDepth / 200) + lfoVal * (p.lfoDepth / 200);
        ampMod *= 1 - (p.lfoAmp / 200) + lfoVal * (p.lfoAmp / 200);
        ampMod *= Math.max(0, 1 + mAmp);
        ampMod *= Math.max(0, 1 + mAmp);
        acc += fsig * v.amp * ampMod;
      }

      const master = p.master / 100;
      let s = Math.tanh(acc * master * 0.55);
      if (!isFinite(s)) s = 0;
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
    this._fin = function (v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; };
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
      self.master.gain.value = self._fin(self.params.master, 80) / 100;

      self.dry = self.ctx.createGain();
      self.dry.gain.value = 0.9;
      self.fxInput.connect(self.dry);
      self.dry.connect(self.master);

      self.delSend = self.ctx.createGain();
      self.delSend.gain.value = (self._fin(self.params.delay, 22) / 100) * 0.55;
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
      self.revSend.gain.value = (self._fin(self.params.reverb, 35) / 100) * 0.85;
      self.conv = self.ctx.createConvolver();
      self.conv.buffer = self.makeIR(2.6, 3.1);
      self.fxInput.connect(self.revSend);
      self.revSend.connect(self.conv);
      self.conv.connect(self.master);

      /* FX RACK: distortion / chorus / bitcrush as parallel sends */
      self.distSend = self.ctx.createGain();
      self.distSend.gain.value = (self._fin(self.params.fxDist, 0) / 100) * 0.6;
      self.waveshaper = self.ctx.createWaveShaper();
      self.waveshaper.curve = self.makeDistCurve(60);
      self.waveshaper.oversample = '2x';
      self.fxInput.connect(self.distSend);
      self.distSend.connect(self.waveshaper);
      self.waveshaper.connect(self.master);
      self.chSend = self.ctx.createGain();
      self.chSend.gain.value = (self._fin(self.params.fxChorus, 0) / 100) * 0.5;
      self.chDelay = self.ctx.createDelay(1);
      self.chDelay.delayTime.value = 0.02;
      self.chLfo = self.ctx.createOscillator();
      self.chLfo.frequency.value = self._fin(self.params.chRate, 0.8);
      self.chLfoDepth = self.ctx.createGain();
      self.chLfoDepth.gain.value = 0.004;
      self.chLfo.connect(self.chLfoDepth);
      self.chLfoDepth.connect(self.chDelay.delayTime);
      self.chLfo.start();
      self.fxInput.connect(self.chSend);
      self.chSend.connect(self.chDelay);
      self.chDelay.connect(self.master);
      self.crSend = self.ctx.createGain();
      self.crSend.gain.value = (self._fin(self.params.fxCrush, 0) / 100) * 0.5;
      self.crusher = self.ctx.createWaveShaper();
      self.crusher.curve = self.makeCrushCurve(6);
      self.fxInput.connect(self.crSend);
      self.crSend.connect(self.crusher);
      self.crusher.connect(self.master);
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

  makeDistCurve(amount) {
    const n = 1024; const c = new Float32Array(n);
    for (let i=0;i<n;i++){ const x = (i/(n-1))*2-1; c[i] = Math.tanh(x*(1+amount*0.05)); }
    return c;
  }
  makeCrushCurve(bits) {
    const n = 1024; const c = new Float32Array(n);
    const steps = Math.pow(2, bits);
    for (let i=0;i<n;i++){ const x=(i/(n-1))*2-1; c[i]=Math.round(x*steps)/steps; }
    return c;
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
      if (this.distSend) this.distSend.gain.value = (this._fin(this.params.fxDist,0) / 100) * 0.6;
      if (this.chSend) this.chSend.gain.value = (this._fin(this.params.fxChorus,0) / 100) * 0.5;
      if (this.crSend) this.crSend.gain.value = (this._fin(this.params.fxCrush,0) / 100) * 0.5;
      if (this.chLfo) this.chLfo.frequency.value = this._fin(this.params.chRate,0.8);
    else if (key === 'master' && this.master) this.master.gain.value = value / 100;
    else this.sendParams();
  }
  setAll(obj) {
    Object.assign(this.params, PsySynth.DEFAULT);
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
