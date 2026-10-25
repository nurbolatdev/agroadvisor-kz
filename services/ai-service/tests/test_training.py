import csv
import json
import sys

import numpy as np
import pytest
from PIL import Image

from ml import train
from ml.evaluate import compute_metrics, crop_masks, mask_logits
from ml.registry import load_registry

REGISTRY = load_registry()
CLASSES = [c.code for c in REGISTRY.active()]
INDEX = {code: i for i, code in enumerate(CLASSES)}


def one_hot_logits(codes: list[str]) -> np.ndarray:
    logits = np.zeros((len(codes), len(CLASSES)))
    for row, code in enumerate(codes):
        logits[row, INDEX[code]] = 5.0
    return logits


def test_head_matches_class_count():
    model = train.build_model(len(CLASSES), pretrained=False)
    assert model.classifier[1].out_features == len(CLASSES) == 20


def test_set_stage_freezes_backbone_only():
    model = train.build_model(len(CLASSES), pretrained=False)
    head = train.set_stage(model, frozen_backbone=True)
    assert {id(p) for p in head} == {id(p) for p in model.classifier.parameters()}
    everything = train.set_stage(model, frozen_backbone=False)
    assert len(everything) == len(list(model.parameters()))


def test_crop_masks_cover_only_the_crop_classes():
    masks = crop_masks(CLASSES, REGISTRY)
    assert set(masks) == {"tomato", "potato", "corn", "wheat"}
    for crop, indices in masks.items():
        assert indices and all(CLASSES[i].startswith(f"{crop}__") for i in indices)
    assert INDEX["unknown"] not in {i for idx in masks.values() for i in idx}


def test_mask_logits_restricts_the_answer_to_the_selected_crop():
    logits = one_hot_logits(["potato__late_blight"])
    logits[0, INDEX["tomato__late_blight"]] = 4.0
    masked = mask_logits(logits, ["tomato"], crop_masks(CLASSES, REGISTRY))
    assert CLASSES[masked.argmax()] == "tomato__late_blight"
    assert (mask_logits(logits, [None], crop_masks(CLASSES, REGISTRY)) == logits).all()


def toy_metrics(true, wrong_first=False):
    logits = one_hot_logits(true)
    if wrong_first:  # a potato class narrowly beats the true tomato class
        logits[0, INDEX["potato__late_blight"]] = 6.0
    targets = np.array([INDEX[c] for c in true])
    crops = [REGISTRY.get(c).crop for c in true]
    kinds = ["lab", "field"] + ["other"] * (len(true) - 2)
    return compute_metrics(logits, targets, CLASSES, crops, kinds, REGISTRY)


def test_metrics_on_perfect_predictions():
    m = toy_metrics(["tomato__late_blight", "corn__common_rust", "unknown", "potato__healthy"])
    assert m["acc"] == m["macro_f1"] == m["top3_acc"] == 1.0
    assert m["crop_masked_acc"] == 1.0
    assert m["unknown"] == {"precision": 1.0, "recall": 1.0}
    assert {d: m["by_domain"][d]["n"] for d in ("lab", "field", "other")} == {
        "lab": 1, "field": 1, "other": 2,
    }  # fmt: skip
    assert m["per_class"]["corn__common_rust"]["support"] == 1
    assert len(m["per_class"]) == 20


def test_crop_masked_metrics_forgive_errors_across_crops():
    m = toy_metrics(["tomato__late_blight", "corn__common_rust", "unknown"], wrong_first=True)
    assert m["acc"] == pytest.approx(2 / 3)
    assert m["crop_masked_acc"] == 1.0  # the unknown image is skipped, the rest is right
    assert m["by_domain"]["lab"]["acc"] == 0.0
    field = m["by_domain"]["field"]["per_class"]
    assert field["corn__common_rust"] == {
        "precision": 1.0, "recall": 1.0, "f1": 1.0, "support": 1,
    }  # fmt: skip
    assert field["tomato__late_blight"]["support"] == 0


def make_dataset(root):
    """20 classes, 2 train / 1 val / 1 test tiny images each, with a manifest like the real one."""
    splits = ["train", "train", "val", "test"]
    rows, manifest = [], []
    for code in CLASSES:
        crop = REGISTRY.get(code).crop or ""
        for i, split in enumerate(splits):
            name = f"{code}/{i}.jpg"
            (root / code).mkdir(exist_ok=True)
            Image.new("RGB", (64, 64), (INDEX[code] * 10, 80, 120)).save(root / name)
            rows.append({"file": name, "class": code, "group": f"{code}{i}", "split": split})
            manifest.append({"file": name, "crop": crop, "kind": "field" if i >= 2 else "lab"})
    for filename, data in (("splits.csv", rows), ("manifest.csv", manifest)):
        with (root / filename).open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(data[0]))
            writer.writeheader()
            writer.writerows(data)
    (root / "class_index.json").write_text(
        json.dumps({"classes_version": 1, "classes": CLASSES}), encoding="utf-8"
    )


def test_run_writes_every_artifact(tmp_path, monkeypatch):
    dataset, runs = tmp_path / "ds", tmp_path / "runs"
    dataset.mkdir()
    make_dataset(dataset)
    argv = [
        "train", "--id", "T0-E001", "--objective", "o", "--hypothesis", "h",
        "--dataset-dir", str(dataset), "--runs-dir", str(runs), "--device", "cpu",
        "--head-epochs", "1", "--full-epochs", "1", "--batch-size", "8",
        "--num-workers", "0", "--no-pretrained", "--eval-test",
    ]  # fmt: skip
    monkeypatch.setattr(sys, "argv", argv)
    train.main()

    run = runs / "T0-E001"
    for name in (
        "config.json", "env.json", "metrics.csv", "results.json", "curves.png",
        "confusion_val.png", "confusion_val_field.png", "confusion_test.png", "best.pt",
        "class_index.json", "model_card.json", "tb",
    ):  # fmt: skip
        assert (run / name).exists(), name
    results = json.loads((run / "results.json").read_text())
    assert results["status"] == "completed"
    assert results["selection_metric"] == "val_macro_f1"
    assert results["best_epoch"] in (1, 2)
    for split in ("val", "test"):
        assert {
            "acc", "macro_f1", "top3_acc", "crop_masked_acc", "crop_masked_macro_f1",
            "by_domain", "unknown", "per_class",
        } <= set(results[split])  # fmt: skip
    assert json.loads((run / "class_index.json").read_text())["classes"] == CLASSES
    header = (run / "metrics.csv").read_text().splitlines()[0]
    assert header == ",".join(train.METRIC_COLUMNS)
    with pytest.raises(SystemExit):  # a finished ID cannot be reused
        train.main()
