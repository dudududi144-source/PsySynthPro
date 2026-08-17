"use strict";
const Psy = (window.PsySynth = window.PsySynth || {});

Psy.DEFAULT = {
  wave: 0, detune: 0, unison: 3, spread: 12, sub: 25,
  fmRatio: 2, fmDepth: 12,
  filterType: 0, cutoff: 2600, res: 2, filterEnv: 55,
  attack: 12, decay: 260, sustain: 70, release: 650,
  lfoTarget: 0, lfoRate: 2.2, lfoDepth: 35,
  master: 80, reverb: 35, delay: 22
};

Psy.PRESETS = {
  'COSMIC LEAD':     { wave: 0, detune: 6,  unison: 3, spread: 14, sub: 20, fmRatio: 2,   fmDepth: 18, filterType: 0, cutoff: 3200, res: 4,  filterEnv: 60, attack: 15,   decay: 240,  sustain: 72, release: 700,  lfoTarget: 0, lfoRate: 2.4, lfoDepth: 38, master: 80, reverb: 40, delay: 26 },
  'DEEP SPACE BASS': { wave: 0, detune: -4, unison: 1, spread: 0,  sub: 85, fmRatio: 1,   fmDepth: 10, filterType: 0, cutoff: 480,  res: 8,  filterEnv: 45, attack: 8,    decay: 220,  sustain: 62, release: 300,  lfoTarget: 0, lfoRate: 3.2, lfoDepth: 30, master: 80, reverb: 12, delay: 10 },
  'ETHEREAL PAD':    { wave: 3, detune: 10, unison: 5, spread: 24, sub: 35, fmRatio: 2,   fmDepth: 8,  filterType: 0, cutoff: 1800, res: 1,  filterEnv: 30, attack: 700,  decay: 900,  sustain: 85, release: 2400, lfoTarget: 1, lfoRate: 0.8, lfoDepth: 22, master: 80, reverb: 72, delay: 38 },
  'NEURO PLUCK':     { wave: 1, detune: 0,  unison: 1, spread: 0,  sub: 15, fmRatio: 3,   fmDepth: 45, filterType: 0, cutoff: 5200, res: 7,  filterEnv: 90, attack: 2,    decay: 300,  sustain: 0,  release: 420,  lfoTarget: 0, lfoRate: 5,   lfoDepth: 42, master: 80, reverb: 30, delay: 20 },
  'ACID LEGACY':     { wave: 0, detune: 0,  unison: 1, spread: 0,  sub: 0,  fmRatio: 2,   fmDepth: 0,  filterType: 0, cutoff: 750,  res: 16, filterEnv: 85, attack: 4,    decay: 160,  sustain: 28, release: 220,  lfoTarget: 0, lfoRate: 4.5, lfoDepth: 60, master: 80, reverb: 10, delay: 14 },
  'GLASS BELLS':     { wave: 3, detune: 0,  unison: 3, spread: 10, sub: 0,  fmRatio: 3.5, fmDepth: 55, filterType: 1, cutoff: 300,  res: 2,  filterEnv: 40, attack: 2,    decay: 600,  sustain: 10, release: 1400, lfoTarget: 2, lfoRate: 5.5, lfoDepth: 30, master: 80, reverb: 58, delay: 30 },
  'AMBIENT DRONE':   { wave: 2, detune: 8,  unison: 5, spread: 30, sub: 40, fmRatio: 2,   fmDepth: 6,  filterType: 0, cutoff: 1400, res: 1,  filterEnv: 25, attack: 1200, decay: 1200, sustain: 90, release: 3200, lfoTarget: 1, lfoRate: 0.4, lfoDepth: 18, master: 80, reverb: 82, delay: 45 },
  'VOID SCREAM':     { wave: 0, detune: 0,  unison: 7, spread: 45, sub: 30, fmRatio: 6,   fmDepth: 70, filterType: 2, cutoff: 1200, res: 12, filterEnv: 75, attack: 30,   decay: 500,  sustain: 40, release: 900,  lfoTarget: 1, lfoRate: 8,   lfoDepth: 70, master: 80, reverb: 46, delay: 34 }
};
