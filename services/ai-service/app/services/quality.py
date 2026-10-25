from dataclasses import dataclass

from PIL import Image, ImageFilter, ImageStat

from app.core.errors import ApiError

# Sharpness is measured at a fixed scale so it does not depend on the photo resolution.
SHARPNESS_SIDE = 512
# Output is clipped to 0-255 around the offset; that is enough for a threshold test, but the value
# is not a textbook Laplacian variance, so min_sharpness is only comparable with this function.
_LAPLACIAN = ImageFilter.Kernel((3, 3), (0, 1, 0, 1, -4, 1, 0, 1, 0), scale=1, offset=128)


@dataclass(frozen=True)
class QualityLimits:
    min_side: int
    min_brightness: float
    min_sharpness: float


@dataclass(frozen=True)
class QualityMetrics:
    shorter_side: int
    brightness: float  # mean luminance, 0-255
    sharpness: float  # variance of the Laplacian


def measure(image: Image.Image) -> QualityMetrics:
    gray = image.convert("L")
    brightness = ImageStat.Stat(gray).mean[0]

    scale = SHARPNESS_SIDE / max(gray.size)
    if scale < 1:
        gray = gray.resize(
            (max(1, round(gray.width * scale)), max(1, round(gray.height * scale))),
            Image.Resampling.BILINEAR,
        )
    sharpness = 0.0
    if gray.width > 2 and gray.height > 2:
        # The filter leaves the 1 px border unprocessed, so it is cropped away.
        edges = gray.filter(_LAPLACIAN).crop((1, 1, gray.width - 1, gray.height - 1))
        sharpness = ImageStat.Stat(edges).var[0]

    return QualityMetrics(
        shorter_side=min(image.size),
        brightness=brightness,
        sharpness=sharpness,
    )


def check_quality(image: Image.Image, limits: QualityLimits) -> QualityMetrics:
    """Reject a photo that is too small, too dark or too blurry; checked in this order."""
    metrics = measure(image)
    if metrics.shorter_side < limits.min_side:
        raise _low_quality("too_small", f"Photo is smaller than {limits.min_side} px")
    if metrics.brightness < limits.min_brightness:
        raise _low_quality("dark", "Photo is too dark")
    if metrics.sharpness < limits.min_sharpness:
        raise _low_quality("blurry", "Photo is too blurry")
    return metrics


def _low_quality(reason: str, message: str) -> ApiError:
    return ApiError(422, "low_quality", message, reason=reason)
