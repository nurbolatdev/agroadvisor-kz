"""Model interface and loader.

A predictor returns probabilities keyed by class code, never a bare vector. The mapping from
output index to code lives only inside the predictor, so nothing downstream can pair a
probability with the wrong class.

PlaceholderPredictor is a FAKE model: it hashes the image into pseudo-random probabilities so the
API can be wired and tested before any weights exist. Its output says nothing about the plant.

The loader for real weights (task A8, "connect the real model") must take the class order from
the class_index.json saved next to the weights (written by `python -m ml.splits`, not tracked in
git) and check it against the registry. The registry order is only a valid shortcut here because
the placeholder has no trained head to stay compatible with.
"""

import hashlib
import logging
import math
import random
from collections.abc import Collection, Mapping, Sequence
from typing import Protocol

from PIL import Image

from app.core.config import Settings
from ml.registry import Registry

logger = logging.getLogger(__name__)

PLACEHOLDER_VERSION = "placeholder-v0"
_PROBE_SIZE = (32, 32)


class ModelLoadError(RuntimeError):
    """The model cannot be used; the message is meant for the operator's log."""


class ModelOutputError(RuntimeError):
    """The model returned probabilities that do not match the class registry."""


class Predictor(Protocol):
    model_version: str

    def predict(self, image: Image.Image) -> dict[str, float]:
        """Probabilities over all active classes (including unknown), summing to 1."""
        ...


def validate_probabilities(probs: Mapping[str, float], codes: Collection[str]) -> None:
    if set(probs) != set(codes):
        missing = sorted(set(codes) - set(probs))
        extra = sorted(set(probs) - set(codes))
        raise ModelOutputError(
            f"classes do not match the registry: missing={missing} extra={extra}"
        )
    if any(not math.isfinite(p) or p < 0 for p in probs.values()):
        raise ModelOutputError("probabilities must be finite and non-negative")
    # float32 softmax over 20 classes can drift by about 1e-6 after conversion to Python floats.
    if abs(sum(probs.values()) - 1.0) > 1e-4:
        raise ModelOutputError(f"probabilities sum to {sum(probs.values())}, expected 1")


class PlaceholderPredictor:
    """Deterministic fake model. Not a classifier."""

    model_version = PLACEHOLDER_VERSION

    def __init__(self, class_codes: Sequence[str]):
        # Sorted, so a code always gets the same logit regardless of registry order.
        self._codes = tuple(sorted(class_codes))

    def predict(self, image: Image.Image) -> dict[str, float]:
        pixels = image.convert("RGB").resize(_PROBE_SIZE, Image.Resampling.BILINEAR).tobytes()
        rng = random.Random(hashlib.sha256(pixels).digest())
        logits = [rng.gauss(0, 2.5) for _ in self._codes]
        peak = max(logits)
        weights = [math.exp(x - peak) for x in logits]
        total = sum(weights)
        return {code: w / total for code, w in zip(self._codes, weights, strict=True)}


def load_model(settings: Settings, registry: Registry) -> Predictor:
    """Build the configured predictor and check it against the registry."""
    codes = [c.code for c in registry.active()]
    if settings.model_kind == "placeholder":
        logger.warning(
            "Using the PLACEHOLDER model (%s): predictions are fake and must not be shown "
            "to users as diagnoses",
            PLACEHOLDER_VERSION,
        )
        predictor: Predictor = PlaceholderPredictor(codes)
    else:  # pragma: no cover - Settings only allows the kinds handled above
        raise ModelLoadError(f"unsupported model kind: {settings.model_kind}")

    try:
        validate_probabilities(predictor.predict(Image.new("RGB", _PROBE_SIZE)), codes)
    except ModelOutputError as exc:
        raise ModelLoadError(f"{predictor.model_version} failed its self-check: {exc}") from exc
    return predictor
