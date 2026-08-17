# PsySynthPro — Design Research

Patterns extracted from market leaders (researched, recombined — not copied 1:1):

| Source | Adopted pattern |
|---|---|
| **Xfer Serum** | dark chassis, metallic knobs with glowing value arcs, color-coded modules, live scope displays |
| **Arturia MicroFreak** | silkscreen section titles + divider lines, coded knob caps, OLED strip, PCB-dot keybed |
| **Moog (Minimoog/Modular)** | tick-marked rotary knobs, wood side cheeks, corner screws, knob-per-function layout |
| **Teenage Engineering OP-1** | per-module accent colors, tiny meta readouts |
| **u-he Diva** | analog depth shadows on caps |

## Implementation notes
- Knobs are SVG: tick ring + value arc with glow + 3D-shaded cap (radial gradients, inset shadows)
- OLED: scanline overlay + glass reflection + cyan phosphor glow
- Chassis: brushed-metal vertical micro-texture via repeating gradients
- Wood cheeks: layered repeating gradients for grain
- Typography: Inter (UI silkscreen) + JetBrains Mono (OLED/readouts)
