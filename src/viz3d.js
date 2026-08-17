"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* ═══════════ 3D Spectrum Visualizer (Phase 5) ═══════════
   Real perspective projection of frequency bars as 3D boxes,
   depth-sorted (painter's algorithm) with shaded faces.       */

class Viz3D {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.bins = 42;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.smooth = new Float32Array(this.bins);
    this.peaks = new Float32Array(this.bins);
    this.running = false;
    this.camDist = 320;
    this.fov = 430;
    this.time = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const self = this;
    function loop() {
      if (!self.running) return;
      self.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* rotate a point around Y then X, then perspective-project */
  project(x, y, z, yaw, pitch, cx, cy) {
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let rx = x * cyaw + z * syaw;
    let rz = -x * syaw + z * cyaw;
    let ry = y * cp - rz * sp;
    rz = y * sp + rz * cp;
    const pz = rz + this.camDist;
    const f = this.fov / (pz > 20 ? pz : 20);
    return { x: cx + rx * f, y: cy - ry * f, z: pz };
  }

  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.time += 0.008;

    /* background fade */
    ctx.fillStyle = 'rgba(3, 8, 14, 0.5)';
    ctx.fillRect(0, 0, W, H);

    this.analyser.getByteFrequencyData(this.freqData);
    const sr = (this.analyser.context ? this.analyser.context.sampleRate : 48000);
    const nyq = sr / 2;
    const fmin = 40, fmax = Math.min(16000, nyq);
    const n = this.freqData.length;

    /* log-spaced binning */
    for (let i = 0; i < this.bins; i++) {
      const f0 = fmin * Math.pow(fmax / fmin, i / this.bins);
      const f1 = fmin * Math.pow(fmax / fmin, (i + 1) / this.bins);
      let i0 = Math.floor(f0 / nyq * n);
      let i1 = Math.max(i0 + 1, Math.floor(f1 / nyq * n));
      i0 = Math.max(0, Math.min(n - 1, i0));
      i1 = Math.max(i0 + 1, Math.min(n, i1));
      let sum = 0;
      for (let j = i0; j < i1; j++) sum += this.freqData[j];
      let v = sum / (i1 - i0) / 255;
      v = Math.pow(v, 1.6);
      this.smooth[i] += (v - this.smooth[i]) * 0.28;
      if (this.smooth[i] > this.peaks[i]) this.peaks[i] = this.smooth[i];
      else this.peaks[i] *= 0.985;
    }

    /* camera with gentle sway */
    const yaw = -0.5 + Math.sin(this.time) * 0.06;
    const pitch = 0.42;
    const cx = W / 2, cy = H * 0.78;

    /* floor grid */
    this.drawFloor(yaw, pitch, cx, cy);

    /* build bars */
    const spacing = 150 / this.bins * 2.2;
    const barW = spacing * 0.62;
    const depth = spacing * 0.6;
    const bars = [];
    for (let i = 0; i < this.bins; i++) {
      const amp = this.smooth[i];
      const h = 2 + amp * 95;
      const x = (i - this.bins / 2 + 0.5) * spacing;
      const hue = 190 + (i / this.bins) * 110;
      bars.push({ i: i, x: x, h: h, amp: amp, hue: hue, depth: depth });
    }

    /* painter's sort: draw far bars first (larger projected z) */
    const self = this;
    bars.forEach(function (b) {
      const c = self.project(b.x, b.h / 2, 0, yaw, pitch, cx, cy);
      b.z = c.z;
    });
    bars.sort(function (a, b) { return b.z - a.z; });

    for (let bi = 0; bi < bars.length; bi++) {
      this.drawBar(bars[bi], barW, yaw, pitch, cx, cy);
    }
  }

  drawFloor(yaw, pitch, cx, cy) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(60, 120, 140, 0.14)';
    ctx.lineWidth = 1;
    const span = 110;
    for (let g = -4; g <= 4; g++) {
      const z = g * 14;
      const a = this.project(-span, 0, z, yaw, pitch, cx, cy);
      const b = this.project(span, 0, z, yaw, pitch, cx, cy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  drawBar(bar, barW, yaw, pitch, cx, cy) {
    const ctx = this.ctx;
    const x0 = bar.x - barW / 2, x1 = bar.x + barW / 2;
    const z0 = -bar.depth / 2, z1 = bar.depth / 2;
    const h = bar.h;

    /* 8 corners */
    const C = {
      b00: this.project(x0, 0, z0, yaw, pitch, cx, cy),
      b10: this.project(x1, 0, z0, yaw, pitch, cx, cy),
      b11: this.project(x1, 0, z1, yaw, pitch, cx, cy),
      b01: this.project(x0, 0, z1, yaw, pitch, cx, cy),
      t00: this.project(x0, h, z0, yaw, pitch, cx, cy),
      t10: this.project(x1, h, z0, yaw, pitch, cx, cy),
      t11: this.project(x1, h, z1, yaw, pitch, cx, cy),
      t01: this.project(x0, h, z1, yaw, pitch, cx, cy)
    };

    const hue = bar.hue;
    const amp = bar.amp;
    const lit = 30 + amp * 40;

    function face(ctx, p1, p2, p3, p4, fill) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    /* back/side face (right side, facing camera at negative yaw) */
    face(ctx, C.b10, C.b11, C.t11, C.t10, 'hsla(' + hue + ', 90%, ' + (lit * 0.55) + '%, 0.85)');
    /* front face */
    face(ctx, C.b00, C.b10, C.t10, C.t00, 'hsla(' + hue + ', 95%, ' + lit + '%, 0.9)');
    /* top face (brightest) */
    face(ctx, C.t00, C.t10, C.t11, C.t01, 'hsla(' + hue + ', 100%, ' + Math.min(85, lit + 25) + '%, 0.95)');

    /* glow cap on loud bars */
    if (amp > 0.5) {
      ctx.save();
      ctx.shadowColor = 'hsl(' + hue + ', 100%, 60%)';
      ctx.shadowBlur = 12;
      face(ctx, C.t00, C.t10, C.t11, C.t01, 'hsla(' + hue + ', 100%, 75%, 0.9)');
      ctx.restore();
    }
  }
}

Psy.Viz3D = Viz3D;
