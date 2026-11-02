import hashlib
import json

import pytest
import torch
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


def swap_two_classes_in_the_index(folder, *, update_card_hash: bool):
    """Same set of classes, two outputs swapped: the labels would silently point at the wrong
    outputs. With `update_card_hash` the card is made to agree with the new file."""
    swapped = CODES[:2][::-1] + CODES[2:]
    index_path = folder / "class_index.json"
    index_path.write_text(json.dumps({"classes_version": REGISTRY.version, "classes": swapped}))
    if update_card_hash:
        card_path = folder / "model_card.json"
        card = json.loads(card_path.read_text())
        card["class_index_sha256"] = hashlib.sha256(index_path.read_bytes()).hexdigest()
        card_path.write_text(json.dumps(card))


def test_rejects_a_replaced_class_index_with_the_same_classes_in_another_order(tmp_path):
    settings = write_weights(tmp_path / "m", classes=CODES)
    swap_two_classes_in_the_index(tmp_path / "m", update_card_hash=False)

    with pytest.raises(ModelLoadError, match="class_index_sha256"):
        load_model(settings, REGISTRY)


def test_rejects_a_checkpoint_whose_classes_differ_from_class_index(tmp_path):
    # Defence in depth: even with a card that agrees with the file, the checkpoint's own class
    # list must match.
    settings = write_weights(tmp_path / "m", classes=CODES)
    swap_two_classes_in_the_index(tmp_path / "m", update_card_hash=True)

    with pytest.raises(ModelLoadError, match="checkpoint's classes"):
        load_model(settings, REGISTRY)


def test_rejects_another_classes_version(tmp_path):
    settings = write_weights(tmp_path / "m", version=REGISTRY.version + 1)

    with pytest.raises(ModelLoadError, match="classes_version"):
        load_model(settings, REGISTRY)


def test_rejects_an_unsupported_architecture(tmp_path):
    settings = write_weights(tmp_path / "m", architecture="resnet50")
    card_path = tmp_path / "m" / "model_card.json"
    card = json.loads(card_path.read_text())
    card["architecture"] = "resnet50"
    card_path.write_text(json.dumps(card))

    with pytest.raises(ModelLoadError, match="architecture"):
        load_model(settings, REGISTRY)


@pytest.mark.parametrize("name", ["model_card.json", "class_index.json"])
@pytest.mark.parametrize("content", ["{not json", "[1, 2]"])
def test_rejects_a_broken_card_or_index(tmp_path, name, content):
    settings = write_weights(tmp_path / "m")
    (tmp_path / "m" / name).write_text(content)

    with pytest.raises(ModelLoadError):
        load_model(settings, REGISTRY)


def test_rejects_a_checkpoint_that_is_not_a_torch_file_even_with_a_matching_hash(tmp_path):
    settings = write_weights(tmp_path / "m")
    (tmp_path / "m" / "model.pt").write_bytes(b"not a checkpoint")
    card_path = tmp_path / "m" / "model_card.json"
    card = json.loads(card_path.read_text())
    card["checkpoint_sha256"] = hashlib.sha256(b"not a checkpoint").hexdigest()
    card_path.write_text(json.dumps(card))

    with pytest.raises(ModelLoadError, match="cannot load model.pt"):
        load_model(settings, REGISTRY)


def test_rejects_a_device_the_machine_does_not_have(tmp_path):
    settings = write_weights(tmp_path / "m").model_copy(update={"device": "cuda"})
    if torch.cuda.is_available():
        pytest.skip("this machine has CUDA")

    with pytest.raises(ModelLoadError, match="cannot load model.pt"):
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
