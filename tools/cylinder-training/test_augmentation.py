import unittest

import numpy as np
from PIL import Image, ImageDraw

from augment_handwriting import PROFILES, varied_handwriting


class AugmentationTests(unittest.TestCase):
    def test_corner_strokes_are_retained_and_separate(self):
        image = Image.new('RGB', (100, 40), 'white')
        draw = ImageDraw.Draw(image)
        corners = [(0, 0), (95, 0), (0, 35), (95, 35)]
        colors = [(0, 0, 255), (255, 0, 0), (0, 160, 0), (100, 0, 100)]
        for (x, y), color in zip(corners, colors):
            draw.rectangle((x, y, x + 4, y + 4), fill=color)
        for scale, shear in PROFILES:
            result = np.array(varied_handwriting(image, scale, shear))
            for color in colors:
                self.assertGreater(np.sum(np.all(result == color, axis=-1)), 4)
            self.assertTrue(np.all(result[[0, -1], :, :] == 255))
            self.assertTrue(np.all(result[:, [0, -1], :] == 255))
        np.testing.assert_array_equal(np.array(image)[0, 0], colors[0])

    def test_no_horizontal_flip_or_large_transform(self):
        for scale, shear in [(-1, 0), (1, 1), (2, 0)]:
            with self.assertRaises(AssertionError):
                varied_handwriting(Image.new('RGB', (10, 10)), scale, shear)


if __name__ == '__main__':
    unittest.main()
