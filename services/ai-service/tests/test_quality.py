import random

import pytest
from PIL import Image, ImageEnhance, ImageFilter

from app.core.errors import ApiError
from app.services.quality import QualityLimits, check_quality, measure

LIMITS = QualityLimits(min_side=224, min_brightness=40.0, min_sharpness=50.0)


def noise_image(size: tuple[int, int] = (400, 300), seed: int = 0) -> Image.Image:
    """Sharp, evenly lit synthetic photo: seeded random pixels, fully deterministic."""
    data = random.Random(seed).randbytes(size[0] * size[1] * 3)
    return Image.frombytes("RGB", size, data)


def reason_of(excinfo) -> tuple[int, str, str]:
    body = excinfo.value.body
    return excinfo.value.status_code, body.error, body.reason


def test_sharp_bright_photo_passes():
    metrics = check_quality(noise_image(), LIMITS)

    assert metrics.shorter_side == 300
    assert metrics.brightness > LIMITS.min_brightness
    assert metrics.sharpness > LIMITS.min_sharpness


def test_measure_is_deterministic():
    assert measure(noise_image()) == measure(noise_image())


def test_small_photo_is_too_small():
    with pytest.raises(ApiError) as excinfo:
        check_quality(noise_image((600, 100)), LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "too_small")


def test_dark_photo_is_dark():
    dark = ImageEnhance.Brightness(noise_image()).enhance(0.1)

    with pytest.raises(ApiError) as excinfo:
        check_quality(dark, LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "dark")


def test_blurred_photo_is_blurry():
    blurred = noise_image().filter(ImageFilter.GaussianBlur(4))

    with pytest.raises(ApiError) as excinfo:
        check_quality(blurred, LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "blurry")


def test_flat_photo_is_blurry():
    with pytest.raises(ApiError) as excinfo:
        check_quality(Image.new("RGB", (400, 300), (90, 140, 60)), LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "blurry")


def test_too_small_is_reported_before_dark_and_blurry():
    with pytest.raises(ApiError) as excinfo:
        check_quality(Image.new("RGB", (100, 100), "black"), LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "too_small")


def test_dark_is_reported_before_blurry():
    with pytest.raises(ApiError) as excinfo:
        check_quality(Image.new("RGB", (400, 300), "black"), LIMITS)

    assert reason_of(excinfo) == (422, "low_quality", "dark")


def test_sharpness_does_not_depend_on_resolution():
    small = measure(noise_image((600, 450)))
    large = measure(noise_image((1800, 1350)))

    # Both are downscaled to the same working size, so both must clear the same limit.
    assert small.sharpness > LIMITS.min_sharpness
    assert large.sharpness > LIMITS.min_sharpness


def test_limits_come_from_the_given_values():
    strict = QualityLimits(min_side=224, min_brightness=40.0, min_sharpness=10**9)

    with pytest.raises(ApiError) as excinfo:
        check_quality(noise_image(), strict)

    assert reason_of(excinfo) == (422, "low_quality", "blurry")
