# PsySynthPro — Engine Architecture

## Why this is a REAL synthesizer

Runs in an **AudioWorklet** — per-sample DSP at 48kHz, exactly like native synth engines.

| Stage | Technique |
|---|---|
| Oscillators | **PolyBLEP** band-limited saw/square/tri + **wavetable** mode (2048-pt table, linear-interp scan) |
| Wavetable Lab | draw your own single-cycle wave, or load harmonic recipes (COSMIC/NEURO/GLASS/VOID/VOCAL) |
| Filter | **ZDF State-Variable Filter** (Simper/Zavalishin zero-delay-feedback), per voice |
| Envelopes | one-pole exponential ADSR (analog circuit model) |
| FM | instantaneous-frequency modulation (DX7-style) |
| Morph | continuous interpolation between any two presets |
| Space FX | convolution reverb (generated IR) + feedback delay |
| Output | tanh soft-clip stage |
| Voices | 16-voice pool, oldest-note stealing |

## Signal flow

    PolyBLEP xN unison / wavetable scan (+FM modulator) + sub sine
            |
       ZDF SVF (LP/HP/BP/notch, cutoff += filterEnv + LFO)
            |
       analog ADSR (one-pole)
            |
       voice sum -> worklet out
            |
       dry + delaySend->Delay(fb) + revSend->Convolver
            |
       master gain -> analyser -> output

## Files
- index.html — panel layout
- css/synth.css — boutique hardware design system
- src/synth-engine.js — AudioWorklet DSP (PolyBLEP + wavetable) + master FX
- src/wavetable.js — wavetable rendering, editor, preset morphing
- src/knob.js — SVG rotary knobs with tick marks
- src/presets.js — preset bank
- src/ui.js — panel builder, Wavetable Lab, Morph, keyboard, OLED scope

## Roadmap
1. Core engine (PolyBLEP + ZDF SVF + FM + env) — **done**
2. Space FX + boutique UI redesign — **done**
3. Wavetable editor + preset morphing — **done**
4. MIDI/MPE support — next
5. 3D spectrum visualizer
6. PWA offline + WAV export
