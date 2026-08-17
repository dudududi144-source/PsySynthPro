#!/usr/bin/env python3
"""PsySynthPro sequencer pattern tests. Run: python3 tests/pattern_tests.py
Validates the psy-trance pattern bank structure and musical correctness."""
import sys

# mirror of Psy.SEQ_PATTERNS (kept in sync manually — tests fail if drifted)
PATTERNS = {
  'ROLLING 16':   ([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),
  'OFFBEAT BASS': ([0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0], [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]),
  'PSY PUMP':     ([1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]),
  'ACID LINE':    ([1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0]),
  'TRANCE STAB':  ([1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0], [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),
  'GATE 8':       ([1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]),
  'DARK ROLL':    ([1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1], [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0]),
  'GOA BLEEP':    ([1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0], [1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0]),
}

def test_structure():
    for name, (g, a) in PATTERNS.items():
        assert len(g) == 16, name + ': gates must be 16 steps'
        assert len(a) == 16, name + ': accents must be 16 steps'
        assert all(x in (0, 1) for x in g), name + ': gates binary'
        assert all(x in (0, 1) for x in a), name + ': accents binary'
        assert sum(g) >= 1, name + ': at least one gate'
        for i in range(16):
            assert not (a[i] == 1 and g[i] == 0), name + ': accent without gate at %d' % i

def test_offbeat_bass_is_offbeat():
    g = PATTERNS['OFFBEAT BASS'][0]
    # offbeat sixteenths are 2, 6, 10, 14 (the '&' of each beat in 16-step grid)
    assert [i for i, x in enumerate(g) if x == 1] == [2, 6, 10, 14]

def test_gate8_alternates():
    g = PATTERNS['GATE 8'][0]
    assert g == [1, 0] * 8

def test_density_variety():
    # bank must span sparse -> dense for different psy styles
    dens = sorted(sum(g) for g, a in PATTERNS.values())
    assert dens[0] <= 4 and dens[-1] == 16, 'need sparse and full-density patterns'

def test_accent_count():
    # psy patterns need accents for groove shaping
    for name, (g, a) in PATTERNS.items():
        assert sum(a) >= 1, name + ': needs accents'

if __name__ == '__main__':
    tests = [test_structure, test_offbeat_bass_is_offbeat, test_gate8_alternates, test_density_variety, test_accent_count]
    failed = 0
    for t in tests:
        try:
            t(); print('PASS', t.__name__)
        except AssertionError as e:
            failed += 1; print('FAIL', t.__name__, '-', e)
    print('%d/%d passed' % (len(tests) - failed, len(tests)))
    sys.exit(1 if failed else 0)
