"use strict";
const Psy = (window.PsySynth = window.PsySynth || {});

(function () {
  const engine = new Psy.SynthEngine();
  const REG = {};
  const $ = function (id) { return document.getElementById(id); };
  let pendingTable = null;
  let midi = null;

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
      { type: 'cycle', key: 'lfoTarget', label: 'TARGET', options: [0, 1, 2], display: function (v) { return LTYPES[v]; } },
      { type: 'knob', key: 'lfoRate', label: 'RATE', min: 0.1, max: 20, step: 0.1, def: 2.2, fmt: function (v) { return v.toFixed(1) + 'Hz'; } },
      { type: 'knob', key: 'lfoDepth', label: 'DEPTH', min: 0, max: 100, def: 35, fmt: fmtPct }
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

  function buildKeyboard() {
    const kb = $('kb');
    for (let n = 48; n <= 72; n++) {
      const black = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0;
      const k = document.createElement('div');
      k.className = 'key ' + (black ? 'b' : 'w');
      k.dataset.n = n;
      k.title = LABEL[n] || '';
      k.addEventListener('pointerdown', function () { noteOn(n); });
      k.addEventListener('pointerup', function () { noteOff(n); });
      k.addEventListener('pointerleave', function () { noteOff(n); });
      kb.appendChild(k);
    }
  }

  function noteOn(n) {
    if (!engine.ready) return;
    engine.noteOn(n, 0.8);
    const k = document.querySelector('[data-n="' + n + '"]');
    if (k) k.classList.add('on');
  }
  function noteOff(n) {
    if (!engine.ready) return;
    engine.noteOff(n);
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
      if (!midi && Psy.MidiEngine) {
        midi = new Psy.MidiEngine(engine, {
          status: midiStatus,
          event: function (txt) { const ev = $('midiEvent'); if (ev) ev.textContent = txt; }
        });
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
  $('bPanic').addEventListener('click', function () { engine.panic(); });

  const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75 };
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    const n = KEYMAP[e.key.toLowerCase()];
    if (n !== undefined) noteOn(n);
  });
  document.addEventListener('keyup', function (e) {
    const n = KEYMAP[e.key.toLowerCase()];
    if (n !== undefined) noteOff(n);
  });

  buildSections();
  buildWavetableLab();
  buildMorph();
  buildPresets();
  buildKeyboard();
  loadPreset(0);
  scopeLoop();
})();
