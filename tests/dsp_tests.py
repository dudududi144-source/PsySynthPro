#!/usr/bin/env python3
"""PsySynthPro DSP regression tests.

Run: python3 tests/dsp_tests.py
These tests mirror the AudioWorklet math 1:1 and guard against silent audio bugs.
Added after the polyblep DC-offset incident (v1.7.0).
"""
import math, sys

SR = 48000

def polyblep(t, dt):
    if t < dt:
        t /= dt; return t + t - t * t - 1
    if t > 1 - dt:
        t = (t - 1) / dt; return t * t + t + t + 1
    return 0

def osc_saw(phase, inc):
    return (2 * phase - 1) - polyblep(phase, inc)

def osc_square(phase, inc):
    sq = 1 if phase < 0.5 else -1
    return sq + polyblep(phase, inc) - polyblep((phase + 0.5) % 1, inc)

def rms(x): return math.sqrt(sum(v * v for v in x) / len(x))
def dc(x): return sum(x) / len(x)

def test_saw_no_dc():
    saw, phase, inc = [], 0.0, 440 / SR
    for _ in range(SR):
        saw.append(osc_saw(phase, inc)); phase += inc
        if phase >= 1: phase -= 1
    assert abs(dc(saw)) < 0.01, "saw has DC offset"
    assert 0.5 < rms(saw) < 0.65

def test_square():
    sq, phase, inc = [], 0.0, 440 / SR
    for _ in range(SR):
        sq.append(osc_square(phase, inc)); phase += inc
        if phase >= 1: phase -= 1
    assert abs(dc(sq)) < 0.01 and 0.95 < rms(sq) < 1.05

def render_lp(freq=2000, dur=0.5, cutoff=200, res=2):
    n = int(SR * dur); phase, inc = 0.0, freq / SR
    ic1 = ic2 = 0.0
    g = math.tan(math.pi * cutoff / SR)
    k = max(0.02, 2 - res / 10)
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    out = []
    for _ in range(n):
        sig = osc_saw(phase, inc); phase += inc
        if phase >= 1: phase -= 1
        v3 = sig - ic2; v1 = a1 * ic1 + a2 * v3; v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        out.append(v2)
    return out

def test_filter_attenuates():
    w = slice(int(0.1 * SR), int(0.4 * SR))
    lo = rms(render_lp(cutoff=200)[w]); hi = rms(render_lp(cutoff=5000)[w])
    atten = 20 * math.log10(lo / hi)
    assert atten < -20, "lowpass not attenuating (%.1f dB)" % atten

def test_full_voice_bounded():
    n = int(SR * 0.5); phase, inc = 0.0, 110 / SR
    ic1 = ic2 = 0.0; amp, stage = 0.0, 1
    aC = 1 - math.exp(-1 / (0.012 * SR)); dC = 1 - math.exp(-1 / (0.26 * SR)); rC = 1 - math.exp(-1 / (0.1 * SR))
    rel_at = int(SR * 0.4)
    g = math.tan(math.pi * 2600 / SR); k = 1.8
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    out = []
    for i in range(n):
        if i >= rel_at: stage = 4
        if stage == 1:
            tgt, c = 1.0, aC
            if amp >= 0.995: stage = 2
        elif stage == 2:
            tgt, c = 0.7, dC
            if abs(amp - 0.7) < 0.002: stage = 3
        elif stage == 3:
            tgt, c = 0.7, dC * 0.2
        else:
            tgt, c = 0.0, rC
        amp += (tgt - amp) * c
        sig = osc_saw(phase, inc); phase += inc
        if phase >= 1: phase -= 1
        v3 = sig - ic2; v1 = a1 * ic1 + a2 * v3; v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        out.append(math.tanh(v2 * amp * 0.8 * 0.28))
    assert max(abs(x) for x in out) <= 1.0
    assert abs(dc(out)) < 0.01

def test_trance_gate_math():
    on, t, dt = 0, 0.0, 1.0 / SR
    for _ in range(SR):
        lfo = 1 if math.sin(2 * math.pi * 4.7 * t) >= 0 else -1
        amp_mod = 1 - 78 / 200 + lfo * 78 / 200
        if amp_mod > 0.5: on += 1
        t += dt
    assert 0.4 < on / SR < 0.6

if __name__ == "__main__":
    tests = [test_saw_no_dc, test_square, test_filter_attenuates, test_full_voice_bounded, test_trance_gate_math]
    failed = 0
    for t in tests:
        try:
            t(); print("PASS", t.__name__)
        except AssertionError as e:
            failed += 1; print("FAIL", t.__name__, "-", e)
    print("%d/%d passed" % (len(tests) - failed, len(tests)))
    sys.exit(1 if failed else 0)
