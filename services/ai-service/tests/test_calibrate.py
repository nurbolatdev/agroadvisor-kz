import csv
import json

import numpy as np
import pytest

from app.services.predict import Thresholds, decide
from ml.calibrate import (
    Decisions,
    calibrate_run,
    decide_statuses,
    ece,
    false_mismatch_rate,
    fit_temperature,
    product_probs,
    status_summary,
    unknown_rejection,
)
from ml.registry import load_registry

REGISTRY = load_registry()
CLASSES = [c.code for c in REGISTRY.active()]
INDEX = {code: i for i, code in enumerate(CLASSES)}
TOMATO = [c.code for c in REGISTRY.for_crop("tomato")]
CROPS = ("tomato", "potato", "corn", "wheat")


def softmax(row: np.ndarray) -> np.ndarray:
    e = np.exp(row - row.max())
    return e / e.sum()


def tomato_logits(n: int, scale: float, seed: int = 0, unknown: bool = True):
    """Photos of tomato whose true class is drawn from the model's own softmax (so a model
    with ``scale`` 1 is calibrated), and the same logits multiplied by ``scale``."""
    rng = np.random.default_rng(seed)
    allowed = [INDEX[c] for c in (*TOMATO, *(["unknown"] if unknown else []))]
    logits = np.full((n, len(CLASSES)), -50.0)
    logits[:, allowed] = rng.normal(0, 2.0, (n, len(allowed)))
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


def test_photos_whose_label_the_service_could_never_answer_are_skipped_in_the_fit():
    logits, targets, crops = tomato_logits(3000, scale=2.0, seed=5)
    clean = fit_temperature(logits, targets, crops, CLASSES, REGISTRY)
    # a tomato photo labelled with a corn class: outside the crop's classes, a wrong label
    bad_logits = np.vstack([logits, logits[:1]])
    bad_targets = np.append(targets, INDEX["corn__common_rust"])

    assert fit_temperature(bad_logits, bad_targets, [*crops, "tomato"], CLASSES, REGISTRY) == (
        pytest.approx(clean, rel=1e-6)
    )


def test_fitting_on_no_photos_is_an_error_not_a_made_up_temperature():
    with pytest.raises(ValueError, match="no photos"):
        fit_temperature(np.empty((0, len(CLASSES))), np.array([], dtype=int), [], CLASSES, REGISTRY)


def test_ece_is_zero_for_a_calibrated_model_and_large_for_an_overconfident_one():
    rng = np.random.default_rng(0)
    conf = rng.uniform(0.3, 1.0, 20000)
    calibrated = rng.uniform(size=conf.size) < conf

    assert ece(conf, calibrated) < 0.02
    assert ece(np.ones(1000), np.arange(1000) % 2 == 0) == pytest.approx(0.5)


@pytest.mark.parametrize(
    ("temperature", "ok", "low", "mismatch"),
    [(1.0, 0.7, 0.4, 0.7), (3.0, 0.7, 0.25, 0.7), (2.0, 0.8, 0.3, 0.6), (0.7, 0.5, 0.2, 0.9)],
)
def test_the_statuses_are_those_the_service_gives(temperature, ok, low, mismatch):
    """``decide_statuses`` is a vectorized copy of ``decide``: same status, answer and top three."""
    rng = np.random.default_rng(7)
    logits = rng.normal(0, 3.0, (400, len(CLASSES)))
    crops = [CROPS[i % 4] for i in range(400)]

    got = decide_statuses(logits, crops, CLASSES, REGISTRY, temperature, ok, low, mismatch)

    thresholds = Thresholds(ok=ok, low=low, crop_mismatch=mismatch)
    for i in range(400):
        probs = dict(zip(CLASSES, softmax(logits[i] / temperature), strict=True))
        want = decide(probs, crops[i], REGISTRY, thresholds)
        assert got.status[i] == want.status, (i, temperature)
        assert [CLASSES[j] for j in got.top3[i]] == [s.code for s in want.top3]
        if want.status in ("ok", "low_confidence"):
            assert CLASSES[got.answer[i]] == want.top1.code


def test_random_logits_reach_every_status_so_the_comparison_above_is_not_vacuous():
    rng = np.random.default_rng(7)
    logits = rng.normal(0, 3.0, (400, len(CLASSES)))
    crops = [CROPS[i % 4] for i in range(400)]

    got = decide_statuses(logits, crops, CLASSES, REGISTRY, 1.0, 0.7, 0.4, 0.7)

    assert set(got.status) == {"ok", "low_confidence", "unknown", "crop_mismatch"}


def test_the_summary_does_not_count_a_not_recognized_photo_as_a_wrong_answer():
    status = np.array(["ok", "ok", "unknown", "low_confidence"])
    answer = np.array([1, 2, 0, 1])
    top3 = np.array([[1, 2, 3], [1, 2, 3], [1, 4, 5], [1, 2, 3]])
    decisions = Decisions(status, answer, np.array([0.9, 0.8, 0.6, 0.5]), top3)

    summary = status_summary(decisions, np.array([1, 1, 1, 1]))

    assert summary["photos"] == 4
    assert summary["shares"] == {"ok": 0.5, "low_confidence": 0.25, "unknown": 0.25,
                                 "crop_mismatch": 0.0}  # fmt: skip
    assert summary["ok_accuracy"] == 0.5
    assert summary["low_confidence_accuracy"] == 1.0
    assert summary["right_of_all"] == 0.5  # an answer was given and it was right
    assert summary["unknown_top3_right"] == 1.0  # the shown top three holds the right class


def test_a_status_without_photos_has_no_accuracy():
    decisions = Decisions(
        np.array(["unknown"]), np.array([0]), np.array([0.9]), np.array([[1, 2, 3]])
    )

    summary = status_summary(decisions, np.array([1]))

    assert summary["ok_accuracy"] is None
    assert summary["low_confidence_accuracy"] is None
    assert summary["unknown_top3_right"] == 1.0


def test_unknown_may_be_answered_only_above_a_level_instead_of_whenever_it_wins():
    logits = np.full((1, len(CLASSES)), -10.0)
    logits[0, INDEX["tomato__late_blight"]] = np.log(0.5)
    logits[0, INDEX["tomato__early_blight"]] = np.log(0.05)
    logits[0, INDEX["unknown"]] = np.log(0.45)

    def status(**kwargs):
        got = decide_statuses(logits, ["tomato"], CLASSES, REGISTRY, 1.0, 0.7, 0.25, 0.7, **kwargs)
        return got.status[0]

    assert status() == "low_confidence"  # the best class wins: 0.50 against 0.45
    assert status(unknown_at=0.4) == "unknown"  # 0.45 is enough to say "not recognized"
    assert status(unknown_at=0.6) == "low_confidence"  # not enough: the crop's best class is shown


def test_the_unknown_rule_never_answers_unknown_as_the_best_class():
    logits = np.full((1, len(CLASSES)), -10.0)
    logits[0, INDEX["unknown"]] = 5.0  # unknown wins by far
    logits[0, INDEX["tomato__late_blight"]] = 0.0

    got = decide_statuses(
        logits, ["tomato"], CLASSES, REGISTRY, 1.0, 0.7, 0.25, 0.7, unknown_at=0.99
    )

    assert CLASSES[got.answer[0]] == "tomato__late_blight"  # below the level: the crop's best


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
    assert share["tomato"]["unknown"] == pytest.approx(2 / 3)
    assert share["tomato"]["ok"] == pytest.approx(1 / 3)
    assert set(share) == set(CROPS)


def test_a_non_plant_photo_that_looks_like_another_crop_is_not_counted_as_rejected():
    # an `unknown` photo with tomato chosen, but the model is sure it is corn rust: the
    # crop_mismatch status comes before `unknown`
    logits = np.full((1, len(CLASSES)), -10.0)
    logits[0, INDEX["corn__common_rust"]] = 10.0

    share = unknown_rejection(logits, CLASSES, REGISTRY, low=0.25)

    assert share["tomato"]["crop_mismatch"] == 1.0
    assert share["tomato"]["unknown"] == 0.0


def test_a_lower_threshold_rejects_fewer_photos():
    logits = np.full((1, len(CLASSES)), -10.0)
    logits[0, INDEX["tomato__late_blight"]] = 1.0
    logits[0, INDEX["tomato__early_blight"]] = 0.5
    logits[0, INDEX["unknown"]] = 0.0

    assert unknown_rejection(logits, CLASSES, REGISTRY, low=0.9)["tomato"]["unknown"] == 1.0
    assert unknown_rejection(logits, CLASSES, REGISTRY, low=0.2)["tomato"]["unknown"] == 0.0


def build_run(tmp_path, with_unknown: bool = True):
    """A run folder with the saved logits of two splits and the manifest they point to."""
    run, dataset = tmp_path / "A5-E001", tmp_path / "ds"
    run.mkdir()
    dataset.mkdir()
    (run / "class_index.json").write_text(json.dumps({"classes": CLASSES}), encoding="utf-8")
    (run / "config.json").write_text(json.dumps({"id": "A5-E001"}), encoding="utf-8")
    rows = []
    for tag, seed in (("val_v2", 3), ("test_v2", 4)):
        logits, targets, _ = tomato_logits(3000, 3.0, seed=seed, unknown=with_unknown)
        files = [f"{tag}/{i}.jpg" for i in range(len(targets))]
        rows += [
            [name, CLASSES[t], "" if CLASSES[t] == "unknown" else "tomato", "s", "field", "train",
             name, name]
            for name, t in zip(files, targets, strict=True)
        ]  # fmt: skip
        np.savez_compressed(
            run / f"logits_{tag}.npz", logits=logits.astype(np.float32), targets=targets,
            files=np.array(files), dataset_dir=str(dataset),
        )  # fmt: skip
    with (dataset / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "class", "crop", "source", "kind", "role", "original", "md5"])
        writer.writerows(rows)
    return run


def test_calibrating_a_run_writes_the_temperature_and_the_before_after_numbers(tmp_path):
    run = build_run(tmp_path)

    result = calibrate_run(run, fit_tag="val_v2", check_tags=["test_v2"], plots=False)

    assert result["temperature"] == pytest.approx(3.0, rel=0.15)
    assert result["fitted_on"]["tag"] == "val_v2"
    assert result["fitted_on"]["domain"] == "field"
    assert result["fitted_on"]["photos"] > 2000  # field photos with a crop: `unknown` has none
    check = result["checks"]["test_v2"]
    assert check["after"]["ece"] < check["before"]["ece"]
    assert check["after"]["accuracy"] == check["before"]["accuracy"]  # the answers do not change
    after = check["status_after"]["ok=0.7,low=0.25"]
    assert sum(after["shares"].values()) == pytest.approx(1.0)
    assert after["photos"] == check["after"]["photos"]
    assert json.loads((run / "calibration.json").read_text(encoding="utf-8"))["temperature"] == (
        result["temperature"]
    )
    assert {"git_commit", "git_dirty"} <= set(result["scored_with"])


def test_the_unknown_rule_table_compares_the_levels_on_crop_photos_and_non_plant_photos(tmp_path):
    run = build_run(tmp_path)

    result = calibrate_run(run, fit_tag="val_v2", check_tags=["test_v2"], plots=False)

    rows = {row["unknown_at"]: row for row in result["checks"]["test_v2"]["unknown_rule"]}
    assert "argmax" in rows
    # a higher level can only reject fewer photos, of either kind
    assert rows[0.3]["crop_photos_unknown"] >= rows[0.8]["crop_photos_unknown"]
    assert rows[0.3]["non_plant_rejected"] >= rows[0.8]["non_plant_rejected"]


def test_non_plant_photos_are_reported_per_crop_with_their_statuses(tmp_path):
    run = build_run(tmp_path)

    result = calibrate_run(run, fit_tag="val_v2", check_tags=["test_v2"], plots=False)

    non_plant = result["non_plant"]["test_v2"]
    assert non_plant["photos"] > 0  # the drawn labels include `unknown`
    assert set(non_plant["after"]["0.4"]) == set(CROPS)
    assert set(non_plant["after"]["0.4"]["tomato"]) == {"ok", "low_confidence", "unknown",
                                                         "crop_mismatch"}  # fmt: skip


def test_a_split_without_non_plant_photos_is_calibrated_and_reported_without_them(tmp_path):
    run = build_run(tmp_path, with_unknown=False)

    result = calibrate_run(run, fit_tag="val_v2", check_tags=["test_v2"], plots=False)

    assert result["non_plant"] == {}
    assert result["checks"]["test_v2"]["unknown_rule"][0]["non_plant_rejected"] is None
