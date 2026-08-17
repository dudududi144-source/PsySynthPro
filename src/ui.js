"use strict";
var Psy = (window.PsySynth = window.PsySynth || {});

(function () {
  const engine = new Psy.SynthEngine();
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
  const FTYPES = ['LP', 'HP', 'BP', 'NOTCH'];
  const LTYPES = ['FILTER', 'PITCH', 'AMP'];

  const LAYOUT = [
    { title: 'POLYBLEP OSC', color: '#ffb454', items: [
      { type: 'cycle', key: 'wave', label: 'WAVE', options: [0, 1, 2, 3, 4], display: function (v) { return WAVES[v]; } },
      { type: 'knob', key: 'detune', label: 'DETUNE', min: -100, max: 100, def: 0, fmt: fmtCt },
      { type: 'knob', key: 'unison', label: 'UNISON', min: 1, max: 7, step: 2, def: 3 },
      { type: 'knob', key: 'spread', label: 'SPREAD', min: 0, max: 50, def: 12, fmt: fmtCt },
      { type: 'knob', key: 'sub', label: 'SUB', min: 0, max: 100, def: 25, fmt: fmtPct }
    ]},
    { title: 'FM OPERATOR', color: '#ffd166', items: [
      { type: 'knob', key: 'fmRatio', label: 'RATIO', min: 0.5, max: 8, step: 0.5, def: 2, fmt: function (v) { return 'x' + v; } },
      { type: 'knob', key: 'fmDepth', label: 'DEPTH', min: 0, max: 100, def: 12, fmt: fmtPct }
    ]},
    { title: 'ZDF SVF', color: '#4dd6e8', items: [
      { type: 'cycle', key: 'filterType', label: 'TYPE', options: [0, 1, 2, 3], display: function (v) { return FTYPES[v]; } },
      { type: 'knob', key: 'cutoff', label: 'CUTOFF', min: 40, max: 16000, log: true, def: 2600, fmt: fmtHz },
      { type: 'knob', key: 'res', label: 'RES', min: 0.1, max: 20, step: 0.1, def: 2 },
      { type: 'knob', key: 'filterEnv', label: 'ENV AMT', min: 0, max: 100, def: 55, fmt: fmtPct }
    ]},
    { title: 'ANALOG ENV', color: '#e8ecf2', items: [
      { type: 'knob', key: 'attack', label: 'ATTACK', min: 1, max: 3000, log: true, def: 12, fmt: fmtMs },
      { type: 'knob', key: 'decay', label: 'DECAY', min: 10, max: 3000, log: true, def: 260, fmt: fmtMs },
      { type: 'knob', key: 'sustain', label: 'SUSTAIN', min: 0, max: 100, def: 70, fmt: fmtPct },
      { type: 'knob', key: 'release', label: 'RELEASE', min: 30, max: 5000, log: true, def: 650, fmt: fmtMs }
    ]},
    { title: 'LFO', color: '#b8e05a', items: [
      { type: 'cycle', key: 'lfoWave', label: 'WAVE', options: [0, 1], display: function (v) { return v === 1 ? 'SQR' : 'SIN'; } },
      { type: 'cycle', key: 'lfoTarget', label: 'TARGET', options: [0, 1, 2], display: function (v) { return LTYPES[v]; } },
      { type: 'knob', key: 'lfoRate', label: 'RATE', min: 0.1, max: 20, step: 0.1, def: 2.2, fmt: function (v) { return v.toFixed(1) + 'Hz'; } },
      { type: 'knob', key: 'lfoDepth', label: 'DEPTH', min: 0, max: 100, def: 35, fmt: fmtPct }
    ]},
    { title: 'MOD MATRIX', color: '#fbbf24', items: [
      { type: 'knob', key: 'lfoCutoff', label: 'LFO>CUT', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'lfoPitch', label: 'LFO>PIT', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'lfoAmp', label: 'LFO>AMP', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'lfoFM', label: 'LFO>FM', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'envPitch', label: 'ENV>PIT', min: 0, max: 100, def: 0, fmt: fmtPct },
      { type: 'knob', key: 'envFM', label: 'ENV>FM', min: 0, max: 100, def: 0, fmt: fmtPct }
    ]},
    { title: 'SPACE FX', color: '#f07dc2', items: [
      { type: 'knob', key: 'reverb', label: 'REVERB', min: 0, max: 100, def: 35, fmt: fmtPct },
      { type: 'knob', key: 'delay', label: 'DELAY', min: 0, max: 100, def: 22, fmt: fmtPct },
      { type: 'knob', key: 'master', label: 'MASTER', min: 0, max: 100, def: 80, fmt: fmtPct }
    ]}
  ];

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

    s.appendChild(row);
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
  function loadPreset(i) {
    pIdx = (i + NAMES.length) % NAMES.length;
    const name = NAMES[pIdx];
    engine.setAll(Psy.PRESETS[name]);
    syncUI();
    $('oName').textContent = name;
    document.querySelectorAll('.preset').forEach(function (x, j) {
      x.classList.toggle('on', j === pIdx);
    });
  }

  function buildPresets() {
    const wrap = $('presets');
    NAMES.forEach(function (name, i) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.textContent = name;
      b.addEventListener('click', function () { loadPreset(i); });
      wrap.appendChild(b);
    });
  }

  const LABEL = { 48: 'C3', 50: 'D3', 52: 'E3', 53: 'F3', 55: 'G3', 57: 'A3', 59: 'B3', 60: 'C4', 62: 'D4', 64: 'E4', 65: 'F4', 67: 'G4', 69: 'A4', 71: 'B4', 72: 'C5' };

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
    for (let n = 48; n <= 72; n++) {
      const black = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0;
      const k = document.createElement('div');
      k.className = 'key ' + (black ? 'b' : 'w');
      k.dataset.base = n;
      k.dataset.n = n;
      k.title = noteName(n);
      k.addEventListener('pointerdown', function () { noteOn(parseInt(k.dataset.n, 10)); });
      k.addEventListener('pointerup', function () { noteOff(parseInt(k.dataset.n, 10)); });
      k.addEventListener('pointerleave', function () { noteOff(parseInt(k.dataset.n, 10)); });
      kb.appendChild(k);
    }
  }

  function noteOn(n) {
    if (!engine.ready) return;
    noteRouter.noteOn(n, 0.8);
    const k = document.querySelector('[data-n="' + n + '"]');
    if (k) k.classList.add('on');
  }
  function noteOff(n) {
    if (!engine.ready) return;
    noteRouter.noteOff(n);
    const k = document.querySelector('[data-n="' + n + '"]');
    if (k) k.classList.remove('on');
  }

  function scopeLoop() {
    requestAnimationFrame(scopeLoop);
    const cv = $('scope'), c = cv.getContext('2d');
    c.fillStyle = 'rgba(2, 10, 15, 0.42)';
    c.fillRect(0, 0, cv.width, cv.height);
    if (!engine.ready) return;
    const data = new Uint8Array(engine.analyser.fftSize);
    engine.analyser.getByteTimeDomainData(data);
    c.strokeStyle = '#86f7ff';
    c.lineWidth = 1.6;
    c.shadowColor = '#00e5ff';
    c.shadowBlur = 7;
    c.beginPath();
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / data.length) * cv.width;
      const y = (data[i] / 255) * cv.height;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  function updateMeta() {
    if (!engine.ready) return;
    $('oMeta').innerHTML =
      (engine.ctx.sampleRate / 1000).toFixed(0) + 'kHz WORKLET<br>' +
      'LAT ' + engine.latencyMs().toFixed(1) + 'ms • 16 VOX';
  }

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
      if (!viz && Psy.Viz3D) {
        viz = new Psy.Viz3D($('viz3d'), engine.analyser);
        viz.start();
      }
      if (!midi && Psy.MidiEngine) {
        midi = new Psy.MidiEngine(engine, {
          status: midiStatus,
          event: function (txt) { const ev = $('midiEvent'); if (ev) ev.textContent = txt; }
        });
        midi.input = noteRouter;
        midi.init();
      }
      updateMeta();
      syncUI();
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

  safeBuild('macros', buildMacros);
  safeBuild('sections', buildSections);
  safeBuild('arp', buildArpPanel);
  safeBuild('seq', buildSeqPanel);
  safeBuild('wavetable', buildWavetableLab);
  safeBuild('morph', buildMorph);
  safeBuild('presets', buildPresets);
  safeBuild('keyboard', buildKeyboard);
  safeBuild('octrow', buildOctRow);
  try { loadPreset(0); } catch (err) { /* preset load non-fatal */ }
  window.__psyUiReady = true;
  scopeLoop();
})();
