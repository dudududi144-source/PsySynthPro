"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

/* SVG rotary knob — hardware style with tick marks.
   Drag vertically, scroll wheel, double-click = reset.   */

function polarPt(cx, cy, r, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function arcPath(cx, cy, r, a0, a1) {
  const s = polarPt(cx, cy, r, a0);
  const e = polarPt(cx, cy, r, a1);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return 'M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) +
         ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' +
         e.x.toFixed(2) + ' ' + e.y.toFixed(2);
}

class Knob {
  constructor(host, cfg) {
    this.cfg = cfg;
    this.min = cfg.min;
    this.max = cfg.max;
    this.log = !!cfg.log;
    this.value = cfg.value !== undefined ? cfg.value : cfg.def;
    this.onChange = cfg.onChange || function () {};
    this.size = cfg.size || 64;
    this.el = document.createElement('div');
    this.el.className = 'kwrap';
    host.appendChild(this.el);
    this.buildDOM();
    this.bind();
    this.render();
  }

  buildDOM() {
    const s = this.size;
    const NS = 'http://www.w3.org/2000/svg';
    this.zone = document.createElement('div');
    this.zone.className = 'kzone';
    this.zone.style.width = s + 'px';
    this.zone.style.height = s + 'px';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);

    /* tick marks */
    const ticks = document.createElementNS(NS, 'g');
    const NT = 11;
    for (let i = 0; i < NT; i++) {
      const a = -135 + (270 * i) / (NT - 1);
      const p1 = polarPt(50, 50, 47, a);
      const p2 = polarPt(50, 50, 42, a);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', p1.x.toFixed(2)); ln.setAttribute('y1', p1.y.toFixed(2));
      ln.setAttribute('x2', p2.x.toFixed(2)); ln.setAttribute('y2', p2.y.toFixed(2));
      ln.setAttribute('stroke', i % 5 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)');
      ln.setAttribute('stroke-width', i % 5 === 0 ? 2 : 1);
      ticks.appendChild(ln);
    }
    svg.appendChild(ticks);

    /* track */
    const track = document.createElementNS(NS, 'path');
    track.setAttribute('d', arcPath(50, 50, 34, -135, 135));
    track.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    track.setAttribute('stroke-width', 5);
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-linecap', 'round');
    svg.appendChild(track);

    /* value arc */
    this.valueArc = document.createElementNS(NS, 'path');
    this.valueArc.setAttribute('stroke', this.cfg.color);
    this.valueArc.setAttribute('stroke-width', 5);
    this.valueArc.setAttribute('fill', 'none');
    this.valueArc.setAttribute('stroke-linecap', 'round');
    this.valueArc.style.filter = 'drop-shadow(0 0 3px ' + this.cfg.color + ')';
    svg.appendChild(this.valueArc);

    this.zone.appendChild(svg);

    /* physical cap */
    this.cap = document.createElement('div');
    this.cap.className = 'kcap';
    this.cap.style.setProperty('--c', this.cfg.color);
    this.cap.innerHTML = '<div class="kptr"></div>';
    this.zone.appendChild(this.cap);

    this.el.appendChild(this.zone);

    const lab = document.createElement('div');
    lab.className = 'klabel';
    lab.textContent = this.cfg.label;
    this.el.appendChild(lab);

    this.valEl = document.createElement('div');
    this.valEl.className = 'kval';
    this.valEl.style.color = this.cfg.color;
    this.el.appendChild(this.valEl);
  }

  norm() {
    if (this.log) return Math.log(this.value / this.min) / Math.log(this.max / this.min);
    return (this.value - this.min) / (this.max - this.min);
  }
  fromNorm(p) {
    p = Math.min(1, Math.max(0, p));
    if (this.log) return this.min * Math.pow(this.max / this.min, p);
    return this.min + p * (this.max - this.min);
  }
  set(v, silent) {
    if (this.cfg.step) v = Math.round(v / this.cfg.step) * this.cfg.step;
    this.value = Math.min(this.max, Math.max(this.min, v));
    this.render();
    if (!silent) this.onChange(this.value);
  }
  render() {
    const p = this.norm();
    const a1 = -135 + 270 * p;
    if (a1 <= -133) this.valueArc.setAttribute('d', '');
    else this.valueArc.setAttribute('d', arcPath(50, 50, 34, -135, a1));
    this.cap.style.setProperty('--rot', (-135 + 270 * p) + 'deg');
    this.valEl.textContent = this.cfg.fmt ? this.cfg.fmt(this.value) : String(Math.round(this.value));
  }
  bind() {
    const self = this;
    let drag = false, sy = 0, sp = 0;
    this.zone.addEventListener('pointerdown', function (e) {
      drag = true; sy = e.clientY; sp = self.norm();
      self.zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.zone.addEventListener('pointermove', function (e) {
      if (drag) self.set(self.fromNorm(sp + (sy - e.clientY) / 150));
    });
    this.zone.addEventListener('pointerup', function () { drag = false; });
    this.zone.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.set(self.fromNorm(self.norm() + (e.deltaY < 0 ? 0.04 : -0.04)));
    }, { passive: false });
    this.zone.addEventListener('dblclick', function () { self.set(self.cfg.def); });
  }
}

/* selector button (cycles options, hardware-style) */
class CycleBtn {
  constructor(host, cfg) {
    this.cfg = cfg;
    this.idx = Math.max(0, cfg.options.indexOf(cfg.value));
    this.onChange = cfg.onChange || function () {};
    this.el = document.createElement('div');
    this.el.className = 'cbtn';
    this.el.innerHTML =
      '<button class="cb" style="--c:' + cfg.color + '"></button>' +
      '<div class="klabel">' + cfg.label + '</div>';
    this.btn = this.el.querySelector('.cb');
    host.appendChild(this.el);
    const self = this;
    this.btn.addEventListener('click', function () {
      self.idx = (self.idx + 1) % self.cfg.options.length;
      self.render();
      self.onChange(self.cfg.options[self.idx]);
    });
    this.render();
  }
  setValue(v) {
    const i = this.cfg.options.indexOf(v);
    if (i >= 0) { this.idx = i; this.render(); }
  }
  render() { this.btn.textContent = this.cfg.display(this.cfg.options[this.idx]); }
}

Psy.Knob = Knob;
Psy.CycleBtn = CycleBtn;
