import unittest

import numpy as np
from ctc_alignment import aligned_character_frames, focused_positions


class AlignmentTests(unittest.TestCase):
    def probabilities(self, sequence, classes=5):
        p = np.full((len(sequence), classes), 0.01)
        p[np.arange(len(sequence)), sequence] = 0.96
        return np.log(p / p.sum(axis=1, keepdims=True))

    def test_blank_separates_repeated_digits(self):
        frames = aligned_character_frames(self.probabilities([0, 1, 0, 1, 0, 2, 0]), [1, 1, 2])
        self.assertEqual(frames, [1, 3, 5])

    def test_tail_is_aligned_even_when_argmax_omits_it(self):
        p = self.probabilities([0, 1, 0, 0])
        p[-1, 2] = np.log(0.2)
        self.assertEqual(aligned_character_frames(p, [1, 2]), [1, 3])

    def test_no_leading_blank_is_required(self):
        self.assertEqual(aligned_character_frames(self.probabilities([1, 2]), [1, 2]), [0, 1])

    def test_repeated_label_needs_extra_frame(self):
        with self.assertRaises(ValueError):
            aligned_character_frames(self.probabilities([1, 1]), [1, 1])

    def test_blank_is_not_a_label_character(self):
        with self.assertRaises(AssertionError):
            aligned_character_frames(self.probabilities([1, 2]), [0])

    def test_nan_rejected(self):
        p = self.probabilities([1, 2])
        p[0, 0] = np.nan
        with self.assertRaises(AssertionError):
            aligned_character_frames(p, [1, 2])

    def test_focus_does_not_duplicate_last_nine(self):
        self.assertEqual(focused_positions('24A109'), [1, 5])
        self.assertEqual(focused_positions('AB00CD0'), [6])


if __name__ == '__main__':
    unittest.main()
