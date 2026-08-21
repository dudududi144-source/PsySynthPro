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
      s.className = 'section' + (/FM OPERATOR|MOD MATRIX|WAVETABLE|MORPH/.test(sec.title) ? ' adv' : '');
      s.innerHTML = '<div class="stitle" style="--c:' + sec.color + '">' + sec.title + '</div>';
      const row = document.createElement('div');
      row.className = 'krow';
      var TIPS={cutoff:'תדר חיתוך הפילטר - בהירות',res:'רזוננס - שריקה ליד ה-cutoff',attack:'זמן התקפה - כניסה רכה/חדה',release:'זמן שחרור - זנב הצליל',fmDepth:'עומק FM - מתכתיות/פעמונים',lfoDepth:'עומק LFO - ויברטו/וואה',unison:'מספר קולות - עובי',detune:'סטיית כיוון בין קולות',reverb:'הדהוד - מרחב',delay:'הד - חזרות',sub:'תת-באס - עומק נמוך'};
      sec.items.forEach(function (it) { if (TIPS[it.key]) it.title = TIPS[it.key];
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

    let lastPlay = -1;
    seq.onStep = function (pos, note) {
      if (lastPlay >= 0 && seqBtns[lastPlay]) seqBtns[lastPlay].classList.remove('playing');
      lastPlay = (note >= 0) ? pos : -1;
      if (lastPlay >= 0 && seqBtns[lastPlay]) seqBtns[lastPlay].classList.add('playing');
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
    window.__octShift = octShift;
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
    if (window.matchMedia && window.matchMedia('(max-width:700px)').matches) return;
    scopeLoop._f=(scopeLoop._f||0)+1; if (scopeLoop._f%2) return;
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
  var __wavBusy = false;
  function exportWav() {
    if (__wavBusy || !window.engine || !engine.ctx) return; __wavBusy = true;
    var ctx = engine.ctx; var sp = ctx.createScriptProcessor(4096, 2, 2);
    var chunks = []; var total = 0; var dur = 4;
    var silent = ctx.createGain(); silent.gain.value = 0; sp.connect(silent); silent.connect(ctx.destination);
    engine.master.connect(sp);
    function encWav(ch, sr) {
      var n = 0; for (var q = 0; q < ch.length; q++) n += ch[q][0].length;
      var buf = new ArrayBuffer(44 + n * 2 * 2); var v = new DataView(buf);
      function ws(o, s) { for (var q = 0; q < s.length; q++) v.setUint8(o + q, s.charCodeAt(q)); }
      ws(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
      ws(36, 'data'); v.setUint32(40, n * 4, true);
      var off = 44; for (var q = 0; q < ch.length; q++) { var L = ch[q][0], R = ch[q][1]; for (var i = 0; i < L.length; i++) { v.setInt16(off, Math.max(-32768, Math.min(32767, L[i] * 32767)), true); off += 2; v.setInt16(off, Math.max(-32768, Math.min(32767, R[i] * 32767)), true); off += 2; } }
      return new Blob([buf], { type: 'audio/wav' });
    }
    sp.onaudioprocess = function (e) {
      chunks.push([new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1))]);
      total += e.inputBuffer.length;
      if (total >= dur * ctx.sampleRate) { sp.disconnect(); silent.disconnect(); engine.master.disconnect(sp); __wavBusy = false;
        var blob = encWav(chunks, ctx.sampleRate); var u = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = u; a.download = 'psysynth-mix.wav'; document.body.appendChild(a); a.click(); a.remove(); } };
  }
  function buildSeqPanel2() {
  var host = document.getElementById('seqtop') || document.getElementById('sections');
  var s = document.createElement('div'); s.className = 'section seq2';
  s.innerHTML = '<div class="stitle" style="--c:#2dd4bf">STEP SEQUENCER <span id="seqRead" style="float:right;color:#7ff3ff"></span></div>'
    + '<div class="seqhint">TAP = on/vel &middot; DRAG = paint &middot; select step then VEL/TR/GATE/RATCH</div>';
  var seq = new Psy.Sequencer(engine); window.__seq = seq; seq.autorestore();
  var sel = 0; var cells = []; var drumCells = [];
  var tr = document.createElement('div'); tr.className = 'krow';
  var vm = document.createElement('button'); vm.className = 'stb'; vm.textContent = 'PRO';
  vm.addEventListener('click', function () { var simple = document.body.classList.toggle('simple'); vm.textContent = simple ? 'SIMPLE' : 'PRO'; vm.classList.toggle('on', !simple); try { localStorage.setItem('psy.view', simple ? 'simple' : 'pro'); } catch (e) {} });
  tr.appendChild(vm);
  try { if (localStorage.getItem('psy.view') === 'simple') { document.body.classList.add('simple'); vm.textContent = 'SIMPLE'; } } catch (e) {}
  var run = document.createElement('button'); run.className = 'stb'; run.textContent = 'RUN';
  run.addEventListener('click', function () { if (window.engine && !engine.ready) { var pb = document.getElementById('bPower'); if (pb) pb.click(); } seq.setEnabled(!seq.enabled); run.textContent = seq.enabled ? 'STOP' : 'RUN'; run.classList.toggle('on', seq.enabled); seq.autosave(); });
  tr.appendChild(run);
  var hold = document.createElement('button'); hold.className = 'stb'; hold.textContent = 'HOLD';
  hold.addEventListener('click', function () { seq.hold = !seq.hold; hold.classList.toggle('on', seq.hold); });
  tr.appendChild(hold);
  var pat = document.createElement('select'); pat.className = 'msel'; pat.id = 'ppattern'; pat.name = 'ppattern';
  Object.keys(Psy.SEQ_PATTERNS).forEach(function (n) { var o = document.createElement('option'); o.textContent = n; pat.appendChild(o); });
  pat.addEventListener('change', function () { seq.loadPattern(pat.value); paint(); });
  tr.appendChild(pat);
  var clr = document.createElement('button'); clr.className = 'stb'; clr.textContent = 'CLEAR';
  clr.addEventListener('click', function () { for (var i = 0; i < Psy.SEQ_LEN; i++) { seq.steps[i].on = false; seq.drums.k[i] = false; seq.drums.s[i] = false; seq.drums.h[i] = false; } paint(); });
  tr.appendChild(clr);
  var rnd = document.createElement('button'); rnd.className = 'stb'; rnd.textContent = 'RANDOM';
  rnd.addEventListener('click', function () { for (var i = 0; i < Psy.SEQ_LEN; i++) { seq.steps[i].on = Math.random() < 0.5; seq.steps[i].vel = 0.5 + Math.random() * 0.5; seq.drums.k[i] = (i % 4 === 0) || Math.random() < 0.1; seq.drums.h[i] = Math.random() < 0.6; seq.drums.s[i] = (i === 4 || i === 12); } paint(); });
  tr.appendChild(rnd);
  var mel = document.createElement('button'); mel.className = 'stb'; mel.textContent = 'MELODIC';
  mel.addEventListener('click', function () { seq.melodic(); paint(); });
  tr.appendChild(mel);
  var taps = []; var tp = document.createElement('button'); tp.className = 'stb'; tp.textContent = 'TAP';
  tp.addEventListener('click', function () { var now = performance.now(); taps = taps.filter(function (x) { return now - x < 3000; }); taps.push(now);
    if (taps.length >= 2) { var d = 0; for (var i = 1; i < taps.length; i++) d += taps[i] - taps[i - 1]; var ms = d / (taps.length - 1); var bpm = Math.round(60000 / ms); seq.bpm = Math.max(60, Math.min(200, bpm)); if (window.__cond) window.__cond.bpm = seq.bpm; } });
  tr.appendChild(tp);
  var pl = document.createElement('button'); pl.className = 'stb'; pl.textContent = 'POLY 3:2';
  pl.addEventListener('click', function () { seq.poly = !seq.poly; pl.classList.toggle('on', seq.poly); });
  tr.appendChild(pl);
  var demo = document.createElement('button'); demo.className = 'stb'; demo.textContent = 'DEMO';
  demo.addEventListener('click', function () {
    try { if (typeof loadPreset === 'function') loadPreset('PRO FULLON ROLL'); } catch (e) {}
    seq.style('PSY FULL-ON'); seq.setEnabled(true);
    var C = window.__cond; if (C) { C.setEnabled(true); } });
  tr.appendChild(demo);
  var wv = document.createElement('button'); wv.className = 'stb'; wv.textContent = 'EXPORT WAV'; wv.addEventListener('click', function () { exportWav(); }); tr.appendChild(wv);
  var ep = document.createElement('button'); ep.className = 'stb'; ep.textContent = 'EXPORT PROJ';
  ep.addEventListener('click', function () { var data = { seq: seq.toJSON(), preset: (window.__lastPreset || ''), build: window.__psyBuild };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var u = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = u; a.download = 'psysynth-project.json'; document.body.appendChild(a); a.click(); a.remove(); });
  tr.appendChild(ep);
  var ex = document.createElement('button'); ex.className = 'stb'; ex.textContent = 'EXPORT MIDI';
  ex.addEventListener('click', function () {
    var ev = []; var sd = (60 / seq.bpm) * (seq.div || 0.25); var N = seq.steps.length;
    for (var i = 0; i < N; i++) { var t = i * sd; var st = seq.steps[i];
      if (st.on) { var n = seq.root + (st.tr | 0); var g = Math.max(0.03, sd * ((st.len == null ? 75 : st.len) / 100)); ev.push({ on: true, note: n, vel: Math.max(1, Math.min(127, Math.round(st.vel * 127))), t: t }); ev.push({ on: false, note: n, vel: 0, t: t + g }); }
      if (seq.drums.k[i]) { ev.push({ on: true, note: 36, vel: 100, t: t }); ev.push({ on: false, note: 36, vel: 0, t: t + 0.1 }); }
      if (seq.drums.s[i]) { ev.push({ on: true, note: 38, vel: 90, t: t }); ev.push({ on: false, note: 38, vel: 0, t: t + 0.1 }); }
      if (seq.drums.hc[i]) { ev.push({ on: true, note: 42, vel: 70, t: t }); ev.push({ on: false, note: 42, vel: 0, t: t + 0.05 }); }
      if (seq.drums.ho[i]) { ev.push({ on: true, note: 46, vel: 80, t: t }); ev.push({ on: false, note: 46, vel: 0, t: t + 0.2 }); }
      if (seq.drums.sh[i]) { ev.push({ on: true, note: 69, vel: 60, t: t }); ev.push({ on: false, note: 69, vel: 0, t: t + 0.05 }); } }
    var bytes = Psy.buildMidiFile(ev, seq.bpm, 480);
    if (bytes) { var arr = new Uint8Array(bytes); var blob = new Blob([arr], { type: 'audio/midi' }); var u = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = u; a.download = 'psysynth-groove.mid'; document.body.appendChild(a); a.click(); a.remove(); } });
  tr.appendChild(ex);
  var av = document.createElement('button'); av.className = 'stb'; av.textContent = 'AI VAR';
  av.addEventListener('click', function () { seq.mutateSeq(); buildGrid(); paint(); });
  tr.appendChild(av);
  var cvv = document.createElement('select'); cvv.className = 'msel'; cvv.id = 'pcurve'; cvv.name = 'pcurve';
  ['FLAT', 'ACCENT', 'RAMP', 'PUMP', 'FUNK'].forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = 'VEL:' + n; cvv.appendChild(o); });
  cvv.addEventListener('change', function () { seq.applyCurve(cvv.value); paint(); }); tr.appendChild(cvv);
  var scs = document.createElement('select'); scs.className = 'msel'; scs.id = 'pscale'; scs.name = 'pscale';
  ['minor', 'phrygian', 'major', 'dorian', 'harmonic', 'lydian', 'mixolydian', 'blues', 'hungarian'].forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n.toUpperCase(); scs.appendChild(o); });
  scs.addEventListener('change', function () { seq.scaleName = scs.value; }); tr.appendChild(scs);
  var dv = document.createElement('select'); dv.className = 'msel'; dv.id = 'pdiv'; dv.name = 'pdiv';
  ['1/4', '1/8', '1/16', '1/32', '1/8T', '1/16T'].forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; dv.appendChild(o); });
  dv.value = '1/16'; dv.addEventListener('change', function () { seq.setDiv(dv.value); }); tr.appendChild(dv);
  var sty = document.createElement('select'); sty.className = 'msel'; sty.id = 'pstyle'; sty.name = 'pstyle';
  ['PSY FULL-ON', 'DARK PROG', 'HI-TECH', 'GOA'].forEach(function (n) { var o = document.createElement('option'); o.textContent = n; sty.appendChild(o); });
  sty.addEventListener('change', function () { seq.style(sty.value); paint(); });
  tr.appendChild(sty);
  var chd = document.createElement('button'); chd.className = 'stb'; chd.textContent = 'CHORD';
  chd.addEventListener('click', function () { seq.chords(); paint(); });
  tr.appendChild(chd);
  var slotSel = 0;
  var ln = document.createElement('button'); ln.className = 'stb'; ln.textContent = '16';
  ln.addEventListener('click', function () { seq.setLen(seq.steps.length === 16 ? 32 : 16); ln.textContent = String(seq.steps.length); buildGrid(); paint(); });
  tr.appendChild(ln);
  var db = document.createElement('button'); db.className = 'stb'; db.textContent = 'DOUBLE';
  db.addEventListener('click', function () { seq.setLen(32); ln.textContent = '32'; seq.double(); buildGrid(); paint(); });
  tr.appendChild(db);
  var sl = document.createElement('select'); sl.className = 'msel'; sl.id = 'pslot'; sl.name = 'pslot';
  [1, 2, 3, 4].forEach(function (n) { var o = document.createElement('option'); o.value = n - 1; o.textContent = 'SLOT ' + n; sl.appendChild(o); });
  sl.addEventListener('change', function () { slotSel = +sl.value; }); tr.appendChild(sl);
  var sv = document.createElement('button'); sv.className = 'stb'; sv.textContent = 'SAVE';
  sv.addEventListener('click', function () { seq.saveSlot(slotSel); }); tr.appendChild(sv);
  var ld = document.createElement('button'); ld.className = 'stb'; ld.textContent = 'LOAD';
  ld.addEventListener('click', function () { seq.loadSlot(slotSel); buildGrid(); paint(); }); tr.appendChild(ld);
  var sg = document.createElement('button'); sg.className = 'stb'; sg.textContent = 'SONG';
  sg.addEventListener('click', function () { seq.songOn = !seq.songOn; sg.classList.toggle('on', seq.songOn); }); tr.appendChild(sg);
  seq.onPatternChanged = function () { buildGrid(); paint(); };
  s.appendChild(tr);
  var kr = document.createElement('div'); kr.className = 'krow';
  new Psy.Knob(kr, { label: 'SWING', color: '#2dd4bf', min: 0, max: 60, def: 0, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.swing = v; } });
  new Psy.Knob(kr, { label: 'HUMAN', color: '#2dd4bf', min: 0, max: 100, def: 0, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.human = v; } });
  new Psy.Knob(kr, { label: 'VEL', color: '#2dd4bf', min: 5, max: 100, def: 80, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.steps[sel].vel = v / 100; paint(); } });
  new Psy.Knob(kr, { label: 'TR', color: '#2dd4bf', min: -12, max: 12, def: 0, fmt: function (v) { return (v > 0 ? '+' : '') + Math.round(v); }, onChange: function (v) { seq.steps[sel].tr = Math.round(v); } });
  new Psy.Knob(kr, { label: 'GATE', color: '#2dd4bf', min: 10, max: 100, def: 70, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.steps[sel].len = v; } });
  new Psy.Knob(kr, { label: 'RATCH', color: '#2dd4bf', min: 1, max: 4, def: 1, fmt: function (v) { return 'x' + Math.round(v); }, onChange: function (v) { seq.steps[sel].rat = Math.round(v); } });
  new Psy.Knob(kr, { label: 'PROB', color: '#2dd4bf', min: 10, max: 100, def: 100, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.steps[sel].prob = Math.round(v); } });
  new Psy.Knob(kr, { label: 'DHUM', color: '#2dd4bf', min: 0, max: 100, def: 0, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.humanDrum = Math.round(v); } });
  new Psy.Knob(kr, { label: 'STRUM', color: '#2dd4bf', min: 0, max: 40, def: 12, fmt: function (v) { return Math.round(v) + 'ms'; }, onChange: function (v) { seq.strum = v / 1000; } });
  var lg = document.createElement('button'); lg.className = 'stb'; lg.textContent = 'LEGATO'; lg.addEventListener('click', function () { seq.legato = !seq.legato; lg.classList.toggle('on', seq.legato); }); kr.appendChild(lg);
  var chd2 = document.createElement('button'); chd2.className = 'stb'; chd2.textContent = 'CHD';
  chd2.addEventListener('click', function () { seq.steps[sel].chord = !seq.steps[sel].chord; chd2.classList.toggle('on', seq.steps[sel].chord); paint(); });
  kr.appendChild(chd2);
  s.appendChild(kr);
  var painting = false, paintOn = true;
  document.addEventListener('pointerup', function () { painting = false; });
  var ng = document.createElement('div'); ng.className = 'seqgrid';
  function buildGrid() { ng.innerHTML = ''; cells.length = 0;
    for (var i = 0; i < seq.steps.length; i++) { (function (i) { var c = document.createElement('button'); c.className = 'sqc';
      if (i % 4 === 0) c.className += ' beat';
      c.addEventListener('click', function () { var st = seq.steps[i]; if (!st.on) { st.on = true; st.vel = 1; } else if (st.vel > 0.9) st.vel = 0.75; else if (st.vel > 0.6) st.vel = 0.5; else st.on = false; sel = i; paint(); });
      c.addEventListener('pointerdown', function (e) { painting = true; paintOn = !seq.steps[i].on; try { c.releasePointerCapture(e.pointerId); } catch (err) {} });
      c.addEventListener('pointerover', function () { if (painting) { seq.steps[i].on = paintOn; sel = i; paint(); } });
      ng.appendChild(c); cells.push(c); })(i); } }
  buildGrid();
  s.appendChild(ng);
  [['k', 'KICK', '#f87171'], ['s', 'SNARE', '#fbbf24'], ['hc', 'HAT', '#7ff3ff'], ['ho', 'OPEN', '#a78bfa'], ['sh', 'SHAKER', '#9fe8a8']].forEach(function (L) {
    var row = document.createElement('div'); row.className = 'seqgrid drum';
    var lb = document.createElement('span'); lb.className = 'dl'; lb.textContent = L[1]; lb.style.color = L[2]; row.appendChild(lb);
    for (var i = 0; i < Psy.SEQ_LEN; i++) { (function (i) { var c = document.createElement('button'); c.className = 'sqc d'; c.style.setProperty('--dc', L[2]);
      if (i % 4 === 0) c.className += ' beat';
      c.addEventListener('click', function () { seq.toggleDrum(L[0], i); paint(); }); row.appendChild(c); drumCells.push({ el: c, lane: L[0], i: i }); })(i); }
    s.appendChild(row);
  });
  [['fillOn','FILL'],['ghostOn','GHOST'],['crashOn','CRASH']].forEach(function (T) {
    var tb = document.createElement('button'); tb.className = 'stb on'; tb.textContent = T[1];
    tb.addEventListener('click', function () { seq[T[0]] = !seq[T[0]]; tb.classList.toggle('on', seq[T[0]]); });
    tr.appendChild(tb); });
  var ob = document.createElement('button'); ob.className = 'stb on'; ob.textContent = 'OFFBASS';
  ob.addEventListener('click', function () { seq.offbass = !seq.offbass; ob.classList.toggle('on', seq.offbass); });
  var mx = document.createElement('div'); mx.className = 'krow';
  new Psy.Knob(mx, { label: 'KICK', color: '#f87171', min: 0, max: 100, def: 90, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.dmix.k = v / 100; } });
  new Psy.Knob(mx, { label: 'SNARE', color: '#fbbf24', min: 0, max: 100, def: 70, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.dmix.s = v / 100; } });
  new Psy.Knob(mx, { label: 'HAT', color: '#7ff3ff', min: 0, max: 100, def: 45, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.dmix.hc = v / 100; } });
  new Psy.Knob(mx, { label: 'OPEN', color: '#a78bfa', min: 0, max: 100, def: 50, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.dmix.ho = v / 100; } });
  new Psy.Knob(mx, { label: 'SHKR', color: '#9fe8a8', min: 0, max: 100, def: 35, fmt: function (v) { return Math.round(v) + '%'; }, onChange: function (v) { seq.dmix.sh = v / 100; } });
  [['k', 'K'], ['s', 'S'], ['hc', 'H'], ['ho', 'O'], ['sh', 'SH']].forEach(function (M) {
    var mb = document.createElement('button'); mb.className = 'stb on'; mb.textContent = M[1];
    mb.addEventListener('click', function () { seq.dmute[M[0]] = !seq.dmute[M[0]]; mb.classList.toggle('on', !seq.dmute[M[0]]); });
    mx.appendChild(mb); });
  s.appendChild(mx);
  function paint() {
    for (var i = 0; i < Psy.SEQ_LEN; i++) { var st = seq.steps[i];
      cells[i].classList.toggle('on', st.on); cells[i].classList.toggle('sel', i === sel);
      if (st.on) { var pc = Math.round(st.vel * 100); cells[i].style.background = 'linear-gradient(to top, #2dd4bf ' + pc + '%, #123c36 ' + pc + '%)'; cells[i].style.opacity = 1; } else { cells[i].style.background = ''; cells[i].style.opacity = 1; }
      cells[i].classList.toggle('chd', !!st.chord); }
    drumCells.forEach(function (d) { d.el.classList.toggle('on', !!seq.drums[d.lane][d.i]); });
  }
  seq.onStep = function (i, note) { cells.forEach(function (c, k) { c.classList.toggle('ph', k === i); }); var r = document.getElementById('seqRead'); if (r) r.textContent = 'BAR ' + (Math.floor(seq.barCount % 4) + 1) + ' · ' + (i + 1); };
  paint();
  host.appendChild(s);
}
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

  /* CONDUCTOR (AI) panel */
  function buildConductor() {
    if (!Psy.Conductor) return;
    var s = document.createElement('div'); s.className = 'section conductor-section';
    s.innerHTML = '<div class="stitle" style="--c:#9fe8a8">CONDUCTOR \u00B7 AI</div>';
    var row = document.createElement('div'); row.className = 'krow';
    var cond = window.__cond || (window.__cond = new Psy.Conductor(engine));
    var on = document.createElement('button'); on.className = 'stb'; on.textContent = 'AUTOPILOT OFF';
    on.addEventListener('click', function(){ cond.setEnabled(!cond.enabled); on.textContent = cond.enabled?'AUTOPILOT ON':'AUTOPILOT OFF'; on.classList.toggle('on', cond.enabled); });
    row.appendChild(on);
    var ks = document.createElement('select'); ks.className='msel'; ks.id='condKey'; ks.name='condKey';
    for (var n=40;n<=52;n++){ var o=document.createElement('option'); o.value=n; o.textContent=noteName(n); ks.appendChild(o); }
    ks.value=45; ks.addEventListener('change', function(){ cond.key=+ks.value; }); row.appendChild(ks);
    var ss = document.createElement('select'); ss.className='msel'; ss.id='condScale'; ss.name='condScale';
    ['minor','phrygian','harmonic','dorian','major'].forEach(function(x){ var o=document.createElement('option'); o.value=x; o.textContent=x.toUpperCase(); ss.appendChild(o); });
    ss.addEventListener('change', function(){ cond.scale=ss.value; }); row.appendChild(ss);
    new Psy.Knob(row, { label:'COMPLEX', color:'#9fe8a8', min:0, max:100, def:60, fmt:function(v){return Math.round(v)+'%';}, onChange:function(v){ cond.complexity=v/100; } });
    new Psy.Knob(row, { label:'TEMPO', color:'#9fe8a8', min:90, max:170, def:141, fmt:function(v){return Math.round(v)+' BPM';}, onChange:function(v){ cond.bpm=v; } });
    var fb=document.createElement('button'); fb.className='stb'; fb.textContent='FILL'; fb.addEventListener('click',function(){cond.fillNext();}); row.appendChild(fb);
    var mu=document.createElement('button'); mu.className='stb'; mu.textContent='MUTATE'; mu.addEventListener('click',function(){cond.mutate();}); row.appendChild(mu);
    var dr=document.createElement('button'); dr.className='stb on'; dr.textContent='DRUMS ON'; dr.addEventListener('click',function(){cond.drumsOn=!cond.drumsOn; dr.textContent=cond.drumsOn?'DRUMS ON':'DRUMS OFF'; dr.classList.toggle('on',cond.drumsOn);}); row.appendChild(dr);
    var ws=document.createElement('button'); ws.className='stb'; ws.textContent='AI→SEQ'; ws.addEventListener('click',function(){ if(cond.writeSeq&&cond.writeSeq()){ ws.classList.add('on'); setTimeout(function(){ws.classList.remove('on');},400);} }); row.appendChild(ws);
  var fw=document.createElement('button'); fw.className='stb on'; fw.textContent='FOLLOW'; fw.addEventListener('click',function(){ cond.follow=(cond.follow===false)?true:false; fw.classList.toggle('on',cond.follow!==false); }); row.appendChild(fw);
    s.appendChild(row); $('sections').appendChild(s);
  }
  Psy.REG = REG;
  function ensurePower(){ try { if (window.engine) { if (!engine.ready) { var b = $('bPower'); if (b) b.click(); } else if (engine.ctx && engine.ctx.state === 'suspended') { engine.ctx.resume(); } } } catch(e){} }
  document.addEventListener('pointerdown', ensurePower, true);
  document.addEventListener('keydown', ensurePower, true);
  safeBuild('conductor', buildConductor);
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
  function buildExtras() {
    var secs = document.querySelectorAll('.section');
    var zdf = null, morph = null;
    secs.forEach(function (s) { var t = s.querySelector('.stitle'); if (!t) return; var tx = t.textContent;
      if (tx.indexOf('ZDF') >= 0) zdf = s; if (tx.indexOf('MORPH') >= 0) morph = s; });
    if (zdf) { var cv = document.createElement('canvas'); cv.width = 260; cv.height = 90; cv.style.width = '100%'; cv.style.height = '90px'; cv.style.marginTop = '8px'; zdf.appendChild(cv);
      var lastKey = '';
      (function draw() { requestAnimationFrame(draw); if (document.hidden || !window.engine || !engine.params) return;
        var p0 = engine.params; var key = (p0.cutoff | 0) + '|' + (p0.res) + '|' + (p0.filterType | 0); if (key === lastKey) return; lastKey = key;
        var g = cv.getContext('2d'); var w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
        var p = engine.params; var fc = Math.max(40, p.cutoff), q = Math.max(0.3, p.res), ty = p.filterType | 0;
        g.strokeStyle = '#22d3ee'; g.lineWidth = 2; g.beginPath();
        for (var i = 0; i < w; i++) { var f = 20 * Math.pow(1000, i / w); var r = f / fc; var m;
          if (ty === 1) m = Math.sqrt(r * r * r * r / (1 + r * r * r * r + (1 / Math.max(0.5, q)) * r * r));
          else if (ty === 2) { var rq = r / Math.max(0.5, q); m = rq / Math.sqrt(Math.pow(1 - r * r, 2) + rq * rq); }
          else m = 1 / Math.sqrt(1 + r * r * r * r + (1 / Math.max(0.5, q) - 1) * r * r);
          m = Math.max(0.02, Math.min(1.4, m * (1 + (q - 0.7) * 0.4 * Math.exp(-Math.pow(Math.log(r) * 2.2, 2)))));
          var y = h - 6 - (Math.min(1, m) * (h - 14)); if (i === 0) g.moveTo(i, y); else g.lineTo(i, y); }
        g.stroke(); })(); }
    if (morph) { var pad = document.createElement('div'); pad.style.cssText = 'position:relative;height:110px;margin:8px 4px 0;border:1px solid #2a3140;border-radius:8px;background:radial-gradient(circle at 50% 50%, #1a2030, #12151c);touch-action:none;';
      var dot = document.createElement('div'); dot.style.cssText = 'position:absolute;width:18px;height:18px;border-radius:50%;background:#a78bfa;box-shadow:0 0 10px #a78bfa;left:40%;top:50%;'; pad.appendChild(dot);
      var lb = document.createElement('div'); lb.style.cssText = 'position:absolute;bottom:2px;right:6px;font-size:8px;color:#5b6472;letter-spacing:1px;'; lb.textContent = 'PERFORM X=CUTOFF Y=RES'; pad.appendChild(lb);
      function mv(e) { var r = pad.getBoundingClientRect(); var x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); var y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        dot.style.left = (x * 100) + '%'; dot.style.top = (y * 100) + '%';
        engine.set('cutoff', Math.round(100 * Math.pow(80, x))); engine.set('res', Math.round((1 - y) * 18 * 10) / 10); }
      var down = false; pad.addEventListener('pointerdown', function (e) { down = true; try { pad.setPointerCapture(e.pointerId); } catch (er) {} mv(e); });
      pad.addEventListener('pointermove', function (e) { if (down) mv(e); }); pad.addEventListener('pointerup', function () { down = false; });
      morph.appendChild(pad); }
  }
  safeBuild('extras', buildExtras);
  safeBuild('canvases', setupCanvases);
  safeBuild('keyboard', buildKeyboard);
  safeBuild('octrow', buildOctRow);
  try { loadPreset(0); } catch (err) { /* preset load non-fatal */ }
  window.__psyUiReady = true;
  scopeLoop();
})();
