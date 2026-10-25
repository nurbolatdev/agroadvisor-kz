import struct
from io import BytesIO

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import ApiError

# MPO is what Pillow calls a JPEG with extra frames, as saved by many Android cameras; the
# first frame is an ordinary JPEG.
ALLOWED_FORMATS = ("JPEG", "MPO", "PNG")
# 16-bit grayscale modes: a plain convert("RGB") would clip them to near white.
_HIGH_DEPTH_MODES = ("I", "I;16", "I;16L", "I;16B")


def _invalid(reason: str, message: str) -> ApiError:
    return ApiError(400, "invalid_image", message, reason=reason)


def read_upload(upload: UploadFile | None, max_bytes: int) -> bytes:
    """Read the uploaded file, checking its real size (not the Content-Length header)."""
    if upload is None:
        raise _invalid("missing", "No image was uploaded")
    data = upload.file.read(max_bytes + 1)
    if not data:
        raise _invalid("missing", "The uploaded image is empty")
    if len(data) > max_bytes:
        raise _invalid("too_large", f"Image is larger than {max_bytes} bytes")
    return data


def decode_image(data: bytes, max_pixels: int) -> Image.Image:
    """Decode a JPEG/PNG into an upright RGB image.

    The format is taken from the file content; the MIME type sent by the client is not trusted.
    """
    try:
        with Image.open(BytesIO(data)) as img:
            if img.format not in ALLOWED_FORMATS:
                raise _invalid("unsupported_format", f"Unsupported image format: {img.format}")
            if img.width * img.height > max_pixels:
                raise _invalid("too_large", f"Image has more than {max_pixels} pixels")
            img.load()
            if img.mode in _HIGH_DEPTH_MODES:
                img = img.point(lambda value: value * (1 / 256)).convert("L")
            return ImageOps.exif_transpose(img).convert("RGB")
    except UnidentifiedImageError:
        raise _invalid("unsupported_format", "File is not a JPEG or PNG image") from None
    except Image.DecompressionBombError:
        raise _invalid("too_large", "Image has too many pixels") from None
    except (OSError, SyntaxError, ValueError, EOFError, struct.error):
        raise _invalid("corrupted", "Image cannot be decoded") from None
