"""Training-only forced alignment; it never supplies or repairs OCR predictions."""
import numpy as np


def aligned_character_frames(log_probabilities, target):
    """Return one best frame for each target occurrence on a legal CTC path."""
    p = np.asarray(log_probabilities)
    target = np.asarray(target, dtype=np.int64)
    assert p.ndim == 2 and target.ndim == 1 and len(target) > 0
    assert np.isfinite(p).all() and np.all((target > 0) & (target < p.shape[1]))
    minimum = len(target) + int(np.sum(target[1:] == target[:-1]))
    if len(p) < minimum:
        raise ValueError("Not enough CTC frames for this label")
    symbols = np.zeros(2 * len(target) + 1, dtype=np.int64)
    symbols[1::2] = target
    steps, states = len(p), len(symbols)
    values = np.full((steps, states), -np.inf)
    previous = np.full((steps, states), -1, dtype=np.int32)
    values[0, :2] = p[0, symbols[:2]]
    for t in range(1, steps):
        for s in range(states):
            choices = [s]
            if s > 0:
                choices.append(s - 1)
            if s > 1 and symbols[s] != 0 and symbols[s] != symbols[s - 2]:
                choices.append(s - 2)
            best = max(choices, key=lambda k: values[t - 1, k])
            values[t, s] = values[t - 1, best] + p[t, symbols[s]]
            previous[t, s] = best
    s = states - 1 if values[-1, -1] > values[-1, -2] else states - 2
    if not np.isfinite(values[-1, s]):
        raise ValueError("No complete CTC alignment")
    path = np.empty(steps, dtype=np.int32)
    for t in range(steps - 1, -1, -1):
        path[t] = s
        if t:
            s = previous[t, s]
    frames = []
    for j, char in enumerate(target):
        positions = np.flatnonzero(path == 2 * j + 1)
        assert len(positions)
        frames.append(int(positions[np.argmax(p[positions, char])]))
    assert all(a < b for a, b in zip(frames, frames[1:]))
    return frames


def focused_positions(label):
    """9/4 occurrences and the final character; do not manufacture labels."""
    assert label
    return sorted({i for i, char in enumerate(label) if char in "94"} | {len(label) - 1})
