"""Small, label-preserving training variations; never used on validation images."""
import math

from PIL import Image


PROFILES = ((0.9, -0.1), (1.1, 0.1))


def varied_handwriting(image, scale, shear):
    """Change width/slant while expanding the canvas to retain every stroke."""
    assert 0.8 <= scale <= 1.2 and abs(shear) <= 0.15
    image = image.convert('RGB')
    width, height = image.size
    margin = 8
    half = (height - 1) / 2
    minimum = -abs(shear) * half
    output_width = math.ceil(scale * (width - 1) + abs(shear) * (height - 1)) + 1 + 2 * margin
    inverse = (1 / scale, -shear / scale,
               (minimum - margin + shear * (margin + half)) / scale,
               0, 1, -margin)
    return image.transform((output_width, height + 2 * margin), Image.Transform.AFFINE,
                           inverse, resample=Image.Resampling.BICUBIC, fillcolor=(255, 255, 255))
