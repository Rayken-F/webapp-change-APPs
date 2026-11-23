"""Offline CTC path-sum diagnostics; no identifier dictionary or answer repair.

Based on the CTC probability definition in Graves et al., ICML 2006:
https://www.cs.toronto.edu/~graves/icml_2006.pdf
Beam pruning is approximate. Exact scoring sums all paths for a supplied sequence.
"""
import math

import numpy as np


def probabilities(value):
    p = np.asarray(value, dtype=np.float64)
    if p.ndim != 2 or not len(p) or not np.isfinite(p).all() or (p < 0).any():
        raise ValueError('Invalid CTC probabilities')
    if not np.allclose(p.sum(axis=1), 1, atol=1e-5):
        raise ValueError('CTC rows must sum to one')
    with np.errstate(divide='ignore'):
        return np.log(p)


def log_probability(value, target):
    """Exact CTC log likelihood, including blank frames and repeated symbols."""
    logp = probabilities(value)
    target = tuple(target)
    if any(not isinstance(c, (int, np.integer)) or not 0 < c < logp.shape[1] for c in target):
        raise ValueError('Target contains blank or unknown symbol')
    symbols = np.zeros(2 * len(target) + 1, dtype=int)
    symbols[1::2] = target
    prev = np.full(len(symbols), -np.inf)
    prev[0] = 0
    for row in logp:
        current = prev.copy()
        current[1:] = np.logaddexp(current[1:], prev[:-1])
        for s in range(2, len(symbols)):
            if symbols[s] and symbols[s] != symbols[s - 2]:
                current[s] = np.logaddexp(current[s], prev[s - 2])
        prev = current + row[symbols]
    return float(np.logaddexp(prev[-1], prev[-2])) if target else float(prev[0])


def prefix_beam(value, width=8, symbols_per_frame=8):
    """Return raw symbol sequences ranked by pruned path-sum probability.

    No format filter, length bonus, lexicon, labels, or 9/4 substitution is used.
    """
    if width < 1 or symbols_per_frame < 1:
        raise ValueError('Beam limits must be positive')
    logp = probabilities(value)
    beams = {(): (0.0, -math.inf)}  # ending blank, ending nonblank
    for row in logp:
        top = set(np.argsort(row)[-symbols_per_frame:].tolist()) | {0}
        next_beams = {}
        def add(prefix, slot, amount):
            if not math.isfinite(amount):
                return
            state = next_beams.setdefault(prefix, [-math.inf, -math.inf])
            state[slot] = float(np.logaddexp(state[slot], amount))
        for prefix, (blank, nonblank) in beams.items():
            total = float(np.logaddexp(blank, nonblank))
            add(prefix, 0, total + row[0])
            for c in top | ({prefix[-1]} if prefix else set()):
                if not c:
                    continue
                if prefix and c == prefix[-1]:
                    add(prefix, 1, nonblank + row[c])
                    add(prefix + (c,), 1, blank + row[c])
                else:
                    add(prefix + (c,), 1, total + row[c])
        beams = dict(sorted(next_beams.items(), key=lambda kv: np.logaddexp(*kv[1]), reverse=True)[:width])
    return [(prefix, float(np.logaddexp(*mass))) for prefix, mass in
            sorted(beams.items(), key=lambda kv: np.logaddexp(*kv[1]), reverse=True)]
