"use strict";
/* PsySynthPro Engine - Phase 7
   AudioWorklet DSP: PolyBLEP + wavetable, ZDF SVF, analog envelopes, FM,
   per-note pitch bend, sample-accurate event queue for tight sequencing.  */

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
    const self = this;
    let load;
    if (self.ctx.audioWorklet) {
      load = self.ctx.audioWorklet.addModule('psysynth-worklet.js?v=992');
    } else {
      self.fallbackMode = true; self.node = null; load = Promise.resolve();
    }
    return load.catch(function (e) { self.fallbackMode = true; self.node = null; }).then(function () {
      if (!self.fallbackMode) {
      try {
        self.node = new AudioWorkletNode(self.ctx, 'psysynth-processor', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
        });
      } catch (e) { self.node = null; self.fallbackMode = true; }
      }
      if (self.node) self.node.port.onmessage = function (e) {
        if (e.data && e.data.type === 'voices' && self.onVoices) self.onVoices(e.data.count);
        else if (e.data && e.data.type === 'error') {
          var es = document.getElementById('psyErrStrip');
          if (es) { es.style.display = 'block'; es.textContent = 'WORKLET ERROR: ' + e.data.msg; }
        }
      };

      self.fxInput = self.ctx.createGain();
      if (self.node) self.node.connect(self.fxInput);

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
      self.limiter = self.ctx.createDynamicsCompressor();
      self.limiter.threshold.value = -6;
      self.limiter.knee.value = 3;
      self.limiter.ratio.value = 12;
      self.limiter.attack.value = 0.003;
      self.limiter.release.value = 0.25;
      self.master.connect(self.limiter);
      self.limiter.connect(self.analyser);
      self.analyser.connect(self.ctx.destination);

      self.ready = true;
      self.sendParams();

      return self.ctx.resume();
    }).catch(function (e) {
      var es = document.getElementById('psyErrStrip');
      if (es) { es.style.display = 'block'; es.textContent = 'BOOT ERROR: ' + (e && e.message ? e.message : e); }
      throw e;
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
  noteOn(note, vel) { if (this.fallbackMode) { if (this.ctx) this.fbNoteOn(note, vel); return; } if (this.node) this.node.port.postMessage({ type: 'noteOn', note: note, vel: vel }); }
  noteOff(note) { if (this.fallbackMode) { this.fbNoteOff(note); return; } if (this.node) this.node.port.postMessage({ type: 'noteOff', note: note }); }
  noteOnAt(note, vel, when) { if (this.fallbackMode) { if (this.ctx) this.fbNoteOn(note, vel); return; } if (this.node) this.node.port.postMessage({ type: 'noteOnAt', note: note, vel: vel, when: when }); }
  noteOffAt(note, when) { if (this.fallbackMode) { const self=this; const dt=this.ctx?Math.max(0,(when-this.ctx.currentTime)*1000):0; setTimeout(function(){ self.fbNoteOff(note); }, dt); return; } if (this.node) this.node.port.postMessage({ type: 'noteOffAt', note: note, when: when }); }
  noteBend(note, semis) { if (this.node) this.node.port.postMessage({ type: 'noteBend', note: note, bend: semis }); }
  panic() { if (this.fallbackMode) { for (const n in this.fbVoices) this.fbNoteOff(+n); return; } if (this.node) this.node.port.postMessage({ type: 'panic' }); }
  fbNoteOn(note, vel) {
    if (!this.fbVoices) this.fbVoices = {};
    if (this.fbVoices[note]) this.fbNoteOff(note);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.value = this._fin(this.params.cutoff, 2600); flt.Q.value = this._fin(this.params.res, 2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel || 0.8, t + 0.01);
    osc.connect(flt); flt.connect(g); g.connect(this.fxInput || this.master);
    osc.start(t); this.fbVoices[note] = { osc: osc, g: g };
  }
  fbNoteOff(note) {
    if (!this.fbVoices) return; const v = this.fbVoices[note]; if (!v) return;
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0.0001, t + 0.2); v.osc.stop(t + 0.25);
    delete this.fbVoices[note];
  }
  latencyMs() {
    if (!this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }
}

PsySynth.SynthEngine = SynthEngine;
