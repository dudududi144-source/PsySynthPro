# Changelog

All notable changes to PsySynthPro. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

## [2.7.0] — Monophonic Legato Glide (psy-bass portamento)
### Added
- **GLIDE knob** in the oscillator section (0-500 ms, default 0 = off).
- Engine: when GLIDE > 0 and exactly one voice is sounding, a new note glides the
  active voice's pitch (legato, envelope not retriggered) instead of allocating a new voice.
- Per-sample pitch glide in the worklet (baseFreq -> targetBaseFreq at glideRate/sec).
### Notes
- Additive (glideTime default 0), so existing presets/behavior are unchanged.
- Applies to live/keyboard play; per-step sequencer glide is next.

## [2.6.0] — Perf HUD (live voice monitor)
### Added
- **Perf HUD** in the status strip: live active-voice count (X/16), reported from the
  worklet every ~2048 samples (~43 Hz) via port messages.
- Color-coded by load: green (<8), amber (8-11), red (12+).
### Why
- Makes CPU pressure visible so the v2.5 perf improvements can be verified live.
### Verified
- Worklet + engine + UI wiring; additive changes only.

## [2.5.0] — DSP Performance Pass (load/latency fix)
### Changed (worklet hot path)
- **baseFreq & bendMul cached per voice** — removes 2 Math.pow per voice per sample.
- **Unison detune multipliers precomputed once per audio buffer** — removes unison×16
  Math.pow calls per second-scale; they only change with detune/spread/unison.
- **SVF coefficients cached, recomputed every 16 samples** (or on res change) —
  ~16x fewer Math.tan calls; inaudible at 0.33ms granularity.
- **Pitch Math.pow consolidated** — up to 4 pow calls reduced to 1.
- **Mod-matrix fast-path** — when all 15 matrix amounts are 0 (the common case),
  the entire matrix (envSrc/velSrc + 5 dest sums) is skipped.
### Why
- Heavy per-sample cost caused CPU load -> audio-thread dropouts perceived as latency.
### Verified
- Realistic per-script harness: 13 scripts, 0 errors, panel builds.

## [2.4.0] — NxM Bipolar Modulation Matrix
### Added
- **MOD MATRIX grid**: 3 sources (LFO / ENV / VEL) x 5 destinations (CUT / PIT / AMP / FM / RES),
  15 bipolar knobs (-100..+100, center=0), applied at audio rate in the worklet.
- Engine params modLC..modVR; ENV/VEL sources are midpoint-centered so amounts are truly bipolar.
- Replaces the 6 fixed MOD knobs in the UI (those params stay in the engine for preset compat).
### Scaling
- CUT ±100 = ±4000 Hz · PIT ±100 = ±1 octave · AMP ±100 = ±100% gain · FM ±100 = full depth · RES ±100 = ±10 Q
### Verified
- Realistic per-script harness + functional matrix-sum test.

## [2.3.0] — MIDI Groove Export (SEQ -> DAW)
### Added
- **EXPORT GROOVE (.mid)** button in the STEP SEQ panel: renders the current 16-step
  pattern (2 loops) into a quantized Standard MIDI File using held/last-played notes,
  per-step accents (vel 120/90), gate %, step subdivision and tempo. Drops straight into a DAW.
- Note tracking: lastNotes captures the most recent 8 played notes as the groove pitch source.
### Notes
- Uses the existing SMF writer (Psy.buildMidiFile) + Psy.exportSeqGroove renderer.

## [2.2.0] — User Preset Bank + Playability
### Added
- **User preset bank**: SAVE button snapshots the current sound to localStorage;
  user presets appear as blue chips (click = load, ✕ = delete with confirm).
  Survives reloads, isolated per browser.
- **Key velocity**: click position on a key sets velocity (top = loud, bottom = soft,
  range 0.25..1.0). Computer keys stay at fixed 0.8. Sequencer/arpeggiator accents unchanged.
- **Retina OLED scope**: devicePixelRatio-aware backing store (capped at 2x).
### Changed
- Factory preset chips carry a `factory` class; selection highlight no longer
  collides with user chips.
### Verified
- Realistic per-script harness (details in PLAN.md verification discipline).

## [2.1.0] — Foundation & Tuning pass
### Added
- **OCTAVE control**: OCT −/+ buttons above the keyboard + **Z/X** shortcuts,
  ±2 octaves, live range label (answers "how do I play lower").
- docs/PLAN.md — saved master plan, status, tuning guide, verification rules.
### Fixed
- Triangle-wave integrator was shared across all voices (processor-global `this.triInt`)
  -> poly playback distortion. Now per-voice (`v.triInt`), reset on noteOn.
### Audited
- REC/MIDI export handlers present and intact; preset isolation verified
  (every preset carries all params, no bleed).

## [2.0.0] — MOD MATRIX (premium modulation routing)
### Added
- **MOD MATRIX section** (6 routable knobs): LFO>CUTOFF, LFO>PITCH, LFO>AMP, LFO>FM,
  ENV>PITCH, ENV>FM. Each 0..100, applied at audio rate in the worklet.
- Engine: additive modulation DSP (envNorm + multi-destination). With all matrix
  params at 0 the output is identical to v1.9.0 (non-breaking by construction).
- 2 showcase presets: **WARP BASS** (env pitch sweep + cutoff wobble),
  **ACID SIREN** (LFO pitch + FM wobble).
### Fixed (caught by the realistic per-script harness)
- presets.js: missing comma before the showcase entries (SyntaxError) — fixed.
### Verified
- Realistic harness on the exact bundle: 13 scripts, 0 errors, 12 sections, 14 presets.

## [1.9.0] — THE BUG: global lexical collision (panel never built in real browsers)
### Root cause (proven, not assumed)
Every module started with `const Psy = (window.PsySynth = ...)`. Top-level `const`
declarations of separate `<script>` tags share ONE global lexical scope in browsers,
so the 2nd..11th declarations were **SyntaxError: redeclaration of 'Psy'** and those
scripts (knob, arp, seq, midi, viz, recorder, midi-export, wavetable, **ui**) never
executed. Reproduced in a per-script JS harness: OLD bundle fails 9/13 scripts with
`sections=0`; fixed bundle passes 13/13 with `sections=11`.
### Fix
- Namespace line changed to `var Psy = ...` / `var PsySynth = ...` in all 11 modules
- Bundle rebuilt; single atomic commit for all 13 files
### Also (v1.8.2, no changelog at the time)
- Always-visible BUILD badge + instant on-page JS-error strip

## [1.8.1] — Auto-Repair Delivery
### Fixed
- Watchdog now **auto-repairs once** on panel-build failure: unregisters leftover
  service workers, clears all caches, reloads (guarded by sessionStorage so it cannot loop)
- Added no-cache meta headers so proxies/browsers stop pinning stale copies
- Manual REPAIR box now explains the three definitive fixes (hard-refresh / incognito / clear site data)
### Verified
- Harness on the exact bundle: 11 sections, 12 presets, 25 keys, 8 patterns, 0 errors

## [1.8.0] — Psy-Trance Pattern Bank
### Added
- **8 psy-trance step patterns** in the SEQ panel (one-click load into the 16-step grid):
  ROLLING 16, OFFBEAT BASS, PSY PUMP, ACID LINE, TRANCE STAB, GATE 8, DARK ROLL, GOA BLEEP
- **Tempo quick-set**: 138 (progressive) / 141 (full-on) / 145 (hi-tech) / 150 (psycore),
  synced with the BPM knob
- Sequencer API: Psy.SEQ_PATTERNS + sequencer.loadPattern(name)
- tests/pattern_tests.py — committed suite: structure, offbeat correctness, density span,
  accent validity (accent must imply gate)
### Verified
- Harness on the exact bundle: 11 sections, 12 presets, 25 keys, 8 patterns, 0 errors

## [1.7.0] — Critical Audio Fix + Committed Tests + Build Stamp
### Fixed (found by the new regression suite, not by claims)
- **polyblep() returned 1 instead of 0 away from discontinuities**: every sawtooth
  carried a -1.0 DC offset + doubled slope, which passed straight through the lowpass.
  Measured impact before fix: 2kHz-through-200Hz-LP attenuation was 1.3 dB instead of ~40 dB.
  After the one-line fix: DC=0, RMS 0.57, filter attenuates 39.9 dB. This degraded the
  sound of every saw-based preset (PSY BASS, TRANCE GATE, ACID 303, COSMIC LEAD...).
### Added
- tests/dsp_tests.py — committed DSP regression suite (osc DC/RMS, filter attenuation,
  full-voice bounds, trance-gate math)
- **Visible BUILD stamp** in the footer (version + commit + date) so the served build
  is always identifiable; watchdog shows the build id too
- Watchdog message now explains stale-cache remedies (REPAIR / hard-refresh / incognito)
### Verified
- Headless harness on the exact bundle: 11 sections, 12 presets, 25 keys, 0 errors
- DSP suite: all tests pass post-fix

## [1.6.1] — Service Worker Removed (final stale-cache fix)
### Fixed
- Root cause of the persistent blank-panel reports: old cache-first service workers
  kept serving outdated page versions even after refresh
- index.html now **unregisters all leftover service workers and clears caches on every load**
- sw.js replaced with a self-destructing stub (safety net for old registrations)
- Delivery model is now: one self-contained HTML bundle, always fresh, zero workers

## [1.6.0] — Psytrance Edition + Bulletproof Delivery
### Fixed
- Panel-blank root cause eliminated: index.html is now a **self-contained bundle**
  (all CSS+JS inlined) — no module load order, no missing file, no mixed-cache failure
  modes possible. One request = full instrument.
- Service worker v6: network-first, minimal 3-asset cache surface
### Added — Psytrance content
- Square-wave LFO (worklet) — enables tempo-synced **trance gating**
- LFO WAVE selector (SIN/SQR) in UI
- Psy-trance preset bank (12): PSY BASS 141, TRANCE GATE, ACID 303, GOA BLEEP,
  PSY STAB, DARK PAD, ROLLING ARP + 5 classics
- Sequencer default tempo 138 -> 141 BPM
### Verified
- Headless harness against the exact bundle artifact:
  11 sections, 12 presets, 25 keys, ready=true, zero errors

## [1.5.0] — Reliability + Performance Macros
### Fixed
- Blank-panel failure mode: boot watchdog detects failed panel builds, shows captured
  errors and a one-click REPAIR (unregisters service workers, clears caches, reloads)
- Service worker moved cache-first -> **network-first** (v5): always fresh online,
  cached offline; stale-cache failure class eliminated
- Panel builders now run in isolated try/catch with error capture
### Added
- PERFORMANCE MACROS section (market gap per Serum/Pigments research):
  M1 Cutoff, M2 Resonance, M3 Space (reverb+delay), M4 FM Drive — oversized knobs,
  live-synced with the module knobs
### Verified
- Headless JS harness (quickjs): 11 sections, 8 presets, 25 keys, zero errors

## [1.4.0] — MIDI Export
### Added
- MIDI capture: records every note event (manual / arp / seq) via engine method wrapping
- Standard MIDI File (format 0, 480 PPQ) renderer with tempo meta + VLQ deltas
- MIDI capture button in transport bar (tempo taken from active SEQ/ARP)
### Changed
- Service worker cache bumped to v4

## [1.3.0] — Step Sequencer
### Added
- 16-step gate sequencer with per-step accents (3-state step buttons)
- Note router: keyboard/MIDI input routes through SEQ > ARP > engine
- Mutual exclusion between sequencer and arpeggiator with UI sync
- Playing-step highlight + keyboard flash
### Changed
- Service worker cache bumped to v3

## [1.2.0] — Arpeggiator
### Added
- Lookahead arpeggiator (UP/DOWN/UP-DOWN/RANDOM), multi-octave, hold/latch
- Sample-accurate event queue in the worklet (noteOnAt/noteOffAt)
- MIDI note routing through configurable input target

## [1.1.0] — Production features
### Added
- 3D spectrum visualizer (perspective projection, log-spaced bins)
- WAV recorder/export (16-bit stereo PCM)
- PWA: manifest, offline-first service worker, app icon
- GitHub Pages deployment

## [1.0.0] — Core instrument
### Added
- AudioWorklet DSP engine: PolyBLEP oscillators, wavetable mode,
  ZDF state-variable filter, analog one-pole envelopes, FM operator
- Master FX: convolution reverb + feedback delay, tanh output stage
- Wavetable Lab (canvas editor + 5 harmonic recipes), preset morphing
- Web MIDI with MPE-style per-note pitch bend and CC mapping
- Boutique hardware UI (SVG knobs, OLED scope, PCB keybed)

## [0.1.0] — Initial scaffold
### Added
- Repository scaffold, README, .gitignore with secrets protection
