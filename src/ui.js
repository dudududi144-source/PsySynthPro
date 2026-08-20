window.__psyShow = function (t) { var es = document.getElementById('psyErrStrip'); if (es) { es.style.display='block'; es.textContent = t; } };
"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

(function () {
  const engine = new Psy.SynthEngine();
  /* Perf HUD: live active-voice count reported from the worklet */
  engine.onVoices = function (count) {
    const hud = document.getElementById('perfHud');
    if (!hud) return;
    hud.textContent = 'VOICES ' + count + '/16';
    hud.className = 'perf-hud' + (count >= 12 ? ' hot' : (count >= 8 ? ' warm' : ''));
  };
  const arp = new Psy.Arpeggiator(engine);
  arp.onStep = function (note) {
    const k = document.querySelector('[data-n="' + note + '"]');
    if (!k) return;
    k.classList.add('arp-flash');
    setTimeout(function () { k.classList.remove('arp-flash'); }, 110);
  };
  const seq = new Psy.Sequencer(engine);
  const noteRouter = {
    noteOn: function (n, v) {
      if (seq.enabled) seq.noteOn(n, v);
      else if (arp.enabled) arp.noteOn(n, v);
      else engine.noteOn(n, v);
    },
    noteOff: function (n) {
      if (seq.enabled) seq.noteOff(n);
      else if (arp.enabled) arp.noteOff(n);
      else engine.noteOff(n);
    }
  };
  const REG = {};
  const $ = function (id) { return document.getElementById(id); };
  let pendingTable = null;
  let midi = null;
  let viz = null;
  let arpToggle = null;
  let seqToggle = null;
  let recorder = null;
  let midiRec = null;
  let lastNotes = [];

  function midiStatus(state, info) {
    const el = $('midiStrip');
    if (!el) return;
    if (state === 'connected') { el.textContent = 'MIDI \u25CF ' + info; el.classList.add('on'); el.classList.remove('off'); }
    else if (state === 'no-device') { el.textContent = 'MIDI \u25CB waiting for device\u2026'; el.classList.remove('on', 'off'); }
    else if (state === 'unsupported') { el.textContent = 'MIDI \u2715 not supported in this browser'; el.classList.add('off'); }
    else if (state === 'denied') { el.textContent = 'MIDI \u2715 permission denied'; el.classList.add('off'); }
  }

  const fmtHz = function (v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + 'Hz'; };
  const fmtMs = function (v) { return v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms'; };
  const fmtPct = function (v) { return Math.round(v) + '%'; };
  const fmtCt = function (v) { return (v > 0 ? '+' : '') + Math.round(v); };

  const WAVES = ['SAW', 'SQR', 'TRI', 'SINE', 'USER'];
  const FTYPES = ['LP', 'HP', 'BP', 'NOTCH', 'LAD'];
  const LTYPES = ['FILTER', 'PITCH', 'AMP'];

  function modSlotItems() {
  const items = [];
  const SRC = ['OFF','LFO1','LFO2','ENV1','ENV2','VEL'];
  const DST = ['OFF','CUT','PIT','AMP','FM','RES'];
  for (let i=0;i<8;i++){
    items.push({ type:'cycle', key:'m'+i+'s', label:'S'+(i+1), options:[0,1,2,3,4,5], display:function(v){return SRC[v];} });
    items.push({ type:'knob', key:'m'+i+'a', label:'A'+(i+1), min:-100, max:100, def:0, fmt:fmtPct });
    items.push({ type:'cycle', key:'m'+i+'d', label:'D'+(i+1), options:[0,1,2,3,4,5], display:function(v){return DST[v];} });
  }
  return items;
}
const LAYOUT = [
    { title: 'POLYBLEP OSC', color: '#ffb454', items: [
      { type: 'cycle', key: 'wave', label: 'WAVE', options: [0, 1, 2, 3, 4], display: function (v) { return WAVES[v]; } },
      { type: 'knob', key: 'detune', label: 'DETUNE', min: -100, max: 100, def: 0, fmt: fmtCt },
      { type: 'knob', key: 'unison', label: 'UNISON', min: 1, max: 7, step: 2, def: 3 },
      { type: 'knob', key: 'spread', label: 'SPREAD', min: 0, max: 50, def: 12, fmt: fmtCt },
      { type: 'knob', key: 'sub', label: 'SUB', min: 0, max: 100, def: 25, fmt: fmtPct },
      { type: 'knob', key: 'noise', label: 'NOISE', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'glideTime', label: 'GLIDE', min: 0, max: 500, def: 0, fmt: fmtMs }
    ]},
    { title: 'FM OPERATOR', color: '#ffd166', items: [
      { type: 'knob', key: 'fmRatio', label: 'RATIO', min: 0.5, max: 8, step: 0.5, def: 2, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fmDepth', label: 'DEPTH', min: 0, max: 100, def: 12, fmt: fmtPct },
      { type: 'knob', key: 'fm2Ratio', label: 'B RATIO', min: 0.5, max: 8, step: 0.5, def: 3, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fm2Depth', label: 'B DEPTH', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fm3Ratio', label: 'C RATIO', min: 0.5, max: 8, step: 0.5, def: 4, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fm3Depth', label: 'C DEPTH', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fm4Ratio', label: 'D RATIO', min: 0.5, max: 8, step: 0.5, def: 5, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fm4Depth', label: 'D DEPTH', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fm5Ratio', label: 'E RATIO', min: 0.5, max: 8, step: 0.5, def: 6, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fm5Depth', label: 'E DEPTH', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fm6Ratio', label: 'F RATIO', min: 0.5, max: 8, step: 0.5, def: 7, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fm6Depth', label: 'F DEPTH', min: 0, max: 100, def: 0, fmt: fmtPct }
    ]},
    { title: 'ZDF SVF', color: '#4dd6e8', items: [
      { type: 'cycle', key: 'filterType', label: 'TYPE', options: [0, 1, 2, 3, 4], display: function (v) { return FTYPES[v]; } },
      { type: 'knob', key: 'cutoff', label: 'CUTOFF', min: 40, max: 16000, log: true, def: 2600, fmt: fmtHz },
      { type: 'knob', key: 'res', label: 'RES', min: 0.1, max: 20, step: 0.1, def: 2 },
      { type: 'knob', key: 'wtPos', label: 'WT POS', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'filterEnv', label: 'ENV AMT', min: 0, max: 100, def: 55, fmt: fmtPct }
    ]},
    { title: 'ENVELOPES', color: '#e8ecf2', items: [
      { type: 'knob', key: 'attack', label: 'ATTACK', min: 1, max: 3000, log: true, def: 12, fmt: fmtMs },
      { type: 'knob', key: 'decay', label: 'DECAY', min: 10, max: 3000, log: true, def: 260, fmt: fmtMs },
      { type: 'knob', key: 'sustain', label: 'SUSTAIN', min: 0, max: 100, def: 70, fmt: fmtPct },
      { type: 'knob', key: 'release', label: 'RELEASE', min: 30, max: 5000, log: true, def: 650, fmt: fmtMs }
    ,
{ type: 'knob', key: 'fAttack', label: 'ATTACK', min: 1, max: 1000, def: 5, fmt: fmtMs },
      { type: 'knob', key: 'fDecay', label: 'DECAY', min: 10, max: 2000, def: 300, fmt: fmtMs },
      { type: 'knob', key: 'fSustain', label: 'SUSTAIN', min: 0, max: 100, def: 40, fmt: fmtPct },
      { type: 'knob', key: 'fRelease', label: 'RELEASE', min: 30, max: 4000, def: 400, fmt: fmtMs },
      { type: 'knob', key: 'fEnvAmt', label: 'AMOUNT', min: 0, max: 100, def: 60, fmt: fmtPct }
      ]},
    { title: 'LFO 1+2', color: '#b8e05a', items: [
      { type: 'cycle', key: 'lfoWave', label: 'WAVE', options: [0, 1], display: function (v) { return v === 1 ? 'SQR' : 'SIN'; } },
      { type: 'cycle', key: 'lfoTarget', label: 'TARGET', options: [0, 1, 2], display: function (v) { return LTYPES[v]; } },
      { type: 'knob', key: 'lfoRate', label: 'RATE', min: 0.1, max: 20, step: 0.1, def: 2.2, fmt: function (v) { return v.toFixed(1) + 'Hz'; } },
      { type: 'knob', key: 'lfoDepth', label: 'DEPTH', min: 0, max: 100, def: 35, fmt: fmtPct }
    ,
{ type: 'cycle', key: 'lfo2Wave', label: 'WAVE', options: [0,1], display: function (v) { return v===1?'SQR':'SIN'; } },
      { type: 'knob', key: 'lfo2Rate', label: 'RATE', min: 0.1, max: 20, step: 0.1, def: 5, fmt: function (v) { return v.toFixed(1)+'Hz'; } }
      ]},
    { title: 'FREE MOD MATRIX', color: '#fbbf24', items: modSlotItems() },
    { title: 'FX RACK', color: '#ff6b6b', items: [
      { type: 'knob', key: 'fxDist', label: 'DIST', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fxChorus', label: 'CHORUS', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'fxCrush', label: 'CRUSH', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'chRate', label: 'CH RATE', min: 0.1, max: 8, step: 0.1, def: 0.8, fmt: function (v) { return v.toFixed(1)+'Hz'; } }
    ]},
    { title: 'SPACE FX', color: '#f07dc2', items: [
      { type: 'knob', key: 'reverb', label: 'REVERB', min: 0, max: 100, def: 35, fmt: fmtPct },
      { type: 'knob', key: 'delay', label: 'DELAY', min: 0, max: 100, def: 22, fmt: fmtPct },
      { type: 'knob', key: 'width', label: 'WIDTH', min: 0, max: 100, def: 60, fmt: fmtPct },
      { type: 'knob', key: 'master', label: 'MASTER', min: 0, max: 100, def: 80, fmt: fmtPct }
    ]}
  ];

  function buildModMatrix() {
    const s = document.createElement('div');
    s.className = 'section matrix-section';
    s.innerHTML = '<div class="stitle" style="--c:#fbbf24">MOD MATRIX</div>';
    const grid = document.createElement('div');
    grid.className = 'mod-matrix';
    const sources = [
      { pre: 'modL', label: 'LFO' },
      { pre: 'modE', label: 'ENV' },
      { pre: 'modV', label: 'VEL' }
    ];
    const dests = [
      { suf: 'C', label: 'CUT' },
      { suf: 'P', label: 'PIT' },
      { suf: 'A', label: 'AMP' },
      { suf: 'F', label: 'FM' },
      { suf: 'R', label: 'RES' }
    ];
    const corner = document.createElement('div');
    corner.className = 'matrix-corner';
    grid.appendChild(corner);
    dests.forEach(function (dst) {
      const h = document.createElement('div');
      h.className = 'matrix-collabel';
      h.textContent = dst.label;
      grid.appendChild(h);
    });
    sources.forEach(function (src) {
      const rl = document.createElement('div');
      rl.className = 'matrix-rowlabel';
      rl.textContent = src.label;
      grid.appendChild(rl);
      dests.forEach(function (dst) {
        const key = src.pre + dst.suf;
        const knob = new Psy.Knob(grid, {
          label: '', color: '#fbbf24', min: -100, max: 100, def: 0, size: 54,
          value: engine.params[key] || 0,
          fmt: function (v) { return (v > 0 ? '+' : '') + Math.round(v); },
          onChange: function (v) { engine.set(key, v); }
        });
        REG[key] = knob;
      });
    });
    s.appendChild(grid);
    $('sections').appendChild(s);
  }

  function buildSections() {
    const root = $('sections');
    LAYOUT.forEach(function (sec) {
      const s = document.createElement('div');
      s.className = 'section';
      s.innerHTML = '<div class="stitle" style="--c:' + sec.color + '">' + sec.title + '</div>';
      const row = document.createElement('div');
      row.className = 'krow';
      sec.items.forEach(function (it) {
        it.color = sec.color;
        it.value = engine.params[it.key];
        it.onChange = function (v) { engine.set(it.key, v); };
        if (it.type === 'knob') REG[it.key] = new Psy.Knob(row, it);
        else REG[it.key] = new Psy.CycleBtn(row, it);
      });
      s.appendChild(row);
      root.appendChild(s);
    });
  }

  function syncUI() {
    if (typeof refreshModRings === 'function') { setTimeout(refreshModRings, 0); }
    Object.keys(REG).forEach(function (k) {
      const c = REG[k];
      if (c instanceof Psy.Knob) c.set(engine.params[k], true);
      else c.setValue(engine.params[k]);
    });
  }

  /* ═══════ WAVETABLE LAB ═══════ */
  let editor = null;
  function applyTable(table, name) {
    if (engine.ready) {
      engine.setWavetable(table);
      engine.set('wave', 4);
      if (REG.wave) REG.wave.setValue(4);
      $('oName').textContent = 'WT: ' + name;
    } else {
      pendingTable = { table: table, name: name };
      $('oName').textContent = 'WT QUEUED';
    }
  }

  function buildWavetableLab() {
    const s = document.createElement('div');
    s.className = 'section wt-section';
    s.innerHTML = '<div class="stitle" style="--c:#ff8a3c">WAVETABLE LAB</div>';

    const box = document.createElement('div');
    box.className = 'wt-box';

    const cv = document.createElement('canvas');
    cv.className = 'wt-canvas';
    cv.width = 240; cv.height = 84;
    box.appendChild(cv);

    const btnRow = document.createElement('div');
    btnRow.className = 'wt-btns';
    Object.keys(Psy.WT_PRESETS).forEach(function (name) {
      const b = document.createElement('button');
      b.className = 'wt-btn';
      b.textContent = name;
      b.addEventListener('click', function () {
        const table = Psy.renderTable(Psy.WT_PRESETS[name]);
        editor.loadTable(table);
        applyTable(table, name);
      });
      btnRow.appendChild(b);
    });

    const clearB = document.createElement('button');
    clearB.className = 'wt-btn wt-alt';
    clearB.textContent = 'CLEAR';
    clearB.addEventListener('click', function () { editor.clear(); });
    btnRow.appendChild(clearB);

    const applyB = document.createElement('button');
    applyB.className = 'wt-btn wt-go';
    applyB.textContent = 'USE DRAWING';
    applyB.addEventListener('click', function () {
      applyTable(editor.toTable(), 'CUSTOM');
    });
    btnRow.appendChild(applyB);

    const hint = document.createElement('div');
    hint.className = 'wt-hint';
    hint.textContent = 'draw a wave with your mouse, then USE DRAWING';
    box.appendChild(hint);
    box.appendChild(btnRow);
    s.appendChild(box);
    $('sections').appendChild(s);

    editor = new Psy.WavetableEditor(cv);
  }

  /* ═══════ MORPH ═══════ */
  const NAMES = Object.keys(Psy.PRESETS);
  function buildMorph() {
    const s = document.createElement('div');
    s.className = 'section wt-section';
    s.innerHTML = '<div class="stitle" style="--c:#c084fc">MORPH</div>';
    const box = document.createElement('div');
    box.className = 'morph-box';

    const selA = document.createElement('select');
    const selB = document.createElement('select');
    selA.className = 'msel'; selB.className = 'msel';
    NAMES.forEach(function (n, i) {
      selA.appendChild(new Option(n, i));
      selB.appendChild(new Option(n, i));
    });
    selB.selectedIndex = Math.min(2, NAMES.length - 1);

    const knobHost = document.createElement('div');
    knobHost.className = 'morph-knob';

    box.appendChild(selA);
    box.appendChild(knobHost);
    box.appendChild(selB);
    s.appendChild(box);
    $('sections').appendChild(s);

    const morphKnob = new Psy.Knob(knobHost, {
      label: 'MORPH', color: '#c084fc', min: 0, max: 100, def: 0,
      fmt: fmtPct,
      onChange: function () { doMorph(); }
    });

    function doMorph() {
      const a = Psy.PRESETS[NAMES[parseInt(selA.value, 10)]];
      const b = Psy.PRESETS[NAMES[parseInt(selB.value, 10)]];
      const t = morphKnob.value / 100;
      const mixed = Psy.morphPresets(a, b, t);
      engine.setAll(mixed);
      syncUI();
      $('oName').textContent = NAMES[parseInt(selA.value, 10)].split(' ')[0] + ' > ' + NAMES[parseInt(selB.value, 10)].split(' ')[0] + ' ' + Math.round(t * 100) + '%';
    }
    selA.addEventListener('change', doMorph);
    selB.addEventListener('change', doMorph);
  }

  /* ═══════ PERFORMANCE MACROS (Serum/Pigments-style) ═══════ */
  function buildMacros() {
    const s = document.createElement('div');
    s.className = 'section macros-section';
    s.innerHTML = '<div class="stitle" style="--c:#ffd166">PERFORMANCE MACROS</div>';
    const row = document.createElement('div');
    row.className = 'krow macros-row';

    const MACROS = [
      { label: 'M1 \u00B7 CUTOFF', color: '#4dd6e8', apply: function (v) {
          engine.set('cutoff', 40 * Math.pow(400, v / 100));
          if (REG.cutoff) REG.cutoff.set(engine.params.cutoff, true);
        } },
      { label: 'M2 \u00B7 RESO', color: '#ffb454', apply: function (v) {
          engine.set('res', 0.1 + (v / 100) * 19.9);
          if (REG.res) REG.res.set(engine.params.res, true);
        } },
      { label: 'M3 \u00B7 SPACE', color: '#f07dc2', apply: function (v) {
          engine.set('reverb', v);
          engine.set('delay', Math.round(v * 0.7));
          if (REG.reverb) REG.reverb.set(v, true);
          if (REG.delay) REG.delay.set(Math.round(v * 0.7), true);
        } },
      { label: 'M4 \u00B7 FM DRIVE', color: '#ffd166', apply: function (v) {
          engine.set('fmDepth', v);
          if (REG.fmDepth) REG.fmDepth.set(v, true);
        } }
    ];

    MACROS.forEach(function (m) {
      new Psy.Knob(row, {
        label: m.label, color: m.color, min: 0, max: 100, def: 50, size: 76,
        fmt: fmtPct,
        onChange: m.apply
      });
    });

    s.appendChild(row);
    $('sections').appendChild(s);
  }

  /* ═══════ ARPEGGIATOR panel ═══════ */
  function buildArpPanel() {
    const s = document.createElement('div');
    s.className = 'section';
    s.innerHTML = '<div class="stitle" style="--c:#f87171">ARPEGGIATOR</div>';
    const row = document.createElement('div');
    row.className = 'krow';

    arpToggle = new Psy.CycleBtn(row, {
      color: '#f87171', label: 'ARP', options: ['OFF', 'ON'], value: 'OFF',
      display: function (v) { return v; },
      onChange: function (v) {
        arp.setEnabled(v === 'ON');
        arpToggle.btn.classList.toggle('armed', v === 'ON');
        if (v === 'ON' && seq.enabled) {
          seq.setEnabled(false);
          if (seqToggle) { seqToggle.setValue('OFF'); seqToggle.btn.classList.remove('armed'); }
        }
      }
    });

    new Psy.CycleBtn(row, {
      color: '#f87171', label: 'HOLD', options: ['OFF', 'ON'], value: 'OFF',
      display: function (v) { return v; },
      onChange: function (v) {
        arp.hold = (v === 'ON');
        if (v === 'OFF') arp.held = [];
      }
    });

    new Psy.Knob(row, {
      color: '#f87171', label: 'BPM', min: 60, max: 200, def: 132,
      fmt: function (v) { return String(Math.round(v)); },
      onChange: function (v) { arp.bpm = v; }
    });

    new Psy.CycleBtn(row, {
      color: '#f87171', label: 'STEP', options: [0, 1, 2], value: 2,
      display: function (v) { return Psy.ARP_STEPS[v].label; },
      onChange: function (v) { arp.stepIdxDiv = v; }
    });

    new Psy.CycleBtn(row, {
      color: '#f87171', label: 'MODE', options: [0, 1, 2, 3], value: 0,
      display: function (v) { return Psy.ARP_PATTERNS[v]; },
      onChange: function (v) { arp.pattern = v; }
    });

    new Psy.Knob(row, {
      color: '#f87171', label: 'GATE', min: 10, max: 100, def: 60,
      fmt: fmtPct,
      onChange: function (v) { arp.gate = v; }
    });

    new Psy.Knob(row, {
      color: '#f87171', label: 'OCTAVE', min: 1, max: 3, step: 1, def: 1,
      onChange: function (v) { arp.octaves = Math.round(v); }
    });

    /* arp export — render current ARP pattern to a .mid clip for the DAW */
    const aExpRow = document.createElement('div');
    aExpRow.className = 'seq-tempos';
    const aExpBtn = document.createElement('button');
    aExpBtn.className = 'tempo-btn exp';
    aExpBtn.style.width = 'auto';
    aExpBtn.style.padding = '6px 14px';
    aExpBtn.innerHTML = '&#11015; EXPORT ARP (.mid)';
    aExpBtn.addEventListener('click', function () {
      let notes = arp.held.map(function (h) { return h.note; });
      if (notes.length === 0) notes = lastNotes.slice();
      if (notes.length === 0) notes = [36];
      const g = Psy.exportArpGroove(arp, notes, 2);
      if (!g.events.length) return;
      const blob = Psy.buildMidiFile(g.events, g.bpm, 480);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      Psy.downloadBlob(blob, 'psysynthpro-arp-' + g.bpm + 'bpm-' + stamp + '.mid');
    });
    aExpRow.appendChild(aExpBtn);

    s.appendChild(row);
    s.appendChild(aExpRow);
    $('sections').appendChild(s);
  }

  /* ═══════ STEP SEQUENCER panel ═══════ */
  const seqBtns = [];
  function buildSeqPanel2() {
    const host = document.getElementById('seqtop') || document.getElementById('sections');
    const s = document.createElement('div');
    s.className = 'section seq2';
    const stepBtns = [];
    let sel = 0;
    function stepper(label, get, set, min, max, stepv, fmt) {
      const w = document.createElement('div'); w.className = 'stp';
      const dec = document.createElement('button'); dec.className = 'stb'; dec.textContent = '-';
      const t = document.createElement('span'); t.className = 'stl'; t.textContent = label;
      const v = document.createElement('span'); v.className = 'stv';
      const inc = document.createElement('button'); inc.className = 'stb'; inc.textContent = '+';
      function upd() { v.textContent = fmt(get()); }
      dec.addEventListener('click', function () { set(Math.max(min, get() - stepv)); upd(); });
      inc.addEventListener('click', function () { set(Math.min(max, get() + stepv)); upd(); });
      w.appendChild(dec); w.appendChild(t); w.appendChild(v); w.appendChild(inc);
      w._upd = upd; return w;
    }
    const ed = document.createElement('div'); ed.className = 'seq2-ed';
    const wRoot = stepper('ROOT', function(){return seq.root;}, function(x){seq.root=x;}, 24, 60, 1, function(x){return x;});
    const wSwing = stepper('SWING', function(){return seq.swing;}, function(x){seq.swing=x;}, 0, 60, 5, function(x){return x+'%';});
    const wHuman = stepper('HUMAN', function(){return seq.human;}, function(x){seq.human=x;}, 0, 100, 10, function(x){return x+'%';});
    const wRat = stepper('RAT', function(){return seq.steps[sel].rat||1;}, function(x){seq.setStep(sel,{rat:x});}, 1, 4, 1, function(x){return 'x'+x;});
    const wNote = stepper('NOTE', function(){return seq.steps[sel].tr;}, function(x){seq.setStep(sel,{tr:x});}, -12, 12, 1, function(x){return (x>0?'+':'')+x;});
    const wVel = stepper('VEL', function(){return Math.round(seq.steps[sel].vel*100);}, function(x){seq.setStep(sel,{vel:x/100});}, 5, 100, 5, function(x){return x;});
    const wLen = stepper('LEN', function(){return seq.steps[sel].len;}, function(x){seq.setStep(sel,{len:x});}, 10, 200, 10, function(x){return x+'%';});
    const wTie = document.createElement('button'); wTie.className='stb tie'; wTie.textContent='TIE';
    function updTie(){ wTie.classList.toggle('on', !!seq.steps[sel].tie); }
    wTie.addEventListener('click', function(){ seq.setStep(sel,{tie:!seq.steps[sel].tie}); updTie(); refresh(); });
    ed.appendChild(wRoot); ed.appendChild(wSwing); ed.appendChild(wHuman); ed.appendChild(wRat);
    ed.appendChild(wNote); ed.appendChild(wVel); ed.appendChild(wLen); ed.appendChild(wTie);
    const grid = document.createElement('div'); grid.className = 'seq2-grid';
    function refresh() {
      for (let i = 0; i < Psy.SEQ_LEN; i++) {
        const st = seq.steps[i];
        stepBtns[i].className = 'sq2' + (st.on ? ' on' : '') + (i === sel ? ' sel' : '') + (st.tie ? ' tie' : '');
        stepBtns[i].style.opacity = st.on ? (0.45 + 0.55 * st.vel) : 0.25;
      }
      wRoot._upd(); wSwing._upd(); wHuman._upd(); wRat._upd(); wNote._upd(); wVel._upd(); wLen._upd(); updTie();
    }
    for (let i = 0; i < Psy.SEQ_LEN; i++) {
      const b = document.createElement('button'); b.className = 'sq2';
      b.addEventListener('click', function () { sel = i; seq.toggleStep(i); refresh(); });
      grid.appendChild(b); stepBtns.push(b);
    }
    const tr = document.createElement('div'); tr.className = 'seq2-tr';
    const snd = document.createElement('span'); snd.className='stl'; snd.textContent='SEQ→SYNTH';
    const run = document.createElement('button'); run.className = 'stb run'; run.textContent = 'RUN';
    function seqTryStart(n) {
      if (engine.ready) { if (!seq.enabled) seq.setEnabled(true); run.classList.add('on'); }
      else if (n > 0) setTimeout(function () { seqTryStart(n - 1); }, 200);
    }
    run.addEventListener('click', function () {
      if (seq.enabled) { seq.setEnabled(false); run.classList.remove('on'); return; }
      if (!engine.ready) { var pb = document.getElementById('bPower'); if (pb) pb.click(); }
      seqTryStart(15);
    });
    const bpmD = document.createElement('span'); bpmD.className = 'stv';
    const bpmDec = document.createElement('button'); bpmDec.className='stb'; bpmDec.textContent='-';
    const bpmInc = document.createElement('button'); bpmInc.className='stb'; bpmInc.textContent='+';
    function bpmU(){ bpmD.textContent = seq.bpm; }
    bpmDec.addEventListener('click', function(){ seq.bpm=Math.max(60,seq.bpm-1); bpmU(); });
    bpmInc.addEventListener('click', function(){ seq.bpm=Math.min(200,seq.bpm+1); bpmU(); });
    const pat = document.createElement('select'); pat.className = 'msel'; pat.id='ppattern'; pat.name='ppattern';
    Object.keys(Psy.SEQ_PATTERNS).forEach(function (k) { const o = document.createElement('option'); o.textContent = k; pat.appendChild(o); });
    pat.addEventListener('change', function () { seq.loadPattern(pat.value); refresh(); });
    const clr = document.createElement('button'); clr.className='stb'; clr.textContent='CLR';
    clr.addEventListener('click', function(){ for(let i=0;i<Psy.SEQ_LEN;i++) seq.setStep(i,{on:false,tie:false,tr:0,len:70,vel:0.72,rat:1}); refresh(); });
    /* TAP tempo */
    let taps = [];
    const tap = document.createElement('button'); tap.className='stb'; tap.textContent='TAP';
    tap.addEventListener('click', function () {
      const now = performance.now();
      taps = taps.filter(function (t) { return now - t < 2500; });
      taps.push(now);
      if (taps.length >= 2) {
        let sum = 0; for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i-1];
        const avg = sum / (taps.length - 1);
        seq.bpm = Math.max(60, Math.min(200, Math.round(60000 / avg)));
        bpmU();
      }
    });
    /* GEN: improv psy pattern generator */
    const gen = document.createElement('button'); gen.className='stb'; gen.textContent='GEN';
    gen.addEventListener('click', function () {
      const scale = [0,0,0,3,5,7,10]; /* psy-ish movement */
      for (let i = 0; i < Psy.SEQ_LEN; i++) {
        const on = Math.random() < (i % 4 === 0 ? 0.95 : 0.6);
        seq.setStep(i, {
          on: on,
          vel: (i % 4 === 0 ? 1 : 0.55 + Math.random() * 0.4),
          tr: (Math.random() < 0.25 ? scale[Math.floor(Math.random() * scale.length)] * (Math.random()<0.5?-1:1) : 0),
          len: 40 + Math.floor(Math.random() * 8) * 10,
          tie: (Math.random() < 0.12),
          rat: (Math.random() < 0.15 ? 2 : 1)
        });
      }
      refresh();
    });
    tr.appendChild(snd); tr.appendChild(run); tr.appendChild(bpmDec); tr.appendChild(bpmD); tr.appendChild(bpmInc); tr.appendChild(pat); tr.appendChild(clr); tr.appendChild(tap); tr.appendChild(gen);
    s.appendChild(tr); s.appendChild(grid); s.appendChild(ed);
    seq.onStep = function (pos, note) {
      for (let i = 0; i < Psy.SEQ_LEN; i++) stepBtns[i].classList.toggle('play', i === pos && note >= 0);
    };
    bpmU(); refresh();
    host.appendChild(s);
  }
/* ── COMPACT PRESET MENU ──────────────────────────────────────── */
  function buildPresetMenu() {
    const wrap = document.getElementById('presets');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.className = 'pmenu';
    const cat = document.createElement('select'); cat.className = 'msel'; cat.id='pcat'; cat.name='pcat';
    ['ALL','BASS','LEAD','PAD','ARP','FX','WT','USER','PRO'].forEach(function (c) { const o = document.createElement('option'); o.textContent = c; cat.appendChild(o); });
    const sel = document.createElement('select'); sel.className = 'msel big'; sel.id='ppreset'; sel.name='ppreset';
    function fill(term) {
      sel.innerHTML = '';
      const names = Object.keys(Psy.PRESETS).filter(function (n) {
        const c = cat.value; const q = term || '';
        if (q && n.indexOf(q) < 0) return false;
        if (c === 'ALL') return true;
        if (c === 'PRO') return n.indexOf('PRO') === 0;
        if (c === 'USER') return n.indexOf('USER') === 0 || n.indexOf('INIT') === 0;
        return n.indexOf(c) >= 0;
      });
      names.forEach(function (n) { const o = document.createElement('option'); o.textContent = n; sel.appendChild(o); });
    }
    cat.addEventListener('change', fill);
    sel.addEventListener('change', function () { if (typeof loadPreset === 'function') loadPreset(sel.value); });
    const save = document.createElement('button'); save.className = 'stb'; save.textContent = 'SAVE';
    save.addEventListener('click', function () {
      try {
        const name = 'USER ' + (Object.keys(Psy.PRESETS).filter(function(n){return n.indexOf('USER')===0;}).length + 1);
        if (typeof saveUserPreset === 'function') saveUserPreset(name); else if (typeof loadPreset==='function') {}
        fill();
      } catch (e) {}
    });
    const srch = document.createElement('input'); srch.type='text'; srch.className='msel'; srch.id='psearch2'; srch.placeholder='SEARCH...';
    srch.addEventListener('input', function(){ fill(srch.value.toUpperCase()); });
    const rnd = document.createElement('button'); rnd.className='stb'; rnd.textContent='RND';
    rnd.addEventListener('click', function(){
      const r = function(lo,hi){ return lo + Math.random()*(hi-lo); };
      engine.set('cutoff', Math.round(r(300,6000)));
      engine.set('res', Math.round(r(1,14)));
      engine.set('fmDepth', Math.round(r(0,60)));
      engine.set('filterEnv', Math.round(r(30,90)));
      engine.set('wtPos', Math.round(r(0,100)));
      syncUI();
    });
    /* A/B compare */
    let abSlot = 'A'; const abMem = { A: null, B: null };
    const bA = document.createElement('button'); bA.className='stb on'; bA.textContent='A';
    const bB = document.createElement('button'); bB.className='stb'; bB.textContent='B';
    const bCp = document.createElement('button'); bCp.className='stb'; bCp.textContent='A→B';
    function snap(){ const o={}; for(const k in engine.params) o[k]=engine.params[k]; return o; }
    function applySnap(o){ if(!o) return; engine.setAll(o); syncUI(); }
    bA.addEventListener('click', function(){ if(abSlot!=='A'){ abMem[abSlot]=snap(); abSlot='A'; applySnap(abMem.A); } bA.classList.add('on'); bB.classList.remove('on'); bCp.textContent='A→B'; });
    bB.addEventListener('click', function(){ if(abSlot!=='B'){ abMem[abSlot]=snap(); abSlot='B'; applySnap(abMem.B); } bB.classList.add('on'); bA.classList.remove('on'); bCp.textContent='B→A'; });
    bCp.addEventListener('click', function(){ if(abSlot==='A'){ abMem.B=snap(); } else { abMem.A=snap(); } });
    wrap.appendChild(cat); wrap.appendChild(sel); wrap.appendChild(save); wrap.appendChild(srch); wrap.appendChild(rnd);
    wrap.appendChild(bA); wrap.appendChild(bB); wrap.appendChild(bCp);
    fill();
  }

  safeBuild('macros', buildMacros);
  safeBuild('tabs', buildTabs);
  safeBuild('sections', buildSections);
  safeBuild('matrix', buildModMatrix);
  safeBuild('arp', buildArpPanel);
  safeBuild('seq2', buildSeqPanel2);
  safeBuild('wavetable', buildWavetableLab);
  safeBuild('morph', buildMorph);
  safeBuild('presetmenu', buildPresetMenu);
  safeBuild('recents', renderRecents);
  safeBuild('userbank', renderUserBank);
  safeBuild('savebtn', buildSaveBtn);
  safeBuild('canvases', setupCanvases);
  safeBuild('keyboard', buildKeyboard);
  safeBuild('octrow', buildOctRow);
  try { loadPreset(0); } catch (err) { /* preset load non-fatal */ }
  window.__psyUiReady = true;
  scopeLoop();
})();
