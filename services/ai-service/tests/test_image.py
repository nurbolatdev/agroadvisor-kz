from io import BytesIO

import pytest
from fastapi import UploadFile
from PIL import Image

from app.core.errors import ApiError
from app.services.image import decode_image, read_upload

MAX_PIXELS = 50_000_000


def make_image_bytes(fmt: str = "JPEG", size: tuple[int, int] = (64, 48), mode: str = "RGB"):
    buffer = BytesIO()
    Image.new(mode, size, "green").save(buffer, format=fmt)
    return buffer.getvalue()


def upload(data: bytes) -> UploadFile:
    return UploadFile(file=BytesIO(data), filename="leaf.jpg")


def reason_of(excinfo) -> tuple[int, str, str]:
    body = excinfo.value.body
    return excinfo.value.status_code, body.error, body.reason


def test_read_upload_returns_bytes():
    data = make_image_bytes()

    assert read_upload(upload(data), max_bytes=len(data)) == data


def test_read_upload_without_file_is_missing():
    with pytest.raises(ApiError) as excinfo:
        read_upload(None, max_bytes=100)

    assert reason_of(excinfo) == (400, "invalid_image", "missing")


def test_read_upload_empty_file_is_missing():
    with pytest.raises(ApiError) as excinfo:
        read_upload(upload(b""), max_bytes=100)

    assert reason_of(excinfo) == (400, "invalid_image", "missing")


def test_read_upload_over_limit_is_too_large():
    with pytest.raises(ApiError) as excinfo:
        read_upload(upload(b"x" * 101), max_bytes=100)

    assert reason_of(excinfo) == (400, "invalid_image", "too_large")


def test_read_upload_exactly_at_limit_is_accepted():
    assert read_upload(upload(b"x" * 100), max_bytes=100) == b"x" * 100


@pytest.mark.parametrize("fmt", ["JPEG", "PNG"])
def test_decode_accepts_jpeg_and_png(fmt):
    image = decode_image(make_image_bytes(fmt), MAX_PIXELS)

    assert image.mode == "RGB"
    assert image.size == (64, 48)


def test_decode_accepts_multi_picture_jpeg_from_phone_cameras():
    frame = Image.new("RGB", (64, 48), "green")
    buffer = BytesIO()
    frame.save(buffer, format="MPO", save_all=True, append_images=[frame])

    assert Image.open(BytesIO(buffer.getvalue())).format == "MPO"
    assert decode_image(buffer.getvalue(), MAX_PIXELS).size == (64, 48)


def test_decode_scales_16_bit_png_instead_of_clipping_it():
    buffer = BytesIO()
    Image.new("I;16", (8, 8), 20000).save(buffer, format="PNG")

    decoded = decode_image(buffer.getvalue(), MAX_PIXELS)

    # 20000 / 256 is about 78; clipping would give 255.
    assert 70 <= decoded.getpixel((0, 0))[0] <= 85


def test_decode_converts_rgba_png_to_rgb():
    image = decode_image(make_image_bytes("PNG", mode="RGBA"), MAX_PIXELS)

    assert image.mode == "RGB"


@pytest.mark.parametrize("fmt", ["GIF", "WEBP", "BMP"])
def test_decode_rejects_other_image_formats(fmt):
    with pytest.raises(ApiError) as excinfo:
        decode_image(make_image_bytes(fmt, mode="RGB"), MAX_PIXELS)

    assert reason_of(excinfo) == (400, "invalid_image", "unsupported_format")


def test_decode_rejects_non_image_content():
    with pytest.raises(ApiError) as excinfo:
        decode_image(b"%PDF-1.4 not an image", MAX_PIXELS)

    assert reason_of(excinfo) == (400, "invalid_image", "unsupported_format")


@pytest.mark.parametrize("fmt", ["JPEG", "PNG"])
def test_decode_rejects_truncated_image(fmt):
    data = make_image_bytes(fmt, size=(200, 200))

    with pytest.raises(ApiError) as excinfo:
        decode_image(data[: len(data) // 2], MAX_PIXELS)

    assert reason_of(excinfo) == (400, "invalid_image", "corrupted")


def test_decode_rejects_image_over_pixel_limit():
    with pytest.raises(ApiError) as excinfo:
        decode_image(make_image_bytes(size=(100, 100)), max_pixels=9_999)

    assert reason_of(excinfo) == (400, "invalid_image", "too_large")


def test_decode_applies_exif_orientation():
    buffer = BytesIO()
    image = Image.new("RGB", (80, 40), "green")
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise when displayed
    image.save(buffer, format="JPEG", exif=exif)

    decoded = decode_image(buffer.getvalue(), MAX_PIXELS)

    assert decoded.size == (40, 80)
