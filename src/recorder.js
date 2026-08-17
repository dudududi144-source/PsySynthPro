"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ WAV Recorder (Phase 6) ═══════════
   Captures raw PCM from the master bus via ScriptProcessor,
   accumulates Float32 frames and encodes a real 16-bit WAV.  */

class Recorder {
  constructor(engine) {
    this.engine = engine;
    this.recording = false;
    this.left = [];
    this.right = [];
    this.frames = 0;
    this.proc = null;
  }

  start() {
    if (this.recording || !this.engine.ready) return false;
    const ctx = this.engine.ctx;
    this.left = [];
    this.right = [];
    this.frames = 0;

    this.dest = ctx.createMediaStreamDestination();
    this.engine.master.connect(this.dest);
    this.src = ctx.createMediaStreamSource(this.dest.stream);
    this.proc = ctx.createScriptProcessor(4096, 2, 2);
    this.silent = ctx.createGain();
    this.silent.gain.value = 0;

    const self = this;
    this.proc.onaudioprocess = function (e) {
      if (!self.recording) return;
      self.left.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      self.right.push(new Float32Array(e.inputBuffer.getChannelData(1)));
      self.frames += e.inputBuffer.length;
    };

    this.src.connect(this.proc);
    this.proc.connect(this.silent);
    this.silent.connect(ctx.destination);

    this.recording = true;
    return true;
  }

  stop() {
    if (!this.recording) return null;
    this.recording = false;
    try { this.engine.master.disconnect(this.dest); } catch (e) {}
    try { this.src.disconnect(); this.proc.disconnect(); this.silent.disconnect(); } catch (e) {}
    this.proc.onaudioprocess = null;

    const blob = Psy.encodeWAV(this.left, this.right, this.engine.ctx.sampleRate);
    this.left = [];
    this.right = [];
    return blob;
  }

  seconds() {
    return this.engine && this.engine.ctx ? this.frames / this.engine.ctx.sampleRate : 0;
  }
}

/* encode two Float32 channel frame-arrays into a 16-bit PCM WAV blob */
Psy.encodeWAV = function (leftFrames, rightFrames, sampleRate) {
  let total = 0;
  for (let i = 0; i < leftFrames.length; i++) total += leftFrames[i].length;

  const buffer = new ArrayBuffer(44 + total * 4);
  const view = new DataView(buffer);

  function wstr(offset, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  wstr(0, 'RIFF');
  view.setUint32(4, 36 + total * 4, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  wstr(36, 'data');
  view.setUint32(40, total * 4, true);

  let off = 44;
  for (let f = 0; f < leftFrames.length; f++) {
    const L = leftFrames[f], R = rightFrames[f];
    for (let i = 0; i < L.length; i++) {
      let l = Math.max(-1, Math.min(1, L[i]));
      let r = Math.max(-1, Math.min(1, R[i]));
      view.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7FFF, true); off += 2;
      view.setInt16(off, r < 0 ? r * 0x8000 : r * 0x7FFF, true); off += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
};

Psy.downloadBlob = function (blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
};

Psy.Recorder = Recorder;
