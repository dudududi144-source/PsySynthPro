# PsySynthPro 🎹

A real DSP synthesizer in the browser — genuine sample-rate synthesis, not preset OscillatorNode toys.

## Engine (AudioWorklet, 48kHz per-sample DSP)

| Stage | Technique |
|---|---|
| Oscillators | **PolyBLEP** band-limited saw/square/tri — the standard anti-aliasing method in professional softsynths |
| Filter | **ZDF State-Variable Filter** (zero-delay feedback, Simper/Zavalishin topology), per voice |
| Envelopes | Analog-style one-pole exponential ADSR |
| FM | Instantaneous-frequency modulation (DX7-style phase modulation) |
| Space FX | Convolution reverb + feedback delay on the master bus |
| Output | tanh soft-clip stage |
| Voices | 16-voice pool, oldest-note stealing |

## Play
Open `index.html` (or enable GitHub Pages) → **POWER** → play with mouse or keys `A W S E D F T G Y H U J K`.

## Structure
| Path | Role |
|---|---|
| `index.html` | Panel layout |
| `css/synth.css` | Boutique hardware design system |
| `src/synth-engine.js` | AudioWorklet DSP engine + master FX |
| `src/knob.js` | SVG rotary knobs with tick marks |
| `src/presets.js` | Preset bank |
| `src/ui.js` | Panel builder, keyboard, OLED scope |
| `docs/` | Architecture + design research |

## Security
No tokens/keys in this repository. `.gitignore` blocks `.env` and key files.

## License
MIT
