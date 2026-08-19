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
  function buildSeqPanel() {
    const s = document.createElement('div');
    s.className = 'section seq-section';
    s.innerHTML = '<div class="stitle" style="--c:#60a5fa">STEP SEQ</div>';

    const grid = document.createElement('div');
    grid.className = 'seq-grid';
    for (let i = 0; i < Psy.SEQ_LEN; i++) {
      const btn = document.createElement('button');
      btn.className = 'seq-btn on' + (seq.steps[i].accent ? ' accent' : '');
      btn.addEventListener('click', (function (idx) {
        return function () {
          const st = seq.toggleStep(idx);
          seqBtns[idx].classList.toggle('on', st.on);
          seqBtns[idx].classList.toggle('accent', st.accent);
        };
      })(i));
      seqBtns.push(btn);
      grid.appendChild(btn);
    }
    s.appendChild(grid);

    /* psy pattern bank */
    const patRow = document.createElement('div');
    patRow.className = 'seq-patterns';
    function refreshGrid() {
      for (let i = 0; i < seqBtns.length; i++) {
        seqBtns[i].classList.toggle('on', seq.steps[i].on);
        seqBtns[i].classList.toggle('accent', seq.steps[i].accent);
      }
    }
    const patNames = Object.keys(Psy.SEQ_PATTERNS);
    const patBtns = [];
    patNames.forEach(function (name) {
      const pb = document.createElement('button');
      pb.className = 'pat-btn';
      pb.textContent = name;
      pb.addEventListener('click', function () {
        seq.loadPattern(name);
        refreshGrid();
        patBtns.forEach(function (x) { x.classList.remove('active'); });
        pb.classList.add('active');
      });
      patBtns.push(pb);
      patRow.appendChild(pb);
    });
    s.appendChild(patRow);

    /* psy tempo quick-set */
    const tempoRow = document.createElement('div');
    tempoRow.className = 'seq-tempos';
    const lbl = document.createElement('span');
    lbl.className = 'tempo-label';
    lbl.textContent = 'TEMPO';
    tempoRow.appendChild(lbl);
    [138, 141, 145, 150].forEach(function (t) {
      const tb = document.createElement('button');
      tb.className = 'tempo-btn' + (t === 141 ? ' active' : '');
      tb.textContent = String(t);
      tb.addEventListener('click', function () {
        seq.bpm = t;
        bpmKnob.set(t, true);
        tempoRow.querySelectorAll('.tempo-btn').forEach(function (x) { x.classList.remove('active'); });
        tb.classList.add('active');
      });
      tempoRow.appendChild(tb);
    });
    s.appendChild(tempoRow);

    /* groove export — render current SEQ pattern to a .mid clip for the DAW */
    const expRow = document.createElement('div');
    expRow.className = 'seq-tempos';
    const expBtn = document.createElement('button');
    expBtn.className = 'tempo-btn exp';
    expBtn.style.width = 'auto';
    expBtn.style.padding = '6px 14px';
    expBtn.innerHTML = '&#11015; EXPORT GROOVE (.mid)';
    expBtn.addEventListener('click', function () {
      let notes = seq.held.map(function (h) { return h.note; });
      if (notes.length === 0) notes = lastNotes.slice();
      if (notes.length === 0) notes = [36];
      notes.sort(function (x, y) { return x - y; });
      const g = Psy.exportSeqGroove(seq, notes, 2);
      if (!g.events.length) return;
      const blob = Psy.buildMidiFile(g.events, g.bpm, 480);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      Psy.downloadBlob(blob, 'psysynthpro-groove-' + g.bpm + 'bpm-' + stamp + '.mid');
      expBtn.innerHTML = '&#10003; SAVED';
      setTimeout(function () { expBtn.innerHTML = '&#11015; EXPORT GROOVE (.mid)'; }, 1200);
    });
    expRow.appendChild(expBtn);
    s.appendChild(expRow);

    const row = document.createElement('div');
    row.className = 'krow';

    seqToggle = new Psy.CycleBtn(row, {
      color: '#60a5fa', label: 'SEQ', options: ['OFF', 'ON'], value: 'OFF',
      display: function (v) { return v; },
      onChange: function (v) {
        seq.setEnabled(v === 'ON');
        seqToggle.btn.classList.toggle('armed', v === 'ON');
        if (v === 'ON' && arp.enabled) {
          arp.setEnabled(false);
          if (arpToggle) { arpToggle.setValue('OFF'); arpToggle.btn.classList.remove('armed'); }
        }
      }
    });

    new Psy.CycleBtn(row, {
      color: '#60a5fa', label: 'HOLD', options: ['OFF', 'ON'], value: 'OFF',
      display: function (v) { return v; },
      onChange: function (v) { seq.hold = (v === 'ON'); if (v === 'OFF') seq.held = []; }
    });

    new Psy.CycleBtn(row, {
      color: '#60a5fa', label: 'GLIDE', options: ['OFF', 'ON'], value: 'OFF',
      display: function (v) { return v; },
      onChange: function (v) {
        seq.glide = (v === 'ON');
        if (v === 'OFF' && seq.lastNote >= 0) { seq.engine.noteOff(seq.lastNote); seq.lastNote = -1; }
      }
    });

    const bpmKnob = new Psy.Knob(row, {
      color: '#60a5fa', label: 'BPM', min: 60, max: 200, def: 138,
      fmt: function (v) { return String(Math.round(v)); },
      onChange: function (v) { seq.bpm = v; }
    });

    new Psy.CycleBtn(row, {
      color: '#60a5fa', label: 'STEP', options: [0, 1, 2], value: 2,
      display: function (v) { return Psy.ARP_STEPS[v].label; },
      onChange: function (v) { seq.stepIdxDiv = v; }
    });

    new Psy.Knob(row, {
      color: '#60a5fa', label: 'GATE', min: 10, max: 100, def: 70,
      fmt: fmtPct,
      onChange: function (v) { seq.gate = v; }
    });

    s.appendChild(row);
    $('sections').appendChild(s);

    seq.onStep = function (pos, note) {
      for (let i = 0; i < seqBtns.length; i++) seqBtns[i].classList.remove('playing');
      if (seqBtns[pos]) seqBtns[pos].classList.add('playing');
      if (note >= 0) {
        const k = document.querySelector('[data-n="' + note + '"]');
        if (k) {
          k.classList.add('seq-flash');
          setTimeout(function () { k.classList.remove('seq-flash'); }, 100);
        }
      }
    };
  }

  /* ═══════ presets / keyboard / scope ═══════ */
  let pIdx = 0;
  /* ── user preset bank (localStorage) ── */
  const BANK_KEY = 'psysynth.userPresets.v1';
  function loadBank() {
    try { return JSON.parse(localStorage.getItem(BANK_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveBank(bank) {
    try { localStorage.setItem(BANK_KEY, JSON.stringify(bank)); } catch (e) {}
  }
  function clearPresetOn() {
    document.querySelectorAll('.preset').forEach(function (x) { x.classList.remove('on'); });
  }
  function renderUserBank() {
    const wrap = $('presets');
    wrap.querySelectorAll('.preset.user').forEach(function (x) {
      if (x.parentNode && x.parentNode.removeChild) x.parentNode.removeChild(x);
    });
    const saveBtn = wrap.querySelector ? wrap.querySelector('.preset.save') : null;
    const bank = loadBank();
    Object.keys(bank).forEach(function (name) {
      const b = document.createElement('button');
      b.className = 'preset user';
      b.title = 'load · \u2715 delete';
      const label = document.createElement('span');
      label.textContent = name;
      const del = document.createElement('span');
      del.className = 'pdel';
      del.textContent = '\u2715';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.confirm && window.confirm('Delete preset "' + name + '"?') === false) return;
        const bk = loadBank();
        delete bk[name];
        saveBank(bk);
        renderUserBank();
      });
      b.appendChild(label);
      b.appendChild(del);
      b.addEventListener('click', function () {
        engine.setAll(bank[name]);
        syncUI();
        $('oName').textContent = name;
        clearPresetOn();
        b.classList.add('on');
      });
      if (saveBtn && wrap.insertBefore) wrap.insertBefore(b, saveBtn); else wrap.appendChild(b);
    });
  }
  function buildSaveBtn() {
    const wrap = $('presets');
    const b = document.createElement('button');
    b.className = 'preset save';
    b.textContent = 'SAVE \ud83d\udcbe';
    b.addEventListener('click', function () {
      const bank = loadBank();
      let name = window.prompt ? window.prompt('Save current sound as:', 'MY PSY ' + (Object.keys(bank).length + 1)) : ('MY PSY ' + (Object.keys(bank).length + 1));
      if (!name) return;
      name = String(name).trim().slice(0, 24);
      if (!name) return;
      bank[name] = Object.assign({}, engine.params);
      saveBank(bank);
      renderUserBank();
      $('oName').textContent = name;
      clearPresetOn();
    });
    wrap.appendChild(b);
  }

  function loadPreset(i) {
    if (typeof i === 'string') { const idx = NAMES.indexOf(i); if (idx < 0) { if (Psy.PRESETS[i]) { pushHistory(); engine.setAll(Psy.PRESETS[i]); syncUI(); $('oName').textContent = i; } return; } i = idx; }
    pIdx = (i + NAMES.length) % NAMES.length;
    const name = NAMES[pIdx];
    pushHistory();
    engine.setAll(Psy.PRESETS[name]);
    syncUI();
    $('oName').textContent = name;
    clearPresetOn();
    const btns = document.querySelectorAll('.preset.factory');
    if (btns[pIdx]) btns[pIdx].classList.add('on');
  }

  function saveUserPreset(name) {
    const snap = {}; for (const k in engine.params) snap[k] = engine.params[k];
    Psy.PRESETS[name] = snap;
    if (NAMES.indexOf(name) < 0) NAMES.push(name);
    $('oName').textContent = name;
    return true;
  }
  function presetCategory(name) {
    if (/BASS/.test(name)) return 'BASS';
    if (/LEAD/.test(name)) return 'LEAD';
    if (/PAD|DRONE|CHOIR/.test(name)) return 'PAD';
    if (/ARP|PLUCK|STAB|BLEEP|ROLLING/.test(name)) return 'ARP';
    if (/FX|RISER|IMPACT/.test(name)) return 'FX';
    if (/^WT/.test(name)) return 'WT';
    return 'OTHER';
  }

  let activeCategory = 'ALL';
  let searchTerm = '';
  let paramHistory = [];
  let slotA = null, slotB = null;
  let pageVisible = true;
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
  });
  function getRecents() {
    try { return JSON.parse(localStorage.getItem('psy.recents') || '[]'); } catch (e) { return []; }
  }
  function pushRecent(name) {
    let r = getRecents().filter(function (x) { return x !== name; });
    r.unshift(name);
    r = r.slice(0, 6);
    try { localStorage.setItem('psy.recents', JSON.stringify(r)); } catch (e) {}
  }

  /* render recently-used presets into the bottom recents row */
  function renderRecents() {
    const wrap = document.getElementById('recents');
    if (!wrap) return;
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    const lab = document.createElement('span');
    lab.className = 'recents-label';
    lab.textContent = 'RECENT:';
    wrap.appendChild(lab);
    getRecents().forEach(function (name) {
      const b = document.createElement('button');
      b.className = 'preset recent';
      b.textContent = name;
      b.addEventListener('click', function () {
        // user preset or factory?
        if (Psy.PresetStore.get(name)) { loadUserPreset(name); renderRecents(); }
        else {
          const idx = NAMES.indexOf(name);
          if (idx >= 0) loadPreset(idx);
        }
      });
      wrap.appendChild(b);
    });
  }


  function buildPresets() {
    const wrap = $('presets');
    /* category filter row */
    const catRow = document.createElement('div');
    catRow.className = 'catrow';
    const cats = ['ALL', 'BASS', 'LEAD', 'PAD', 'ARP', 'FX', 'WT', 'USER'];
    cats.forEach(function (cat) {
      const b = document.createElement('button');
      b.className = 'catbtn' + (cat === 'ALL' ? ' active' : '');
      b.textContent = cat;
      b.addEventListener('click', function () {
        activeCategory = cat;
        catRow.querySelectorAll('.catbtn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderPresetButtons2();
      });
      catRow.appendChild(b);
    });
    wrap.appendChild(catRow);
    const searchIn = document.createElement('input');
    searchIn.type = 'text';
    searchIn.className = 'psearch';
    searchIn.placeholder = 'SEARCH PRESETS...';
    searchIn.setAttribute('aria-label', 'Search presets');
    searchIn.addEventListener('input', function () {
      searchTerm = searchIn.value.toUpperCase();
      renderPresetButtons2();
    });
    wrap.appendChild(searchIn);
    const utilRow = document.createElement('div');
    utilRow.className = 'catrow';
    function ubtn(label, fn) {
      const b = document.createElement('button');
      b.className = 'catbtn';
      b.textContent = label;
      b.addEventListener('click', fn);
      utilRow.appendChild(b);
      return b;
    }
    ubtn('UNDO', doUndo);
    ubtn('A', function () { loadSlot('A'); });
    ubtn('B', function () { loadSlot('B'); });
    ubtn('COPY>B', function () { copyToSlot('B'); });
    ubtn('COPY>A', function () { copyToSlot('A'); });
    wrap.appendChild(utilRow);
    const btnWrap = document.createElement('div');
    btnWrap.className = 'pbtns';
    btnWrap.id = 'pbtns';
    wrap.appendChild(btnWrap);
    /* point 'presets' button rendering into btnWrap */
    window.__pbtnWrap = btnWrap;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'catbtn savebtn';
    saveBtn.textContent = 'SAVE CURRENT';
    saveBtn.addEventListener('click', saveCurrentPreset);
    wrap.appendChild(saveBtn);
    const genBtn = document.createElement('button');
    genBtn.className = 'catbtn genbtn';
    genBtn.textContent = 'GEN VARIATIONS';
    genBtn.addEventListener('click', generateVariations);
    wrap.appendChild(genBtn);
    renderPresetButtons2();
  }
  function loadUserPreset(name) {
    const patch = Psy.PresetStore.get(name);
    if (!patch) return;
    engine.setAll(patch);
    syncUI();
    $('oName').textContent = name;
    pushRecent(name);
  }

  function renderPresetButtons2() {
    const wrap = window.__pbtnWrap;
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    /* factory presets */
    NAMES.forEach(function (name, i) {
      if (activeCategory !== 'ALL' && activeCategory !== 'USER' && presetCategory(name) !== activeCategory) return;
      if (activeCategory === 'USER') return;
      if (searchTerm && name.toUpperCase().indexOf(searchTerm) < 0) return;
      const b = document.createElement('button');
      b.className = 'preset factory';
      b.textContent = name;
      b.addEventListener('click', function () { loadPreset(i); pushRecent(name); renderRecents(); });
      wrap.appendChild(b);
    });
    /* user presets */
    if (activeCategory === 'ALL' || activeCategory === 'USER') {
      Psy.PresetStore.list().forEach(function (name) {
        if (searchTerm && name.toUpperCase().indexOf(searchTerm) < 0) return;
        const wrap2 = document.createElement('span');
        wrap2.className = 'upwrap';
        const b = document.createElement('button');
        b.className = 'preset user';
        b.textContent = name;
        b.addEventListener('click', function () { loadUserPreset(name); renderRecents(); });
        wrap2.appendChild(b);
        const del = document.createElement('button');
        del.className = 'updel';
        del.textContent = 'x';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          Psy.PresetStore.remove(name);
          renderPresetButtons2();
        });
        wrap2.appendChild(del);
        wrap.appendChild(wrap2);
      });
    }
  }

  function saveCurrentPreset() {
    const name = window.prompt ? window.prompt('Save current sound as:', 'MY SOUND') : 'MY SOUND';
    if (!name) return;
    const patch = {};
    for (const k in engine.params) patch[k] = engine.params[k];
    if (Psy.PresetStore.save(name, patch)) {
      activeCategory = 'USER';
      const catRow = document.querySelector('.catrow');
      if (catRow) {
        catRow.querySelectorAll('.catbtn').forEach(function (x) {
          x.classList.toggle('active', x.textContent === 'USER');
        });
      }
      renderPresetButtons2();
      pushRecent(name);
    }
  }

  function snapshotParams() { return Object.assign({}, engine.params); }
  function pushHistory() { paramHistory.push(snapshotParams()); if (paramHistory.length > 32) paramHistory.shift(); }
  function doUndo() {
    const p = paramHistory.pop();
    if (p) { engine.setAll(p); syncUI(); $('oName').textContent = 'UNDO'; }
  }
  function copyToSlot(slot) {
    if (slot === 'A') slotA = snapshotParams(); else slotB = snapshotParams();
    $('oName').textContent = 'COPIED TO ' + slot;
  }
  function loadSlot(slot) {
    pushHistory();
    const p = (slot === 'A') ? slotA : slotB;
    if (p) { engine.setAll(Object.assign({}, p)); syncUI(); $('oName').textContent = 'SLOT ' + slot; }
  }

  /* Generate musical variations of the current patch, save them as user presets */
  function generateVariations() {
    const base = {};
    for (const k in engine.params) base[k] = engine.params[k];
    const count = window.prompt ? parseInt(window.prompt('How many variations? (1-32)', '8'), 10) : 8;
    const n = Math.max(1, Math.min(32, isNaN(count) ? 8 : count));
    const baseName = ($('oName').textContent || 'SOUND').slice(0, 16).trim();
    const vars = Psy.Variation.generateMany(base, baseName, n, 0.5);
    let saved = 0;
    for (const vr of vars) {
      if (Psy.PresetStore.save(vr.name, vr.patch)) saved++;
    }
    activeCategory = 'USER';
    const catRow = document.querySelector('.catrow');
    if (catRow) {
      catRow.querySelectorAll('.catbtn').forEach(function (x) {
        x.classList.toggle('active', x.textContent === 'USER');
      });
    }
    renderPresetButtons2();
  }

const LABEL = { 48: 'C3', 50: 'D3', 52: 'E3', 53: 'F3', 55: 'G3', 57: 'A3', 59: 'B3', 60: 'C4', 62: 'D4', 64: 'E4', 65: 'F4', 67: 'G4', 69: 'A4', 71: 'B4', 72: 'C5', 74: 'D5', 76: 'E5', 77: 'F5', 79: 'G5', 81: 'A5', 83: 'B5', 84: 'C6' };

  /* ── Octave shift: OCT -/+ buttons + Z/X keys ── */
  let octShift = 0;
  function noteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return names[n % 12] + (Math.floor(n / 12) - 1);
  }
  function updateOctLabel() {
    const lbl = $('octLabel');
    if (lbl) lbl.textContent = noteName(48 + octShift * 12) + ' \u2013 ' + noteName(72 + octShift * 12) + '  [Z/X]';
  }
  function applyOctave() {
    document.querySelectorAll('#kb .key').forEach(function (k) {
      const base = parseInt(k.dataset.base, 10);
      k.dataset.n = String(base + octShift * 12);
      k.title = noteName(base + octShift * 12);
    });
    updateOctLabel();
  }
  function buildOctRow() {
    const kb = $('kb');
    const row = document.createElement('div');
    row.className = 'oct-row';
    const dn = document.createElement('button');
    dn.className = 'oct-btn'; dn.textContent = 'OCT \u2212';
    const lbl = document.createElement('span');
    lbl.className = 'oct-label'; lbl.id = 'octLabel';
    const up = document.createElement('button');
    up.className = 'oct-btn'; up.textContent = 'OCT +';
    dn.addEventListener('click', function () { if (octShift > -2) { octShift--; applyOctave(); } });
    up.addEventListener('click', function () { if (octShift < 2) { octShift++; applyOctave(); } });
    row.appendChild(dn); row.appendChild(lbl); row.appendChild(up);
    kb.parentNode.insertBefore(row, kb);
    updateOctLabel();
  }

  function buildKeyboard() {
    const kb = $('kb');
    for (let n = 48; n <= 84; n++) {
      const black = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0;
      const k = document.createElement('div');
      k.className = 'key ' + (black ? 'b' : 'w');
      k.dataset.base = n;
      k.dataset.n = n;
      k.title = noteName(n);
      k.addEventListener('pointerdown', function (e) {
        const rect = k.getBoundingClientRect();
        const rel = (e.clientY - rect.top) / Math.max(1, rect.height);
        const vel = Math.max(0.25, Math.min(1, 1.05 - rel));
        noteOn(parseInt(k.dataset.n, 10), vel);
      });
      k.addEventListener('pointerup', function () { noteOff(parseInt(k.dataset.n, 10)); });
      k.addEventListener('pointerleave', function () { noteOff(parseInt(k.dataset.n, 10)); });
      kb.appendChild(k);
    }
  }

  function noteOn(n, vel) {
    if (!engine.ready) return;
    if (lastNotes.indexOf(n) < 0) { lastNotes.push(n); if (lastNotes.length > 8) lastNotes.shift(); }
    noteRouter.noteOn(n, vel === undefined ? 0.8 : vel);
    const k = document.querySelector('[data-n="' + n + '"]');
    if (k) k.classList.add('on');
  }
  function noteOff(n) {
    if (!engine.ready) return;
    noteRouter.noteOff(n);
    const k = document.querySelector('[data-n="' + n + '"]');
    if (k) k.classList.remove('on');
  }

  function setupCanvases() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (dpr === 1) return;
    const cv = $('scope');
    if (!cv) return;
    const w = cv.width, h = cv.height;
    cv._w = w; cv._h = h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c2 = cv.getContext('2d');
    if (c2 && c2.setTransform) c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function scopeLoop() {
    requestAnimationFrame(scopeLoop);
    if (!pageVisible || !engine.ready) return;
    if (document.hidden) return;
    const cv = $('scope'), c = cv.getContext('2d');
    const W = cv._w || cv.width, H = cv._h || cv.height;
    c.fillStyle = 'rgba(2, 10, 15, 0.42)';
    c.fillRect(0, 0, W, H);
    if (!engine.ready) return;
    const data = new Uint8Array(engine.analyser.fftSize);
    engine.analyser.getByteTimeDomainData(data);
    c.strokeStyle = '#86f7ff';
    c.lineWidth = 1.6;
    c.shadowColor = '#00e5ff';
    c.shadowBlur = 7;
    c.beginPath();
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / data.length) * W;
      const y = (data[i] / 255) * H;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  function updateMeta() {
    if (!engine.ready) return;
    $('oMeta').innerHTML =
      (engine.ctx.sampleRate / 1000).toFixed(0) + 'kHz WORKLET<br>' +
      'LAT ' + (engine.latencyMs ? (engine.latencyMs() || 0) : 0).toFixed(1) + 'ms • 12 VOX';
  }

    /* always-on: first touch anywhere powers the synth */
  document.addEventListener('pointerdown', function __autoPower() {
    if (!engine.ready) $('bPower').click();
    document.removeEventListener('pointerdown', __autoPower);
  });
$('bPower').addEventListener('click', function () {
    if (engine.ready) return;
    engine.boot().then(function () {
      $('bPower').classList.add('on');
      if (pendingTable) {
        engine.setWavetable(pendingTable.table);
        engine.set('wave', 4);
        if (REG.wave) REG.wave.setValue(4);
        $('oName').textContent = 'WT: ' + pendingTable.name;
        pendingTable = null;
      }

      try {
        if (!midi && Psy.MidiEngine) {
          midi = new Psy.MidiEngine(engine, {
            status: midiStatus,
            event: function (txt) { const ev = $('midiEvent'); if (ev) ev.textContent = txt; }
          });
          midi.input = noteRouter;
          midi.init();
          window.__midi = midi;
        }
      } catch (e) { window.__psyShow('MIDI: ' + e.message); }
      try { updateMeta(); } catch (e) { window.__psyShow('META: ' + e.message); }
      try { syncUI(); } catch (e) { window.__psyShow('SYNC: ' + e.message); }
    }).catch(function (err) {
      $('oMeta').innerHTML = 'AUDIO ERROR';
      alert('Audio engine failed: ' + err.message);
    });
  });
  $('bPrev').addEventListener('click', function () { loadPreset(pIdx - 1); });
  $('bNext').addEventListener('click', function () { loadPreset(pIdx + 1); });
  $('bPanic').addEventListener('click', function () { engine.panic(); if (arp) arp.panic(); if (seq) seq.panic(); });

  $('bRec').addEventListener('click', function () {
    if (!engine.ready) return;
    if (!recorder) recorder = new Psy.Recorder(engine);
    const btn = $('bRec');
    if (!recorder.recording) {
      if (recorder.start()) {
        btn.classList.add('armed');
        btn.innerHTML = '&#9632; STOP';
      }
    } else {
      const blob = recorder.stop();
      btn.classList.remove('armed');
      btn.innerHTML = '&#9679; REC';
      if (blob) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        Psy.downloadBlob(blob, 'psysynthpro-' + stamp + '.wav');
        $('oName').textContent = 'WAV SAVED';
      }
    }
  });

  $('bMidi').addEventListener('click', function () {
    if (!engine.ready) return;
    if (!midiRec) midiRec = new Psy.MidiRecorder(engine);
    const btn = $('bMidi');
    if (!midiRec.capturing) {
      if (midiRec.start()) {
        btn.classList.add('armed');
        btn.innerHTML = '&#9632; STOP';
      }
    } else {
      const bpm = seq.enabled ? seq.bpm : (arp.enabled ? arp.bpm : 120);
      const blob = midiRec.stop(bpm);
      btn.classList.remove('armed');
      btn.innerHTML = '&#9836; MIDI';
      if (blob) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        Psy.downloadBlob(blob, 'psysynthpro-' + stamp + '.mid');
        $('oName').textContent = 'MIDI SAVED';
      } else {
        $('oName').textContent = 'NO NOTES';
      }
    }
  });

  const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75 };
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === 'z') { if (octShift > -2) { octShift--; applyOctave(); } return; }
    if (key === 'x') { if (octShift < 2) { octShift++; applyOctave(); } return; }
    const n = KEYMAP[key];
    if (n !== undefined) noteOn(n + octShift * 12);
  });
  document.addEventListener('keyup', function (e) {
    const n = KEYMAP[e.key.toLowerCase()];
    if (n !== undefined) noteOff(n + octShift * 12);
  });

  function safeBuild(name, fn) {
    try { fn(); }
    catch (err) {
      if (window.__psyErrors) window.__psyErrors.push(name + ': ' + err.message);
      else console.error(name, err);
    }
  }

  /* Mod rings: highlight knobs that are active modulation destinations */
  const DEST_PARAM = { 1: 'cutoff', 2: null, 3: null, 4: 'fmDepth', 5: 'res' };
  function refreshModRings() {
    const active = {};
    for (let i=0;i<8;i++) {
      const s = engine.params['m'+i+'s'], a = engine.params['m'+i+'a'], d = engine.params['m'+i+'d'];
      if (s && a && d) { const pk = DEST_PARAM[d]; if (pk) active[pk] = true; }
    }
    for (const k in REG) {
      const c = REG[k];
      if (c && c.zone) c.zone.classList.toggle('modulated', !!active[k]);
    }
  }
  /* Tab organization */
  const TABMAP = {"POLYBLEP OSC": "SYNTH", "FM OPERATOR": "SYNTH", "ZDF SVF": "SYNTH", "ENVELOPES": "SYNTH", "LFO 1+2": "MOD", "FREE MOD MATRIX": "MOD", "PERFORMANCE MACROS": "MOD", "FX RACK": "FX", "SPACE FX": "FX", "ARPEGGIATOR": "PERF", "STEP SEQ": "PERF", "WAVETABLE LAB": "PERF", "PRESET MORPH": "PERF"};
  function buildTabs() {
    const wrap = $('sections');
    const bar = document.createElement('div');
    bar.className = 'tabbar';
    const tabs = ['SYNTH','MOD','FX','PERF'];
    let active = 'SYNTH';
    function apply() {
      wrap.querySelectorAll('.section').forEach(function (sec) {
        const t = sec.getAttribute('data-tab');
        sec.setAttribute('data-hidden', (t && t !== active) ? '1' : '0');
      });
    }
    tabs.forEach(function (tb) {
      const b = document.createElement('button');
      b.className = 'tabbtn' + (tb === active ? ' active' : '');
      b.textContent = tb;
      b.addEventListener('click', function () {
        active = tb;
        bar.querySelectorAll('.tabbtn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        apply();
      });
      bar.appendChild(b);
    });
    wrap.parentNode.insertBefore(bar, wrap);
    // tag sections by their title
    wrap.querySelectorAll('.section').forEach(function (sec) {
      const h = sec.querySelector('.stitle');
      const name = h ? h.textContent.trim() : '';
      sec.setAttribute('data-tab', TABMAP[name] || 'SYNTH');
    });
    apply();
  }


  /* ── MINIMAL STEP SEQ (top, smart editor) ─────────────────────── */
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
    run.addEventListener('click', function () {
      if (!seq.enabled && !engine.ready) { var pb = document.getElementById('bPower'); if (pb) pb.click(); }
      setTimeout(function () { seq.setEnabled(!seq.enabled); run.classList.toggle('on', seq.enabled); }, engine.ready ? 0 : 400);
    });
    const bpmD = document.createElement('span'); bpmD.className = 'stv';
    const bpmDec = document.createElement('button'); bpmDec.className='stb'; bpmDec.textContent='-';
    const bpmInc = document.createElement('button'); bpmInc.className='stb'; bpmInc.textContent='+';
    function bpmU(){ bpmD.textContent = seq.bpm; }
    bpmDec.addEventListener('click', function(){ seq.bpm=Math.max(60,seq.bpm-1); bpmU(); });
    bpmInc.addEventListener('click', function(){ seq.bpm=Math.min(200,seq.bpm+1); bpmU(); });
    const pat = document.createElement('select'); pat.className = 'msel';
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
    const cat = document.createElement('select'); cat.className = 'msel';
    ['ALL','BASS','LEAD','PAD','ARP','FX','WT','USER','PRO'].forEach(function (c) { const o = document.createElement('option'); o.textContent = c; cat.appendChild(o); });
    const sel = document.createElement('select'); sel.className = 'msel big';
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
    wrap.appendChild(cat); wrap.appendChild(sel); wrap.appendChild(save); wrap.appendChild(srch); wrap.appendChild(rnd);
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
