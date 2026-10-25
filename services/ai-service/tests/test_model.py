import json
import math

import pytest
from PIL import Image

from app.core.config import Settings
from app.services import model as model_module
from app.services.model import (
    PLACEHOLDER_VERSION,
    ModelLoadError,
    ModelOutputError,
    PlaceholderPredictor,
    load_model,
    validate_probabilities,
)
from ml.registry import DEFAULT_PATH, load_registry

REGISTRY = load_registry()
CODES = [c.code for c in REGISTRY.active()]


def photo(color: str = "green") -> Image.Image:
    image = Image.new("RGB", (120, 90), color)
    image.putpixel((3, 4), (255, 0, 0))
    return image


def test_placeholder_version_is_explicit():
    assert PLACEHOLDER_VERSION == "placeholder-v0"
    assert PlaceholderPredictor(CODES).model_version == "placeholder-v0"


def test_placeholder_covers_every_active_class_and_sums_to_one():
    probs = PlaceholderPredictor(CODES).predict(photo())

    assert set(probs) == set(CODES)
    assert math.isclose(sum(probs.values()), 1.0)
    assert all(p >= 0 for p in probs.values())


def test_placeholder_is_deterministic():
    predictor = PlaceholderPredictor(CODES)

    assert predictor.predict(photo()) == predictor.predict(photo())
    assert PlaceholderPredictor(CODES).predict(photo()) == predictor.predict(photo())


def test_placeholder_output_depends_on_the_image():
    predictor = PlaceholderPredictor(CODES)

    assert predictor.predict(photo("green")) != predictor.predict(photo("brown"))


def test_placeholder_assigns_probabilities_by_code_not_by_registry_order():
    forward = PlaceholderPredictor(CODES).predict(photo())
    backward = PlaceholderPredictor(list(reversed(CODES))).predict(photo())

    assert forward == backward


def test_validate_probabilities_rejects_missing_and_extra_codes():
    probs = {code: 1 / len(CODES) for code in CODES}
    del probs[CODES[0]]
    probs["tomato__imaginary"] = 1 / len(CODES)

    with pytest.raises(ModelOutputError, match="missing=.*extra="):
        validate_probabilities(probs, CODES)


def test_validate_probabilities_rejects_bad_values():
    uniform = {code: 1 / len(CODES) for code in CODES}

    with pytest.raises(ModelOutputError, match="finite"):
        validate_probabilities({**uniform, CODES[0]: float("nan")}, CODES)
    with pytest.raises(ModelOutputError, match="sum"):
        validate_probabilities({**uniform, CODES[0]: 0.5}, CODES)


def test_load_model_returns_placeholder_and_warns(caplog):
    with caplog.at_level("WARNING"):
        predictor = load_model(Settings(_env_file=None), REGISTRY)

    assert predictor.model_version == "placeholder-v0"
    assert "PLACEHOLDER" in caplog.text


def test_load_model_fails_with_clear_error_when_self_check_fails(monkeypatch):
    monkeypatch.setattr(
        model_module.PlaceholderPredictor, "predict", lambda self, image: {"unknown": 1.0}
    )

    with pytest.raises(ModelLoadError, match="placeholder-v0 failed its self-check"):
        load_model(Settings(_env_file=None), REGISTRY)


def test_class_index_order_is_not_required_by_placeholder():
    # class_index.json is a local, untracked artifact of the dataset build; the placeholder must
    # work without it. When it exists, it must describe the same classes as the registry.
    index_path = DEFAULT_PATH.parent / "datasets" / "v1" / "class_index.json"
    if not index_path.exists():
        pytest.skip("class_index.json is not present (dataset is built locally)")

    assert set(json.loads(index_path.read_text())["classes"]) == set(CODES)
