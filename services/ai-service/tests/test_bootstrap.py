import zlib

import numpy as np
import pytest

from ml.bootstrap import ci95, macro_f1, paired_diff_ci95
from ml.evaluate import _acc_f1

N_CLASSES = 5


def noisy_predictions(rng, n, accuracy):
    targets = rng.integers(0, N_CLASSES, n)
    wrong = rng.random(n) > accuracy
    preds = np.where(wrong, rng.integers(0, N_CLASSES, n), targets)
    return targets, preds


def test_fast_macro_f1_matches_the_reported_metric():
    rng = np.random.default_rng(0)
    targets, preds = noisy_predictions(rng, 300, 0.7)
    assert macro_f1(targets, preds, N_CLASSES) == pytest.approx(_acc_f1(targets, preds)[1])
    only_some = targets < 3  # classes absent from the targets are not averaged
    assert macro_f1(targets[only_some], preds[only_some], N_CLASSES) == pytest.approx(
        _acc_f1(targets[only_some], preds[only_some])[1]
    )


def test_interval_contains_the_point_estimate_and_is_reproducible():
    rng = np.random.default_rng(1)
    targets, preds = noisy_predictions(rng, 400, 0.8)
    slices = {"overall": np.ones(400, dtype=bool)}
    first = ci95(targets, preds, slices, N_CLASSES, n_boot=200)["overall"]
    again = ci95(targets, preds, slices, N_CLASSES, n_boot=200)["overall"]
    assert first == again
    assert first[0] < macro_f1(targets, preds, N_CLASSES) < first[1]


def test_fewer_photos_give_a_wider_interval():
    rng = np.random.default_rng(2)
    targets, preds = noisy_predictions(rng, 1000, 0.8)
    wide, narrow = np.zeros(1000, dtype=bool), np.ones(1000, dtype=bool)
    wide[:60] = True
    out = ci95(targets, preds, {"small": wide, "all": narrow}, N_CLASSES, n_boot=200)
    assert out["small"][1] - out["small"][0] > out["all"][1] - out["all"][0]


def photo_level_ci95(targets, preds, name, n_boot, seed=42):
    """The interval as it was computed before groups: resample single photos."""
    rng = np.random.default_rng([seed, zlib.crc32(name.encode())])
    idx = rng.integers(0, len(targets), (n_boot, len(targets)))
    values = np.array([macro_f1(targets[i], preds[i], N_CLASSES) for i in idx])
    return [float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))]


def test_groups_of_one_photo_give_the_photo_level_interval():
    rng = np.random.default_rng(7)
    targets, preds = noisy_predictions(rng, 250, 0.75)
    expected = photo_level_ci95(targets, preds, "overall", 150)
    mask = {"overall": np.ones(250, dtype=bool)}
    singles = np.array([f"leaf{i}" for i in range(250)])
    assert ci95(targets, preds, mask, N_CLASSES, n_boot=150)["overall"] == expected
    assert ci95(targets, preds, mask, N_CLASSES, n_boot=150, groups=singles)["overall"] == expected


def test_photos_of_one_leaf_widen_the_interval():
    rng = np.random.default_rng(8)
    targets, preds = noisy_predictions(rng, 40, 0.6)
    targets, preds = np.repeat(targets, 10), np.repeat(preds, 10)  # 40 leaves x 10 identical photos
    mask = {"overall": np.ones(400, dtype=bool)}
    by_photo = ci95(targets, preds, mask, N_CLASSES, n_boot=300)["overall"]
    by_leaf = ci95(targets, preds, mask, N_CLASSES, n_boot=300, groups=np.repeat(np.arange(40), 10))
    assert by_leaf["overall"][1] - by_leaf["overall"][0] > by_photo[1] - by_photo[0]


def test_paired_difference_uses_groups_too():
    rng = np.random.default_rng(9)
    targets, preds = noisy_predictions(rng, 40, 0.7)
    other = np.roll(preds, 1)
    targets, preds, other = (np.repeat(x, 10) for x in (targets, preds, other))
    mask = {"overall": np.ones(400, dtype=bool)}
    groups = np.repeat(np.arange(40), 10)
    photo = paired_diff_ci95(targets, preds, other, mask, N_CLASSES, n_boot=300)["overall"]
    leaf = paired_diff_ci95(targets, preds, other, mask, N_CLASSES, n_boot=300, groups=groups)[
        "overall"
    ]
    assert leaf["diff"] == photo["diff"]
    assert leaf["ci95"][1] - leaf["ci95"][0] > photo["ci95"][1] - photo["ci95"][0]


def test_empty_slice_has_no_interval():
    targets = np.array([0, 1, 2])
    out = ci95(targets, targets, {"empty": np.zeros(3, dtype=bool)}, N_CLASSES, n_boot=10)
    assert out["empty"] is None
    diff = paired_diff_ci95(
        targets, targets, targets, {"empty": np.zeros(3, dtype=bool)}, N_CLASSES, n_boot=10
    )
    assert diff["empty"] is None


def test_a_slice_keeps_its_interval_when_another_slice_is_added():
    rng = np.random.default_rng(3)
    targets, preds = noisy_predictions(rng, 200, 0.8)
    mask = np.ones(200, dtype=bool)
    alone = ci95(targets, preds, {"a": mask}, N_CLASSES, n_boot=50)["a"]
    with_other = ci95(targets, preds, {"b": mask, "a": mask}, N_CLASSES, n_boot=50)["a"]
    assert alone == with_other


def test_paired_difference_of_identical_runs_is_zero():
    rng = np.random.default_rng(4)
    targets, preds = noisy_predictions(rng, 300, 0.8)
    out = paired_diff_ci95(
        targets, preds, preds, {"overall": np.ones(300, dtype=bool)}, N_CLASSES, n_boot=100
    )["overall"]
    assert out == {"diff": 0.0, "ci95": [0.0, 0.0]}


def test_paired_difference_detects_a_clearly_better_run():
    rng = np.random.default_rng(5)
    targets, good = noisy_predictions(rng, 600, 0.95)
    _, bad = noisy_predictions(np.random.default_rng(6), 600, 0.5)
    bad = np.where(rng.random(600) < 0.5, bad, np.roll(targets, 1))
    out = paired_diff_ci95(
        targets, good, bad, {"overall": np.ones(600, dtype=bool)}, N_CLASSES, n_boot=200
    )["overall"]
    assert out["diff"] > 0.2
    assert out["ci95"][0] > 0  # the interval does not contain 0
