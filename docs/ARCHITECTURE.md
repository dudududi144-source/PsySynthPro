# PsySynthPro — Engine Architecture

## Why this is a REAL synthesizer

Runs in an **AudioWorklet** — per-sample DSP at 48kHz, exactly like native synth engines.

| Stage | Technique |
|---|---|
| Oscillators | **PolyBLEP** band-limited saw/square/tri + **wavetable** mode (2048-pt, linear-interp scan) |
| Wavetable Lab | draw your own single-cycle wave, or load harmonic recipes (COSMIC/NEURO/GLASS/VOID/VOCAL) |
| Filter | **ZDF State-Variable Filter** (Simper/Zavalishin zero-delay-feedback), per voice |
| Envelopes | one-pole exponential ADSR (analog circuit model) |
| FM | instantaneous-frequency modulation (DX7-style) |
| Morph | continuous interpolation between any two presets |
| MIDI/MPE | Web MIDI input: notes+velocity, CC automation, **per-note pitch bend** (channel->note tracking) |
| 3D Spectrum | perspective-projected frequency bars (log-spaced bins, depth-sorted, shaded faces) |
| Arpeggiator | lookahead scheduler (25ms tick, 120ms horizon) with worklet event queue — UP/DOWN/UP-DOWN/RANDOM, multi-octave, hold/latch |
| WAV Export | live PCM capture from master bus, encoded to 16-bit stereo WAV |
| PWA | manifest + offline-first service worker (installable, works without network) |
| Space FX | convolution reverb (generated IR) + feedback delay |
| Output | tanh soft-clip stage |
| Voices | 16-voice pool, oldest-note stealing |

## MIDI CC mapping
| CC | Target |
|---|---|
| 1 (mod wheel) | LFO depth |
| 7 (volume) | master |
| 71 | resonance |
| 74 | filter cutoff (log) |
| pitch bend | per-note bend (MPE-style, +/-2 semitones) |

## Files
- index.html — panel layout
- css/synth.css — boutique hardware design system
- src/synth-engine.js — AudioWorklet DSP (PolyBLEP + wavetable + per-note bend) + master FX
- src/wavetable.js — wavetable rendering, editor, preset morphing
- src/midi.js — Web MIDI engine with MPE-style per-note bend
- src/viz3d.js — 3D spectrum analyzer (perspective projection)
- src/recorder.js — live PCM capture + WAV encoder
- src/arpeggiator.js — lookahead arpeggiator
- manifest.json / sw.js / assets/icon.svg — PWA layer
- src/knob.js — SVG rotary knobs with tick marks
- src/presets.js — preset bank
- src/ui.js — panel builder, Wavetable Lab, Morph, MIDI, keyboard, OLED scope

## Roadmap
1. Core engine (PolyBLEP + ZDF SVF + FM + env) — **done**
2. Space FX + boutique UI redesign — **done**
3. Wavetable editor + preset morphing — **done**
4. MIDI/MPE support — **done**
5. 3D spectrum visualizer — **done**
6. PWA offline + WAV export — **done**

## Post-roadmap extensions
7. Arpeggiator with sample-accurate scheduling — **done**

## Project status: COMPLETE (roadmap 1-6 + arpeggiator)
