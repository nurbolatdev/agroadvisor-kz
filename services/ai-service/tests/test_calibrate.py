import csv
import json

import numpy as np
import pytest

from ml.calibrate import (
    calibrate_run,
    ece,
    false_mismatch_rate,
    fit_temperature,
    product_probs,
    risk_coverage,
    unknown_rejection,
)
from ml.registry import load_registry

REGISTRY = load_registry()
CLASSES = [c.code for c in REGISTRY.active()]
INDEX = {code: i for i, code in enumerate(CLASSES)}
TOMATO = [c.code for c in REGISTRY.for_crop("tomato")]


def tomato_logits(n: int, scale: float, seed: int = 0) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Photos of tomato whose true class is drawn from the model's own softmax (so a model
    with ``scale`` 1 is calibrated), and the same logits multiplied by ``scale``."""
    rng = np.random.default_rng(seed)
    logits = np.full((n, len(CLASSES)), -50.0)
    for code in (*TOMATO, "unknown"):
        logits[:, INDEX[code]] = rng.normal(0, 2.0, n)
    allowed = [INDEX[c] for c in (*TOMATO, "unknown")]
    p = np.exp(logits[:, allowed] - logits[:, allowed].max(axis=1, keepdims=True))
    p /= p.sum(axis=1, keepdims=True)
    drawn = np.array([rng.choice(allowed, p=row) for row in p])
    return logits * scale, drawn, ["tomato"] * n


def test_probabilities_cover_the_crop_and_unknown_only():
    logits, _, crops = tomato_logits(50, 1.0)

    probs = product_probs(logits, crops, CLASSES, REGISTRY)

    assert probs.shape == (50, len(CLASSES))
    assert probs.sum(axis=1) == pytest.approx(np.ones(50))
    outside = [i for i, c in enumerate(CLASSES) if c not in (*TOMATO, "unknown")]
    assert probs[:, outside].max() == 0.0


def test_a_higher_temperature_lowers_the_confidence_but_not_the_answer():
    logits, _, crops = tomato_logits(200, 1.0)

    sharp = product_probs(logits, crops, CLASSES, REGISTRY, temperature=1.0)
    soft = product_probs(logits, crops, CLASSES, REGISTRY, temperature=3.0)

    assert (sharp.argmax(axis=1) == soft.argmax(axis=1)).all()
    assert soft.max(axis=1).mean() < sharp.max(axis=1).mean()


def test_photos_without_a_crop_cannot_be_turned_into_probabilities():
    logits, _, _ = tomato_logits(2, 1.0)

    with pytest.raises(ValueError, match="crop"):
        product_probs(logits, ["tomato", None], CLASSES, REGISTRY)


def test_the_fitted_temperature_undoes_the_overconfidence():
    logits, targets, crops = tomato_logits(6000, scale=3.0, seed=1)

    assert fit_temperature(logits, targets, crops, CLASSES, REGISTRY) == pytest.approx(3.0, rel=0.1)


def test_a_calibrated_model_keeps_a_temperature_near_one():
    logits, targets, crops = tomato_logits(6000, scale=1.0, seed=2)

    assert fit_temperature(logits, targets, crops, CLASSES, REGISTRY) == pytest.approx(1.0, rel=0.1)


def test_ece_is_zero_for_a_calibrated_model_and_large_for_an_overconfident_one():
    rng = np.random.default_rng(0)
    conf = rng.uniform(0.3, 1.0, 20000)
    calibrated = rng.uniform(size=conf.size) < conf

    assert ece(conf, calibrated) < 0.02
    assert ece(np.ones(1000), np.arange(1000) % 2 == 0) == pytest.approx(0.5)


def test_risk_coverage_counts_what_the_app_would_answer_and_how_often_it_is_right():
    conf = np.array([0.95, 0.9, 0.8, 0.6, 0.5, 0.2])
    correct = np.array([True, True, False, True, False, False])

    rows = risk_coverage(conf, correct, [0.5, 0.85])

    assert rows[0] == {"threshold": 0.5, "answered": 5, "share": pytest.approx(5 / 6),
                       "accuracy": pytest.approx(3 / 5)}  # fmt: skip
    assert rows[1]["answered"] == 2
    assert rows[1]["accuracy"] == 1.0


def test_risk_coverage_with_nothing_answered_has_no_accuracy():
    rows = risk_coverage(np.array([0.2]), np.array([True]), [0.9])

    assert rows[0]["answered"] == 0
    assert rows[0]["accuracy"] is None


def test_false_mismatch_counts_photos_the_unmasked_model_sends_to_another_crop():
    # a tomato photo whose strongest class is a corn class: the app would say "this looks like corn"
    logits = np.full((2, len(CLASSES)), -10.0)
    logits[0, INDEX["corn__common_rust"]] = 10.0  # looks like corn
    logits[1, INDEX["tomato__late_blight"]] = 10.0

    rate = false_mismatch_rate(logits, ["tomato", "tomato"], CLASSES, REGISTRY, [0.7])

    assert rate == [{"threshold": 0.7, "photos": 2, "mismatches": 1, "rate": 0.5}]


def test_a_photo_that_is_not_a_plant_is_rejected_whatever_crop_was_chosen():
    logits = np.full((3, len(CLASSES)), -10.0)
    logits[0, INDEX["unknown"]] = 10.0  # the model says: not one of ours
    logits[1, INDEX["tomato__late_blight"]] = 10.0  # confidently a tomato disease
    logits[2, [INDEX[c] for c in (*TOMATO, "unknown")]] = 0.0  # no idea: 8 equal options

    share = unknown_rejection(logits, CLASSES, REGISTRY, low=0.4)

    # for tomato: the first photo (unknown wins) and the third (confidence 1/8 < 0.4) are rejected
    assert share["tomato"] == pytest.approx(2 / 3)
    assert set(share) == {"tomato", "potato", "corn", "wheat"}


def test_a_lower_threshold_rejects_fewer_photos():
    logits = np.full((1, len(CLASSES)), -10.0)
    logits[0, INDEX["tomato__late_blight"]] = 1.0
    logits[0, INDEX["tomato__early_blight"]] = 0.5
    logits[0, INDEX["unknown"]] = 0.0

    assert unknown_rejection(logits, CLASSES, REGISTRY, low=0.9)["tomato"] == 1.0
    assert unknown_rejection(logits, CLASSES, REGISTRY, low=0.2)["tomato"] == 0.0


def test_calibrating_a_run_writes_the_temperature_and_the_before_after_numbers(tmp_path):
    run = tmp_path / "A5-E001"
    run.mkdir()
    dataset = tmp_path / "ds"
    dataset.mkdir()
    (run / "class_index.json").write_text(json.dumps({"classes": CLASSES}), encoding="utf-8")
    rows = []
    for tag, seed in (("val_v2", 3), ("test_v2", 4)):
        logits, targets, crops = tomato_logits(3000, 3.0, seed=seed)
        files = [f"{tag}/{i}.jpg" for i in range(len(targets))]
        rows += [
            [name, CLASSES[t], "tomato", "s", "field", "train", name, name]
            for name, t in zip(files, targets, strict=True)
        ]
        np.savez_compressed(
            run / f"logits_{tag}.npz", logits=logits.astype(np.float32), targets=targets,
            files=np.array(files), dataset_dir=str(dataset),
        )  # fmt: skip
    with (dataset / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "class", "crop", "source", "kind", "role", "original", "md5"])
        writer.writerows(rows)

    result = calibrate_run(run, fit_tag="val_v2", check_tags=["test_v2"], plots=False)

    assert result["temperature"] == pytest.approx(3.0, rel=0.15)
    assert result["fitted_on"] == {"tag": "val_v2", "domain": "field", "photos": 3000}
    check = result["checks"]["test_v2"]
    assert check["after"]["ece"] < check["before"]["ece"]
    assert check["after"]["accuracy"] == check["before"]["accuracy"]  # the answers do not change
    non_plant = result["non_plant"]["test_v2"]
    assert non_plant["photos"] > 0  # the drawn labels include `unknown`
    assert set(non_plant["after"]["0.4"]) == {"tomato", "potato", "corn", "wheat"}
    assert json.loads((run / "calibration.json").read_text(encoding="utf-8"))["temperature"] == (
        result["temperature"]
    )
