import json
from collections import Counter

import numpy as np
import pytest
import torch
from PIL import Image
from test_training import run_main

from ml import train
from ml.data import AUGMENTATIONS, IMAGE_SIZE, PlantDataset, lab_cap_indices, train_transform
from ml.evaluate import compare_runs


def fake_scored_run(root, name, classes, targets, files):
    run = root / name
    run.mkdir()
    (run / "class_index.json").write_text(json.dumps({"classes": classes}))
    np.savez(
        run / "logits_val.npz",
        logits=np.zeros((len(targets), len(classes)), dtype=np.float32),
        targets=np.array(targets),
        files=np.array(files),
        dataset_dir=str(root),
    )
    return run


def test_compare_runs_refuses_runs_that_are_not_comparable(tmp_path):
    base = fake_scored_run(tmp_path, "a", ["x", "y"], [0, 1], ["f1", "f2"])
    other_photos = fake_scored_run(tmp_path, "b", ["x", "y"], [0, 1], ["f1", "f3"])
    other_targets = fake_scored_run(tmp_path, "c", ["x", "y"], [1, 0], ["f1", "f2"])
    other_classes = fake_scored_run(tmp_path, "d", ["y", "x"], [0, 1], ["f1", "f2"])
    with pytest.raises(ValueError, match="different photos"):
        compare_runs(base, other_photos, "val", 10)
    with pytest.raises(ValueError, match="different targets"):
        compare_runs(base, other_targets, "val", 10)
    with pytest.raises(ValueError, match="different class indexes"):
        compare_runs(base, other_classes, "val", 10)


def names(transform) -> list[str]:
    return [type(t).__name__ for t in transform.transforms]


def test_basic_augmentation_is_the_original_pipeline():
    basic = train_transform()
    assert names(basic) == [
        "ToImage", "RandomResizedCrop", "RandomHorizontalFlip", "RandomVerticalFlip",
        "RandomRotation", "ColorJitter", "RandomApply", "ToDtype", "Normalize",
    ]  # fmt: skip
    assert basic.transforms[1].scale == (0.6, 1.0)
    assert names(train_transform("basic")) == names(basic)


def test_strong_augmentation_adds_the_extra_steps_and_keeps_the_output_shape():
    strong = train_transform("strong")
    assert {"TrivialAugmentWide", "RandomErasing"} <= set(names(strong))
    assert any(isinstance(t, torch.nn.Module) and type(t).__name__ == "JPEG"
               for step in strong.transforms if hasattr(step, "transforms")
               for t in step.transforms)  # fmt: skip
    assert strong.transforms[1].scale == (0.3, 1.0)
    image = Image.new("RGB", (300, 200), (90, 160, 70))
    out = strong(image)
    assert out.shape == (3, IMAGE_SIZE, IMAGE_SIZE) and out.dtype == torch.float32


def test_unknown_augmentation_is_rejected():
    assert AUGMENTATIONS == ("basic", "strong")
    with pytest.raises(ValueError, match="unknown augmentation"):
        train_transform("extreme")


def test_lab_cap_limits_lab_photos_per_class_and_keeps_the_rest():
    targets = [0] * 6 + [1] * 3 + [0] * 2
    kinds = ["lab"] * 6 + ["lab"] * 3 + ["field", "other"]
    kept = lab_cap_indices(targets, kinds, cap=2, seed=1)
    lab_class0 = [i for i in kept if targets[i] == 0 and kinds[i] == "lab"]
    assert len(lab_class0) == 2
    assert sum(1 for i in kept if targets[i] == 1) == 2
    assert {9, 10} <= set(kept)  # the field and the other photo are always kept
    assert kept == sorted(kept)


def test_lab_cap_is_deterministic_and_depends_on_the_seed():
    targets = [0] * 40
    kinds = ["lab"] * 40
    assert lab_cap_indices(targets, kinds, 5, seed=1) == lab_cap_indices(targets, kinds, 5, seed=1)
    assert lab_cap_indices(targets, kinds, 5, seed=1) != lab_cap_indices(targets, kinds, 5, seed=2)
    assert lab_cap_indices(targets, kinds, 100, seed=1) == list(range(40))  # under the cap


def test_selection_key_prefers_the_metric_and_breaks_ties_by_overall_f1():
    rows = [
        {"val_macro_f1": "0.95", "val_field_product_macro_f1": "0.60"},
        {"val_macro_f1": "0.93", "val_field_product_macro_f1": "0.70"},
        {"val_macro_f1": "0.94", "val_field_product_macro_f1": "0.70"},
    ]
    overall = max(range(3), key=lambda i: train.selection_key("val_macro_f1", rows[i]))
    field = max(range(3), key=lambda i: train.selection_key("val_field_product_macro_f1", rows[i]))
    assert overall == 0
    assert field == 2  # tie on the field metric, the higher overall macro-F1 wins


def test_options_reach_the_loaders_and_val_is_not_capped(monkeypatch, tmp_path):
    run_main(
        monkeypatch, tmp_path, "--lab-cap", "1", "--aug", "strong", "--num-workers", "0",
        "--batch-size", "8",
    )  # fmt: skip
    args = train.parse_args()
    loaders = train.build_loaders(args)
    assert args.aug == "strong"
    assert len(loaders["train"].dataset) == 20  # 2 lab photos per class, 1 kept
    assert len(loaders["val"].dataset) == 20  # untouched


def test_lab_cap_works_together_with_a_subset(monkeypatch, tmp_path):
    run_main(monkeypatch, tmp_path, "--lab-cap", "1", "--subset", "0.5", "--num-workers", "0")
    args = train.parse_args()
    loaders = train.build_loaders(args)
    dataset = loaders["train"].dataset
    full = len(PlantDataset(args.dataset_dir, "train"))
    assert set(dataset.indices) <= set(train.subset_indices(full, 0.5, args.seed))
    classes = [dataset.dataset.targets[i] for i in dataset.indices]
    assert max(Counter(classes).values()) <= 1  # one lab photo per class in the synthetic data
    assert len(dataset) == len(set(dataset.indices))


def test_run_with_the_new_options_records_them(monkeypatch, tmp_path):
    run = run_main(
        monkeypatch, tmp_path, "--lab-cap", "1", "--aug", "strong", "--label-smoothing", "0.1",
        "--selection-metric", "val_field_product_macro_f1", "--head-epochs", "1",
        "--full-epochs", "0", "--batch-size", "8",
    )  # fmt: skip
    train.main()
    config = json.loads((run / "config.json").read_text())
    assert config["aug"] == "strong" and config["lab_cap"] == 1
    assert config["label_smoothing"] == 0.1
    assert config["selection_metric"] == "val_field_product_macro_f1"
    assert "TrivialAugmentWide" in config["transforms"]["train"]
    results = json.loads((run / "results.json").read_text())
    assert results["status"] == "completed"
    assert results["selection_metric"] == "val_field_product_macro_f1"
    header = (run / "metrics.csv").read_text().splitlines()[0].split(",")
    assert "val_field_product_macro_f1" in header


@pytest.mark.parametrize(
    "flags", [["--lab-cap", "-1"], ["--label-smoothing", "1.0"], ["--label-smoothing", "-0.1"]]
)
def test_bad_option_values_are_refused(monkeypatch, tmp_path, flags):
    run_main(monkeypatch, tmp_path, *flags)
    with pytest.raises(SystemExit):
        train.parse_args()


def test_defaults_keep_the_previous_behaviour(monkeypatch, tmp_path):
    run_main(monkeypatch, tmp_path)
    args = train.parse_args()
    assert (args.aug, args.lab_cap, args.label_smoothing) == ("basic", 0, 0.0)
    assert args.selection_metric == "val_macro_f1"
