# PsySynthPro — Engine Architecture

## Why this is a REAL synthesizer

Runs in an **AudioWorklet** — per-sample DSP at 48kHz, exactly like native synth engines.
No prebaked OscillatorNode shortcuts in the core sound path.

| Stage | Technique |
|---|---|
| Oscillators | **PolyBLEP** polynomial correction of the naive saw/square discontinuity — the standard alias-free method in professional softsynths |
| Filter | **ZDF State-Variable Filter** (Simper/Zavalishin zero-delay-feedback topology), independent state per voice |
| Envelopes | one-pole exponential attack/decay/release (analog envelope circuit model) |
| FM | instantaneous-frequency modulation of the carrier by a sine modulator (DX7-style) |
| Space FX | convolution reverb (generated IR) + feedback delay on the master bus |
| Output | tanh soft-clip stage, like hardware summing amps |
| Voices | 16-voice pool, oldest-note stealing |

## Signal flow

    unison xN PolyBLEP oscs (+FM modulator) + sub sine
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
- src/synth-engine.js — AudioWorklet DSP + master FX chain
- src/knob.js — SVG rotary knobs with tick marks
- src/presets.js — preset bank
- src/ui.js — declarative panel builder, keyboard, OLED scope

## Roadmap
1. Core engine (PolyBLEP + ZDF SVF + FM + env) — **done**
2. Space FX + boutique UI redesign — **done**
3. Wavetable editor + preset morphing — next
4. MIDI/MPE support
5. 3D spectrum visualizer
6. PWA offline + WAV export
