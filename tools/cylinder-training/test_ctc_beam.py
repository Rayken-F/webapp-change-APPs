import itertools
import unittest

import numpy as np

from ctc_beam import log_probability, prefix_beam


def exhaustive(p):
    result = {}
    for path in itertools.product(range(p.shape[1]), repeat=len(p)):
        collapsed = tuple(c for i, c in enumerate(path) if c and (not i or c != path[i - 1]))
        result[collapsed] = result.get(collapsed, 0) + np.prod([p[t, c] for t, c in enumerate(path)])
    return result


class CTCScores(unittest.TestCase):
    def test_exact_scores_and_beam_match_all_paths(self):
        p = np.array([[.4, .5, .1], [.7, .2, .1], [.2, .4, .4], [.6, .1, .3]])
        expected = exhaustive(p)
        beam = dict(prefix_beam(p, width=100, symbols_per_frame=3))
        for target, mass in expected.items():
            self.assertAlmostEqual(np.exp(log_probability(p, target)), mass)
            self.assertAlmostEqual(np.exp(beam[target]), mass)

    def test_repeated_symbols_require_blank_and_missing_tail_is_not_inserted(self):
        p = np.array([[0, 1, 0], [1, 0, 0], [0, 1, 0]])
        self.assertEqual(prefix_beam(p)[0][0], (1, 1))
        self.assertEqual(log_probability(p, (1, 1)), 0)
        self.assertEqual(log_probability(p, (1, 1, 2)), -np.inf)

    def test_path_sum_can_differ_from_greedy(self):
        p = np.array([[.4, .35, .25], [.4, .35, .25]])
        self.assertEqual(tuple(np.argmax(p, axis=1)), (0, 0))
        self.assertEqual(prefix_beam(p)[0][0], (1,))

    def test_rejects_invalid_probabilities_and_target(self):
        for p in ([[.4, .4]], [[np.nan, 1]], [[-.1, 1.1]]):
            with self.assertRaises(ValueError):
                log_probability(p, (1,))
        with self.assertRaises(ValueError):
            log_probability([[.5, .5]], (0,))


if __name__ == '__main__':
    unittest.main()
