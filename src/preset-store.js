"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ Preset Store (user presets, localStorage) ═══════════
   Clean persistence layer for user-created presets.
   Schema: { "<name>": { ...patch params... } }
   Names are sanitized; duplicates overwrite.                        */

const STORE_KEY = 'psysynthpro.userPresets.v1';

Psy.PresetStore = {
  _read: function () {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  },
  _write: function (obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  },
  sanitizeName: function (name) {
    return String(name || '').trim().slice(0, 32);
  },
  list: function () {
    return Object.keys(this._read());
  },
  get: function (name) {
    return this._read()[name] || null;
  },
  save: function (name, patch) {
    name = this.sanitizeName(name);
    if (!name) return false;
    const all = this._read();
    all[name] = patch;
    return this._write(all);
  },
  remove: function (name) {
    const all = this._read();
    if (!(name in all)) return false;
    delete all[name];
    return this._write(all);
  },
  count: function () {
    return this.list().length;
  }
};
