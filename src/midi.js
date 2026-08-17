"use strict";
const Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ MIDI Engine (Phase 4) ═══════════
   Web MIDI input: note on/off with velocity, CC automation,
   and MPE-style per-note pitch bend (channel -> note tracking). */

class MidiEngine {
  constructor(engine, callbacks) {
    this.engine = engine;
    this.cb = callbacks || {};
    this.access = null;
    this.deviceNames = [];
    this.chanNote = {};       /* channel -> active note (for per-note bend) */
    this.bendRange = 2;       /* semitones */
    this.lastEvent = '';
  }

  init() {
    const self = this;
    if (!navigator.requestMIDIAccess) {
      this.emit('status', 'unsupported', null);
      return Promise.resolve(false);
    }
    return navigator.requestMIDIAccess({ sysex: false }).then(function (access) {
      self.access = access;
      self.bindInputs();
      access.onstatechange = function () { self.bindInputs(); };
      return true;
    }).catch(function () {
      self.emit('status', 'denied', null);
      return false;
    });
  }

  bindInputs() {
    const inputs = [];
    this.access.inputs.forEach(function (inp) { inputs.push(inp); });
    if (inputs.length === 0) {
      this.deviceNames = [];
      this.emit('status', 'no-device', null);
      return;
    }
    const self = this;
    inputs.forEach(function (inp) {
      inp.onmidimessage = function (e) { self.handle(e); };
    });
    this.deviceNames = inputs.map(function (i) { return i.name; });
    this.emit('status', 'connected', this.deviceNames.join(', '));
  }

  emit(type, a, b) {
    if (this.cb[type]) this.cb[type](a, b);
  }

  handle(e) {
    const d = e.data;
    if (d.length < 2) return;
    const cmd = d[0] & 0xf0;
    const ch = d[0] & 0x0f;
    const d1 = d[1];
    const d2 = d.length > 2 ? d[2] : 0;

    if (cmd === 0x90 && d2 > 0) {
      this.chanNote[ch] = d1;
      this.engine.noteOn(d1, d2 / 127);
      this.setLast('NOTE ON ' + this.noteName(d1) + ' vel ' + d2);
      this.emit('event', this.lastEvent);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      if (this.chanNote[ch] === d1) delete this.chanNote[ch];
      this.engine.noteOff(d1);
      this.setLast('NOTE OFF ' + this.noteName(d1));
      this.emit('event', this.lastEvent);
    } else if (cmd === 0xB0) {
      this.handleCC(d1, d2);
    } else if (cmd === 0xE0) {
      /* pitch bend -> per-note (MPE style) */
      const raw = ((d2 << 7) | d1) - 8192;
      const semis = (raw / 8192) * this.bendRange;
      const note = this.chanNote[ch];
      if (note !== undefined) this.engine.noteBend(note, semis);
      this.setLast('BEND ' + semis.toFixed(2) + 'st');
      this.emit('event', this.lastEvent);
    }
  }

  handleCC(cc, val) {
    const v = val / 127;
    switch (cc) {
      case 1:   /* mod wheel -> LFO depth */
        this.engine.set('lfoDepth', v * 100);
        this.setLast('CC1 MOD ' + Math.round(v * 100) + '%');
        break;
      case 74:  /* filter cutoff (log 40..16000) */
        this.engine.set('cutoff', 40 * Math.pow(400, v));
        this.setLast('CC74 CUTOFF ' + Math.round(40 * Math.pow(400, v)) + 'Hz');
        break;
      case 71:  /* resonance */
        this.engine.set('res', 0.1 + v * 19.9);
        this.setLast('CC71 RES ' + (0.1 + v * 19.9).toFixed(1));
        break;
      case 7:   /* channel volume -> master */
        this.engine.set('master', v * 100);
        this.setLast('CC7 VOL ' + Math.round(v * 100) + '%');
        break;
      default:
        this.setLast('CC' + cc + ' ' + val);
    }
    this.emit('cc', cc, val);
    this.emit('event', this.lastEvent);
  }

  setLast(s) { this.lastEvent = s; }

  noteName(n) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[n % 12] + (Math.floor(n / 12) - 1);
  }
}

Psy.MidiEngine = MidiEngine;
