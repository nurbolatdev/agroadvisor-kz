import json

import pytest
from PIL import Image
from weights import write_weights

from app.core.config import Settings
from app.services.model import ModelLoadError, load_model, validate_probabilities
from ml.registry import load_registry

REGISTRY = load_registry()
CODES = [c.code for c in REGISTRY.active()]
REAL_WEIGHTS = Settings(_env_file=None).weights_dir / "effnet-b0-v1"


def photo() -> Image.Image:
    return Image.effect_noise((300, 200), 60).convert("RGB")


def test_loads_and_predicts_keyed_by_code(tmp_path):
    predictor = load_model(write_weights(tmp_path / "m"), REGISTRY)

    probs = predictor.predict(photo())

    validate_probabilities(probs, CODES)
    assert predictor.model_version == "m"
    assert predictor.calibrated is True


def test_temperature_flattens_the_distribution(tmp_path):
    hot = load_model(write_weights(tmp_path / "a", temperature=1.0), REGISTRY).predict(photo())
    cool = load_model(write_weights(tmp_path / "b", temperature=8.0), REGISTRY).predict(photo())

    assert max(cool.values()) < max(hot.values())
    assert max(hot, key=hot.get) == max(cool, key=cool.get)


def test_class_order_comes_from_the_weights_not_the_registry(tmp_path):
    reordered = write_weights(tmp_path / "r")
    straight = write_weights(tmp_path / "s", classes=CODES)
    # same random seed -> same head; only the labels attached to the outputs differ
    a = load_model(reordered, REGISTRY).predict(photo())
    b = load_model(straight, REGISTRY).predict(photo())

    assert a[CODES[0]] == pytest.approx(b[CODES[-1]])


def test_without_temperature_the_model_is_uncalibrated_and_warns(tmp_path, caplog):
    with caplog.at_level("WARNING"):
        predictor = load_model(write_weights(tmp_path / "m", temperature=None), REGISTRY)

    assert predictor.calibrated is False
    assert "not calibrated" in caplog.text


@pytest.mark.parametrize("temperature", [0, -1.0, "3.8", float("nan"), float("inf"), True])
def test_rejects_a_bad_temperature(tmp_path, temperature):
    settings = write_weights(tmp_path / "m", temperature=temperature)

    with pytest.raises(ModelLoadError, match="temperature"):
        load_model(settings, REGISTRY)


def test_rejects_weights_that_do_not_match_their_hash(tmp_path):
    settings = write_weights(tmp_path / "m")
    (tmp_path / "m" / "model.pt").write_bytes(b"tampered")

    with pytest.raises(ModelLoadError, match="checkpoint_sha256"):
        load_model(settings, REGISTRY)


def test_rejects_classes_that_differ_from_the_registry(tmp_path):
    settings = write_weights(tmp_path / "m", classes=CODES[:-1] + ["tomato__made_up"])

    with pytest.raises(ModelLoadError, match="active classes"):
        load_model(settings, REGISTRY)


def test_rejects_a_checkpoint_whose_classes_differ_from_class_index(tmp_path):
    settings = write_weights(tmp_path / "m")
    swapped = CODES[:2][::-1] + CODES[2:]  # same set, two outputs swapped
    index_path = tmp_path / "m" / "class_index.json"
    index_path.write_text(json.dumps({"classes_version": REGISTRY.version, "classes": swapped}))

    with pytest.raises(ModelLoadError, match="checkpoint's classes"):
        load_model(settings, REGISTRY)


def test_rejects_another_classes_version(tmp_path):
    settings = write_weights(tmp_path / "m", version=REGISTRY.version + 1)

    with pytest.raises(ModelLoadError, match="classes_version"):
        load_model(settings, REGISTRY)


def test_rejects_missing_weights(tmp_path):
    settings = Settings(_env_file=None, model_kind="effnet", weights_dir=tmp_path)

    with pytest.raises(ModelLoadError, match="cannot read the weights"):
        load_model(settings, REGISTRY)


@pytest.mark.skipif(not (REAL_WEIGHTS / "model.pt").exists(), reason="weights are not fetched")
def test_real_weights_load_with_the_a7_temperature():
    predictor = load_model(Settings(_env_file=None, model_kind="effnet", device="cpu"), REGISTRY)

    probs = predictor.predict(photo())

    validate_probabilities(probs, CODES)
    assert predictor.model_version == "effnet-b0-v1"
    assert predictor.temperature == pytest.approx(3.7935, abs=1e-3)
    assert predictor.calibrated is True
