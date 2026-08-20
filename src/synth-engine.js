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
            load = self.ctx.audioWorklet.addModule('psysynth-worklet.js?v=1071').catch(function () { self.fallbackMode = true; });
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

      self.params.mobile = (window.matchMedia && window.matchMedia('(max-width:700px)').matches) ? 1 : 0;
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
      self.conv.buffer = self.makeIR((window.matchMedia && window.matchMedia('(max-width:700px)').matches) ? 1.2 : 2.6, 3.1);
      self.fxInput.connect(self.revSend);
      self.revHP = self.ctx.createBiquadFilter(); self.revHP.type = 'highpass'; self.revHP.frequency.value = 250;
      self.revSend.connect(self.revHP); self.revHP.connect(self.conv);
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
      self.glue = self.ctx.createWaveShaper();
      const gc = new Float32Array(256); for (let i=0;i<256;i++){ const x=i/127.5-1; gc[i]=Math.tanh(x*1.15)/Math.tanh(1.15); }
      self.glue.curve = gc; self.glue.oversample = '2x';
      self.sat = self.ctx.createWaveShaper();
      const sc = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; sc[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
      self.sat.curve = sc; self.sat.oversample = '2x';
      self.dc = self.ctx.createBiquadFilter(); self.dc.type = 'highpass'; self.dc.frequency.value = 30;
      self.master.connect(self.sat); self.sat.connect(self.dc); self.dc.connect(self.glue); self.glue.connect(self.limiter);
      self.limiter.connect(self.analyser);
      self.analyser.connect(self.ctx.destination);

      self.ready = true;
      try { var om = document.getElementById('oMeta'); if (om) om.innerHTML = (self.fallbackMode ? 'FALLBACK MODE' : 'WORKLET DSP') + '<br>READY'; } catch (e) {}
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

  sendParams(values) { if (this.node) this.node.port.postMessage({ type: 'params', values: values || this.params }); }
  setWavetable(table) { if (this.node) this.node.port.postMessage({ type: 'wavetable', table: table }); }

  set(key, value) {
    this.params[key] = value;
    if (key === 'delay' && this.delSend) this.delSend.gain.value = (this._fin(value,22) / 100) * 0.55;
    else if (key === 'reverb' && this.revSend) this.revSend.gain.value = (this._fin(value,35) / 100) * 0.85;
      if (this.distSend) this.distSend.gain.value = (this._fin(this.params.fxDist,0) / 100) * 0.6;
      if (this.chSend) this.chSend.gain.value = (this._fin(this.params.fxChorus,0) / 100) * 0.5;
      if (this.crSend) this.crSend.gain.value = (this._fin(this.params.fxCrush,0) / 100) * 0.5;
      if (this.chLfo) this.chLfo.frequency.value = this._fin(this.params.chRate,0.8);
    else if (key === 'master' && this.master) this.master.gain.value = this._fin(value,80) / 100;
    else { var __o = {}; __o[key] = value; this.sendParams(__o); }
  }
  setAll(obj) {
    Object.assign(this.params, PsySynth.DEFAULT);
    Object.assign(this.params, obj);
    if (this.delSend) this.delSend.gain.value = (this._fin(this.params.delay,22) / 100) * 0.55;
    if (this.revSend) this.revSend.gain.value = (this._fin(this.params.reverb,35) / 100) * 0.85;
    if (this.master) this.master.gain.value = this._fin(this.params.master,80) / 100;
    this.sendParams();
  }
  noteOn(note, vel) {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); if (this.fallbackMode) { if (this.ctx) this.fbNoteOn(note, vel); return; } if (this.node) this.node.port.postMessage({ type: 'noteOn', note: note, vel: vel }); }
  noteOff(note) { if (this.fallbackMode) { this.fbNoteOff(note); return; } if (this.node) this.node.port.postMessage({ type: 'noteOff', note: note }); }
  noteOnAt(note, vel, when) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); if (this.fallbackMode) { if (this.ctx) this.fbNoteOn(note, vel); return; } if (this.node) this.node.port.postMessage({ type: 'noteOnAt', note: note, vel: vel, when: when }); }
  noteOffAt(note, when) { if (this.fallbackMode) { const self=this; const dt=this.ctx?Math.max(0,(when-this.ctx.currentTime)*1000):0; setTimeout(function(){ self.fbNoteOff(note); }, dt); return; } if (this.node) this.node.port.postMessage({ type: 'noteOffAt', note: note, when: when }); }
  noteBend(note, semis) { if (this.node) this.node.port.postMessage({ type: 'noteBend', note: note, bend: semis }); }
  panic() { if (this.fallbackMode) { for (const n in this.fbVoices) this.fbNoteOff(+n); return; } if (this.node) this.node.port.postMessage({ type: 'panic' }); }
  fbNoteOn(note, vel) {
    if (!this.fbVoices) this.fbVoices = {};
    if (this.fbVoices[note]) this.fbNoteOff(note);
    const t = this.ctx.currentTime, p = this.params;
    const atk = Math.max(0.002, this._fin(p.attack, 10) / 1000);
    const rel = Math.max(0.03, this._fin(p.release, 200) / 1000);
    const sus = Math.max(0.05, Math.min(1, this._fin(p.sustain, 80) / 100));
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const flt = this.ctx.createBiquadFilter(); flt.type = ['lowpass','highpass','bandpass','lowpass'][(this._fin(p.filterType,0)|0)] || 'lowpass';
    const cut = this._fin(p.cutoff, 2600); flt.Q.value = this._fin(p.res, 2);
    flt.frequency.setValueAtTime(cut + ((this._fin(p.fEnvAmt, 0) + this._fin(p.modEC, 0)) / 100) * 4000, t);
    flt.frequency.setTargetAtTime(cut, t, Math.max(0.01, this._fin(p.fDecay, 300) / 1000));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel || 0.8, t + atk);
    g.gain.setTargetAtTime((vel || 0.8) * sus, t + atk, 0.1);
    const oscs = [];
    const un = (this._fin(p.unison, 2) | 0);
    const det = this._fin(p.detune, 8);
    for (let u = 0; u < Math.max(1, Math.min(3, un)); u++) {
      const o = this.ctx.createOscillator(); o.type = ['sawtooth','square','triangle','sine','sawtooth'][(p.wave|0)] || 'sawtooth';
      o.frequency.value = f; o.detune.value = (u - (un - 1) / 2) * det;
      o.connect(flt); o.start(t); oscs.push(o);
    }
    const lfoDepth = this._fin(p.lfoDepth, 0);
    let lfo = null;
    if (lfoDepth > 0) { lfo = this.ctx.createOscillator(); lfo.frequency.value = this._fin(p.lfoRate, 5);
      const lg = this.ctx.createGain(); lg.gain.value = ((lfoDepth + this._fin(p.modLC, 0)) / 100) * 2500; lfo.connect(lg); lg.connect(flt.frequency); lfo.start(t); }
    const fmDepth = this._fin(p.fmDepth, 0);
    let mod = null;
    if (fmDepth > 0) { mod = this.ctx.createOscillator(); mod.frequency.value = f * (this._fin(p.fmRatio, 2) || 2);
      const mg = this.ctx.createGain(); mg.gain.value = (fmDepth / 100) * f * 3; mod.connect(mg); mg.connect(oscs[0].frequency); mod.start(t); }
    const lfo2Depth = this._fin(p.lfo2Depth, 0); let lfo2 = null;
    if (lfo2Depth > 0) { lfo2 = this.ctx.createOscillator(); lfo2.frequency.value = this._fin(p.lfo2Rate, 5);
      const l2g = this.ctx.createGain(); l2g.gain.value = (lfo2Depth / 100) * 40; lfo2.connect(l2g); l2g.connect(oscs[0].detune); lfo2.start(t); }
    flt.connect(g); g.connect(this.fxInput || this.master);
    this.fbVoices[note] = { osc: oscs, g: g, rel: rel, lfo: lfo, mod: mod, lfo2: lfo2 };
  }
  fbNoteOff(note) {
    if (!this.fbVoices) return; const v = this.fbVoices[note]; if (!v) return;
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0.0001, t + (v.rel || 0.2));
    for (const o of v.osc) o.stop(t + (v.rel || 0.2) + 0.05);
    if (v.lfo) v.lfo.stop(t + (v.rel || 0.2) + 0.05);
    if (v.mod) v.mod.stop(t + (v.rel || 0.2) + 0.05);
    if (v.lfo2) v.lfo2.stop(t + (v.rel || 0.2) + 0.05);
    delete this.fbVoices[note];
  }
  latencyMs() {
    if (!this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }
}

PsySynth.SynthEngine = SynthEngine;
