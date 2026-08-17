# PsySynthPro — Master Plan & Status

Living document. This is the agreed plan, current status, and tuning guide.

## North Star
A browser-based psytrance instrument with a **premium hardware-grade panel** and
**real DSP** (not OscillatorNode toys), that out-features the synths it was modeled on
(Serum, Pigments, Diva, Moog) in psy-specific workflow.

## Architecture (what we have)
| Layer | Implementation |
|---|---|
| Oscillators | PolyBLEP band-limited SAW/SQR + integrated TRI + SINE + user wavetable (2048-pt) |
| Unison | up to 7 voices with cent spread |
| Sub | sine at f/2 |
| FM | 1 operator, ratio 0.5..8, depth 0..100 (+ LFO/ENV routable) |
| Filter | ZDF State-Variable (LP/HP/BP/Notch), cutoff env + LFO |
| Envelopes | one-pole analog ADSR (amp) + filter envelope |
| LFO | SIN/SQR, 0.1..20Hz, routable |
| MOD MATRIX | LFO>CUT/PIT/AMP/FM + ENV>PIT/FM (audio-rate, additive, 0 = off) |
| Arpeggiator | UP/DOWN/UPDN/RND, hold/latch, sample-accurate (worklet event queue) |
| Step Sequencer | 16 steps, gates+accents, 8 psy patterns, tempo presets 138/141/145/150 |
| FX | convolution reverb + feedback delay + tanh output stage |
| Keyboard | 25 keys, **octave shift OCT -/+ and Z/X (v2.1)** |
| Export | WAV recorder + MIDI file export of the groove |
| Delivery | self-contained single-file bundle, no-cache headers, self-heal watchdog, build badge |

## Done (by release)
- v1.3-v1.6: engine + FX + boutique design + wavetable lab + morph + MIDI/MPE + 3D spectrum + sequencer patterns
- v1.7-v1.8: delivery hardening (watchdog, no-cache, repair)
- v1.9: fixed THE bug — `const Psy` redeclaration across `<script>` tags (panel never built in real browsers)
- v2.0: MOD MATRIX (6 routable knobs) + WARP BASS / ACID SIREN presets
- v2.1: foundation pass — **octave control**, per-voice triangle integrator fix, PLAN doc
- v2.2: **user preset bank (localStorage, save/load/delete)**, **key velocity** (Y-position),
  retina-sharp OLED scope

## Tuning guide (user-reported)
- **"Sounds too high / need lower octave"** -> use **OCT −** button above the keyboard or press **Z**
  (X = up). Range: 2 octaves each direction. Label shows the current note range.
  Psy bass lives around C1-C2: press OCT − twice for the PSY BASS presets.
- All mod-matrix knobs at 0 = identical to the pre-matrix sound (safe default).

## Known issues / next polish
- [x] velocity sensitivity for mouse keyboard — done v2.2 (Y-position on key)
- [x] preset save/recall in localStorage (user bank) — done v2.2 (SAVE button + user chips)
- [x] retina scaling for OLED scope — done v2.2 (spectrum canvas still pending)
- [ ] retina scaling for the 3D spectrum canvas
- [ ] step-sequencer per-step slide/glide
- [ ] full NxM mod matrix with bipolar amounts
- [ ] MIDI-out export of arp+seq (groove -> DAW)

## Verification discipline (hard-won rules)
1. Test with a REALISTIC harness: each script evaluated separately in one context
   (models browser shared global lexical scope). Block-wrapped harnesses hide
   cross-script `const` collisions.
2. Verify the DEPLOYED artifact on the CDN, not just the local bundle.
3. Every change: additive where possible; 0-default = behavior unchanged.
4. Secret-scan every file before push (github_pat_/cfut_/sbp_/JWT/AKIA markers).
