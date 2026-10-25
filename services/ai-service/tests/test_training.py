import csv
import json
import sys

import numpy as np
import pytest
from PIL import Image

from ml import train
from ml.data import field_weights
from ml.evaluate import compare_runs, compute_metrics, crop_masks, mask_logits
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


def test_product_mask_counts_unknown_answers_as_errors():
    # a tomato photo that the model calls ``unknown``
    logits = one_hot_logits(["unknown"])
    logits[0, INDEX["tomato__late_blight"]] = 1.0  # the runner-up
    targets = np.array([INDEX["tomato__late_blight"]])
    m = compute_metrics(logits, targets, CLASSES, ["tomato"], ["field"], REGISTRY)
    assert m["crop_masked_acc"] == 1.0  # crop classes only: forced onto a tomato class
    assert m["crop_masked_product_acc"] == 0.0  # /predict would answer unknown
    assert m["crop_masked_n"] == 1


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
    assert set(results["val"]["crop_masked_product_by_domain"]) == {"lab", "field", "other"}
    assert set(results["val"]["crop_masked_product_field_by_crop"]) == {
        "tomato", "potato", "corn", "wheat",
    }  # fmt: skip
    ci = results["val"]["ci95"]
    assert set(ci) == {
        "crop_masked_product_macro_f1", "crop_masked_product_macro_f1_field",
        *(f"crop_masked_product_macro_f1_field_{c}" for c in ("tomato", "potato", "corn", "wheat")),
    }  # fmt: skip
    low, high = ci["crop_masked_product_macro_f1"]
    assert 0 <= low <= high <= 1
    assert results["val"]["ci95_bootstrap"] == {"resamples": 1000, "seed": 42, "unit": "group"}
    assert (run / "logits_val.npz").exists() and (run / "logits_test.npz").exists()
    same = compare_runs(run, run, "val", n_boot=50)  # a run compared with itself
    assert same["crop_masked_product_macro_f1"] == {"diff": 0.0, "ci95": [0.0, 0.0]}
    card = json.loads((run / "model_card.json").read_text())
    assert card["calibrated"] is False
    assert card["source_run"] == "T0-E001"
    assert {s["license"] for s in card["data_sources"]} >= {"CC BY 4.0", "CC0 1.0"}
    assert len(card["checkpoint_sha256"]) == len(card["class_index_sha256"]) == 64
    assert json.loads((run / "class_index.json").read_text())["classes"] == CLASSES
    header = (run / "metrics.csv").read_text().splitlines()[0]
    assert header == ",".join(train.METRIC_COLUMNS)
    with pytest.raises(SystemExit):  # a finished ID cannot be reused
        train.main()


def run_main(monkeypatch, tmp_path, *extra):
    dataset, runs = tmp_path / "ds", tmp_path / "runs"
    dataset.mkdir(exist_ok=True)
    make_dataset(dataset)
    argv = [
        "train", "--id", "T0-E002", "--objective", "o", "--hypothesis", "h",
        "--dataset-dir", str(dataset), "--runs-dir", str(runs), "--device", "cpu",
        "--num-workers", "0", "--no-pretrained", *extra,
    ]  # fmt: skip
    monkeypatch.setattr(sys, "argv", argv)
    return runs / "T0-E002"


@pytest.mark.parametrize(
    ("error", "status"), [(KeyboardInterrupt, "stopped"), (RuntimeError, "failed")]
)
def test_interrupted_and_failed_runs_keep_their_status(monkeypatch, tmp_path, error, status):
    run = run_main(monkeypatch, tmp_path)

    def boom(*args, **kwargs):
        raise error

    monkeypatch.setattr(train, "run_training", boom)
    with pytest.raises(SystemExit if error is KeyboardInterrupt else error):
        train.main()
    assert json.loads((run / "results.json").read_text())["status"] == status
    assert (run / "env.json").exists()


def test_eval_test_is_refused_for_smoke_runs(monkeypatch, tmp_path):
    run_main(monkeypatch, tmp_path, "--subset", "0.5", "--eval-test")
    with pytest.raises(SystemExit):
        train.main()


def test_field_weights_give_each_class_the_same_mass_and_the_field_its_share():
    targets = [0, 0, 0, 0, 1, 1, 2, 2]
    kinds = ["lab", "lab", "lab", "field", "lab", "lab", "field", "field"]
    w = field_weights(targets, kinds, 0.5)
    assert w[3] == pytest.approx(0.5)  # the single field photo of class 0 gets half the class
    assert sum(w[:3]) == pytest.approx(0.5)  # the three others share the rest
    assert w[4] == w[5] == pytest.approx(0.5)  # no field photos: plain 1/count
    assert w[6] == w[7] == pytest.approx(0.5)  # only field photos: plain 1/count
    for cls in (0, 1, 2):
        assert sum(x for x, t in zip(w, targets, strict=True) if t == cls) == pytest.approx(1.0)


def test_run_with_field_share_records_it(monkeypatch, tmp_path):
    run = run_main(
        monkeypatch, tmp_path, "--field-share", "0.5", "--head-epochs", "1", "--full-epochs", "0",
        "--batch-size", "8",
    )  # fmt: skip
    train.main()
    config = json.loads((run / "config.json").read_text())
    assert config["field_share"] == 0.5
    assert "field photos" in config["sampler"]
    assert json.loads((run / "results.json").read_text())["status"] == "completed"


def test_field_share_works_together_with_a_subset(monkeypatch, tmp_path):
    run = run_main(
        monkeypatch, tmp_path, "--field-share", "0.5", "--subset", "0.5", "--head-epochs", "1",
        "--full-epochs", "0", "--batch-size", "8",
    )  # fmt: skip
    train.main()
    assert json.loads((run / "results.json").read_text())["status"] == "completed"


def test_field_share_conflicts_with_no_balanced(monkeypatch, tmp_path):
    run_main(monkeypatch, tmp_path, "--field-share", "0.5", "--no-balanced")
    with pytest.raises(SystemExit):
        train.main()
