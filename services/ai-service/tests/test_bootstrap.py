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
