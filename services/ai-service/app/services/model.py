"""Model interface and loader.

A predictor returns probabilities keyed by class code, never a bare vector. The mapping from
output index to code lives only inside the predictor, so nothing downstream can pair a
probability with the wrong class.

PlaceholderPredictor is a FAKE model: it hashes the image into pseudo-random probabilities so the
API can be wired and tested before any weights exist. Its output says nothing about the plant.

EfficientNetPredictor takes the class order from the class_index.json saved next to the weights
(written by `python -m ml.splits`, not tracked in git) and checks it against the registry. The
registry order is only a valid shortcut for the placeholder, which has no trained head.
"""

import hashlib
import json
import logging
import math
import random
from collections.abc import Collection, Mapping, Sequence
from pathlib import Path
from typing import Any, Protocol

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
    # False when the confidences are raw softmax (no temperature): the service never answers "ok".
    calibrated: bool

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
    calibrated = False  # fake probabilities are not calibrated against anything

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


class EfficientNetPredictor:
    """EfficientNet-B0 trained by ml/train.py. Output index -> code comes from the class_index.json
    saved with the weights, so the registry may reorder classes without breaking the head."""

    def __init__(
        self,
        model: Any,
        classes: Sequence[str],
        model_version: str,
        temperature: float | None,
        device: Any,
        transform: Any,
    ):
        self._model = model
        self._classes = tuple(classes)
        self._device = device
        self._transform = transform
        self.model_version = model_version
        self.temperature = temperature
        self.calibrated = temperature is not None

    def predict(self, image: Image.Image) -> dict[str, float]:
        import torch

        batch = self._transform(image.convert("RGB")).unsqueeze(0).to(self._device)
        with torch.inference_mode():
            logits = self._model(batch).float()[0]
            probs = torch.softmax(logits / (self.temperature or 1.0), dim=0)
        return dict(zip(self._classes, probs.cpu().tolist(), strict=True))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_device(name: str) -> Any:
    import torch

    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_efficientnet(settings: Settings, registry: Registry) -> EfficientNetPredictor:
    """Load weights from weights_dir / model_version and check them against the registry."""
    import torch
    import torchvision
    from torchvision.transforms import v2

    folder = settings.weights_dir / settings.model_version
    try:
        card = json.loads((folder / "model_card.json").read_text(encoding="utf-8"))
        index = json.loads((folder / "class_index.json").read_text(encoding="utf-8"))
        checkpoint_path = folder / "model.pt"
        actual = _sha256(checkpoint_path)
    except (OSError, ValueError) as exc:
        raise ModelLoadError(f"cannot read the weights in {folder}: {exc}") from exc

    if card.get("architecture") != "efficientnet_b0":
        raise ModelLoadError(f"unsupported architecture: {card.get('architecture')!r}")
    if actual != card.get("checkpoint_sha256"):
        raise ModelLoadError("model.pt does not match checkpoint_sha256 in model_card.json")

    classes = list(index.get("classes", []))
    if index.get("classes_version") != registry.version:
        raise ModelLoadError(
            f"weights have classes_version {index.get('classes_version')}, "
            f"the registry has {registry.version}"
        )
    if set(classes) != {c.code for c in registry.active()} or len(classes) != len(set(classes)):
        raise ModelLoadError("class_index.json does not match the active classes of the registry")

    temperature = card.get("temperature")
    if temperature is not None and not (
        isinstance(temperature, int | float)
        and not isinstance(temperature, bool)
        and math.isfinite(temperature)
        and temperature > 0
    ):
        raise ModelLoadError(f"temperature must be a positive number, got {temperature!r}")
    if temperature is None:
        logger.warning(
            "%s has no temperature in model_card.json: confidences are not calibrated and the "
            "service will not answer 'ok' or 'crop_mismatch'",
            settings.model_version,
        )

    device = _resolve_device(settings.device)
    # The same network as ml/train.py build_model, rebuilt here so the image does not need the
    # training code: EfficientNet-B0 with a fresh head of len(classes) outputs.
    model = torchvision.models.efficientnet_b0(weights=None)
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, len(classes))
    try:
        state = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        if state.get("classes") != classes:
            raise ModelLoadError("the checkpoint's classes differ from class_index.json")
        model.load_state_dict(state["model"])
    except (OSError, RuntimeError, KeyError, ValueError, AttributeError) as exc:
        raise ModelLoadError(f"cannot load model.pt: {exc}") from exc
    model.eval().to(device)
    # Evaluation preprocessing of the card (ml/data.py eval_transform): resize 256, center crop
    # 224, ImageNet normalization.
    transform = v2.Compose(
        [
            v2.ToImage(),
            v2.Resize(256, antialias=True),
            v2.CenterCrop(card.get("input_size", 224)),
            v2.ToDtype(torch.float32, scale=True),
            v2.Normalize(
                card.get("normalize_mean", [0.485, 0.456, 0.406]),
                card.get("normalize_std", [0.229, 0.224, 0.225]),
            ),
        ]
    )
    return EfficientNetPredictor(
        model, classes, settings.model_version, temperature, device, transform
    )


def load_model(settings: Settings, registry: Registry) -> Predictor:
    """Build the configured predictor and check it against the registry."""
    codes = [c.code for c in registry.active()]
    if settings.model_kind == "effnet":
        predictor: Predictor = load_efficientnet(settings, registry)
    elif settings.model_kind == "placeholder":
        if settings.require_model:
            raise ModelLoadError(
                "AI_REQUIRE_MODEL is set but AI_MODEL_KIND is 'placeholder': "
                "the fake model is not a model to serve (set AI_MODEL_KIND=effnet)"
            )
        logger.warning(
            "Using the PLACEHOLDER model (%s): predictions are fake and must not be shown "
            "to users as diagnoses",
            PLACEHOLDER_VERSION,
        )
        predictor = PlaceholderPredictor(codes)
    else:  # pragma: no cover - Settings only allows the kinds handled above
        raise ModelLoadError(f"unsupported model kind: {settings.model_kind}")

    try:
        validate_probabilities(predictor.predict(Image.new("RGB", _PROBE_SIZE)), codes)
    except ModelOutputError as exc:
        raise ModelLoadError(f"{predictor.model_version} failed its self-check: {exc}") from exc
    return predictor
