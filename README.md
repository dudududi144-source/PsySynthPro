# PsySynthPro 🎹

A real DSP synthesizer in the browser — genuine sample-rate synthesis, not preset OscillatorNode toys.

## Engine (AudioWorklet, 48kHz per-sample DSP)

| Stage | Technique |
|---|---|
| Oscillators | **PolyBLEP** band-limited saw/square/tri + **wavetable mode** |
| Wavetable Lab | draw your own wave on a canvas, or load 5 harmonic recipes |
| Filter | **ZDF State-Variable Filter** (zero-delay feedback), per voice |
| Envelopes | analog-style one-pole exponential ADSR |
| FM | instantaneous-frequency modulation (DX7-style) |
| Morph | continuous interpolation between any two presets |
| MIDI/MPE | Web MIDI input: notes + velocity, CC automation, per-note pitch bend |
| Space FX | convolution reverb + feedback delay on master bus |
| Output | tanh soft-clip stage |
| Voices | 16-voice pool, oldest-note stealing |

## Play
Open index.html (or enable GitHub Pages) -> **POWER** -> play with mouse or keys `A W S E D F T G Y H U J K`.

Wavetable Lab: pick a recipe (COSMIC/NEURO/GLASS/VOID/VOCAL) or draw your own wave and hit USE DRAWING, then set WAVE to USER.
Morph: choose presets A + B and sweep the MORPH knob.

## Structure
| Path | Role |
|---|---|
| index.html | panel layout |
| css/synth.css | boutique hardware design system |
| src/synth-engine.js | AudioWorklet DSP engine + master FX |
| src/wavetable.js | wavetable rendering, editor, morph engine |
| src/knob.js | SVG rotary knobs with tick marks |
| src/presets.js | preset bank |
| src/ui.js | panel builder, keyboard, OLED scope |
| docs/ | architecture + design research |

## MIDI
Connect a MIDI keyboard, press POWER, and play. CC1=mod/LFO depth, CC74=cutoff, CC71=resonance, CC7=master. Pitch bend is per-note (MPE-style).

## Security
No tokens/keys in this repository. .gitignore blocks .env and key files.

## License
MIT
