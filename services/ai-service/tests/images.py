"""Synthetic photos for tests: seeded, so every run sees the same pixels."""

import random
from io import BytesIO

from PIL import Image


def noise_image(size: tuple[int, int] = (400, 300), seed: int = 0) -> Image.Image:
    """Sharp, evenly lit photo that passes the default quality limits."""
    data = random.Random(seed).randbytes(size[0] * size[1] * 3)
    return Image.frombytes("RGB", size, data)


def encode(image: Image.Image, fmt: str = "JPEG") -> bytes:
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()
