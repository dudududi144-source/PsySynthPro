"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ MIDI File Export (Phase 9) ═══════════
   Captures every note event (manual, arpeggiator or sequencer) by
   wrapping the engine note methods, then renders a Standard MIDI File
   (format 0, 480 PPQ) ready to drag into any DAW.                    */

function vlq(n) {
  const bytes = [];
  bytes.unshift(n & 0x7f);
  n = Math.floor(n / 128);
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  return bytes;
}

function pushStr(arr, s) {
  for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i));
}

class MidiRecorder {
  constructor(engine) {
    this.engine = engine;
    this.capturing = false;
    this.events = [];
    this.ppq = 480;
    this._orig = null;
  }

  start() {
    if (this.capturing || !this.engine.ready) return false;
    this.events = [];
    this.capturing = true;
    const eng = this.engine;
    const self = this;
    this._orig = {
      noteOn: eng.noteOn,
      noteOff: eng.noteOff,
      noteOnAt: eng.noteOnAt,
      noteOffAt: eng.noteOffAt
    };
    eng.noteOn = function (note, vel) {
      self.push(true, note, vel, eng.ctx.currentTime);
      return self._orig.noteOn.apply(eng, arguments);
    };
    eng.noteOff = function (note) {
      self.push(false, note, 0, eng.ctx.currentTime);
      return self._orig.noteOff.apply(eng, arguments);
    };
    eng.noteOnAt = function (note, vel, when) {
      self.push(true, note, vel, when);
      return self._orig.noteOnAt.apply(eng, arguments);
    };
    eng.noteOffAt = function (note, when) {
      self.push(false, note, 0, when);
      return self._orig.noteOffAt.apply(eng, arguments);
    };
    return true;
  }

  push(isOn, note, vel, t) {
    this.events.push({
      on: isOn,
      note: Math.max(0, Math.min(127, Math.round(note))),
      vel: Math.max(1, Math.min(127, Math.round((vel || 0.8) * 127))),
      t: t
    });
  }

  stop(bpm) {
    if (!this.capturing) return null;
    this.capturing = false;
    const eng = this.engine;
    eng.noteOn = this._orig.noteOn;
    eng.noteOff = this._orig.noteOff;
    eng.noteOnAt = this._orig.noteOnAt;
    eng.noteOffAt = this._orig.noteOffAt;
    this._orig = null;
    if (this.events.length === 0) return null;
    return Psy.buildMidiFile(this.events, bpm || 120, this.ppq);
  }
}

Psy.buildMidiFile = function (events, bpm, ppq) {
  /* track chunk */
  const track = [];
  const uspq = Math.round(60000000 / bpm);
  track.push(0x00, 0xFF, 0x51, 0x03, (uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff);

  const sorted = events.slice().sort(function (a, b) { return a.t - b.t; });
  const ticksPerSec = ppq * bpm / 60;
  let last = sorted[0].t;
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const dt = Math.max(0, Math.round((ev.t - last) * ticksPerSec));
    last = ev.t;
    const d = vlq(dt);
    for (let j = 0; j < d.length; j++) track.push(d[j]);
    if (ev.on) track.push(0x90, ev.note, ev.vel);
    else track.push(0x80, ev.note, 0);
  }
  track.push(0x00, 0xFF, 0x2F, 0x00);

  /* file = header + track */
  const out = [];
  pushStr(out, 'MThd');
  out.push(0, 0, 0, 6);
  out.push(0, 0);                       /* format 0 */
  out.push(0, 1);                       /* one track */
  out.push((ppq >> 8) & 0xff, ppq & 0xff);
  pushStr(out, 'MTrk');
  const len = track.length;
  out.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  for (let i = 0; i < track.length; i++) out.push(track[i]);

  return new Blob([new Uint8Array(out)], { type: 'audio/midi' });
};

Psy.MidiRecorder = MidiRecorder;
