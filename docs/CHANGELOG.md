# Changelog

All notable changes to PsySynthPro. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

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
