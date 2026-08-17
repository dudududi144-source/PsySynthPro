"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ Wavetable toolkit (Phase 3) ═══════════ */

Psy.WT_SIZE = 2048;

/* Render a band-limited wavetable from a harmonic amplitude list.
   Band-limited by construction: only integer harmonics below the table
   Nyquist are summed, so no discontinuity aliasing.                */
Psy.renderTable = function (harmonics, size) {
  size = size || Psy.WT_SIZE;
  const t = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let s = 0;
    const ph = i / size;
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin(6.28318530718 * (h + 1) * ph);
    }
    t[i] = s;
  }
  let mx = 0;
  for (let i = 0; i < size; i++) mx = Math.max(mx, Math.abs(t[i]));
  if (mx > 0) for (let i = 0; i < size; i++) t[i] = (t[i] / mx) * 0.9;
  return t;
};

/* Built-in artistic wavetables (harmonic recipes) */
Psy.WT_PRESETS = {
  'COSMIC':  [1, 0.62, 0.44, 0.31, 0.23, 0.17, 0.12, 0.08, 0.05, 0.03, 0.018, 0.01],
  'NEURO':   [1, 0.85, 0.35, 0.7, 0.2, 0.55, 0.12, 0.4, 0.06, 0.28, 0.03, 0.18],
  'GLASS':   [1, 0.15, 0.6, 0.08, 0.42, 0.05, 0.28, 0.03, 0.16, 0.02, 0.09, 0.01],
  'VOID':    [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.12, 0.07, 0.03],
  'VOCAL':   [1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.5, 0.15, 0.35, 0.1, 0.2, 0.05]
};

/* Draw a table onto a canvas (for editor display) */
Psy.drawTable = function (ctx, table, w, h, color) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.strokeStyle = color || '#86f7ff';
  ctx.lineWidth = 1.8;
  ctx.shadowColor = color || '#00e5ff';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * table.length);
    const y = h / 2 - table[idx] * (h / 2 - 4);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
};

/* ─── Wavetable Editor: draw your own single-cycle wave ─── */
class WavetableEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.samples = new Float32Array(this.w);
    this.samples.fill(0);
    this.drawing = false;
    this.bind();
    this.redraw();
  }

  bind() {
    const self = this;
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'crosshair';
    this.canvas.addEventListener('pointerdown', function (e) {
      self.drawing = true;
      self.canvas.setPointerCapture(e.pointerId);
      self.paint(e);
    });
    this.canvas.addEventListener('pointermove', function (e) {
      if (self.drawing) self.paint(e);
    });
    this.canvas.addEventListener('pointerup', function () { self.drawing = false; });
  }

  paint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * this.w);
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const val = Math.max(-1, Math.min(1, -y));
    if (x >= 0 && x < this.w) {
      this.samples[x] = val;
      if (x > 0 && Math.abs(this.samples[x - 1]) < 0.001 && Math.abs(val) > 0.001) {
        this.samples[x - 1] = val * 0.5;
      }
    }
    this.redraw();
  }

  clear() {
    this.samples.fill(0);
    this.redraw();
  }

  loadTable(table) {
    for (let x = 0; x < this.w; x++) {
      this.samples[x] = table[Math.floor((x / this.w) * table.length)];
    }
    this.redraw();
  }

  redraw() {
    const c = this.ctx, w = this.w, h = this.h;
    c.fillStyle = '#03131a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    c.strokeStyle = '#ffb454';
    c.lineWidth = 1.6;
    c.shadowColor = '#ff8a3c';
    c.shadowBlur = 4;
    c.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 - this.samples[x] * (h / 2 - 4);
      if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  /* resample drawing into a wavetable with gentle smoothing */
  toTable(size) {
    size = size || Psy.WT_SIZE;
    const raw = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const pos = (i / size) * this.w;
      const i0 = Math.floor(pos);
      const i1 = Math.min(this.w - 1, i0 + 1);
      const frac = pos - i0;
      raw[i] = this.samples[i0] + (this.samples[i1] - this.samples[i0]) * frac;
    }
    const out = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const a = raw[(i - 1 + size) % size];
      const b = raw[i];
      const c2 = raw[(i + 1) % size];
      out[i] = a * 0.25 + b * 0.5 + c2 * 0.25;
    }
    let mx = 0;
    for (let i = 0; i < size; i++) mx = Math.max(mx, Math.abs(out[i]));
    if (mx > 0.001) for (let i = 0; i < size; i++) out[i] = (out[i] / mx) * 0.9;
    return out;
  }
}
Psy.WavetableEditor = WavetableEditor;

/* ─── Preset morphing: interpolate two presets ─── */
Psy.morphPresets = function (a, b, t) {
  const out = {};
  const keys = Object.keys(a);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const av = a[k], bv = b[k];
    if (typeof av === 'number' && typeof bv === 'number') {
      const v = av + (bv - av) * t;
      if (k === 'wave' || k === 'filterType' || k === 'lfoTarget') {
        out[k] = Math.round(v);
      } else if (k === 'unison') {
        out[k] = Math.round(v / 2) * 2 === 0 ? 1 : Math.max(1, Math.round(v));
      } else {
        out[k] = v;
      }
    } else {
      out[k] = t < 0.5 ? av : bv;
    }
  }
  return out;
};
