import csv
import json
import shutil

import pytest
import torch
from test_training import make_dataset

from ml.evaluate import evaluate_split, excluded_md5s, file_md5s, train_md5s
from ml.train import build_model


def make_run(root, name, dataset_dir):
    run = root / name
    run.mkdir()
    (run / "config.json").write_text(
        json.dumps({"id": name, "dataset_dir": str(dataset_dir)}), encoding="utf-8"
    )
    return run


def resplit(source, target, mapping):
    """The same photos in another dataset whose split was made again (``mapping`` old -> new)."""
    shutil.copytree(source, target)
    with (source / "splits.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["split"] = mapping[row["split"]]
    with (target / "splits.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def datasets(tmp_path):
    v1, v2 = tmp_path / "v1", tmp_path / "v2"
    v1.mkdir()
    make_dataset(v1)
    # in v2 the old train and val photos are all validation photos, the old test stays test
    resplit(v1, v2, {"train": "val", "val": "val", "test": "test"})
    return v1, v2


def test_train_md5s_are_the_photos_of_the_train_split(datasets):
    v1, _ = datasets
    assert len(train_md5s(v1)) == 40  # two train photos for each of the 20 classes
    assert train_md5s(v1) < set(file_md5s(v1).values())  # val and test photos are not in it


def test_a_run_scored_on_another_dataset_leaves_out_its_own_train_photos(datasets, tmp_path):
    v1, v2 = datasets
    run = make_run(tmp_path, "A5", v1)
    exclude, sources = excluded_md5s(run, v2)
    assert exclude == train_md5s(v1) and sources == ["v1"]
    assert excluded_md5s(run, v1) == (set(), [])  # on its own dataset nothing is left out


def test_another_run_can_add_its_train_photos(datasets, tmp_path):
    v1, v2 = datasets
    new = make_run(tmp_path, "A10", v2)
    old = make_run(tmp_path, "A5", v1)
    assert excluded_md5s(new, v2) == (set(), [])
    exclude, sources = excluded_md5s(new, v2, [old])
    assert exclude == train_md5s(v1) and sources == ["v1"]


def test_scoring_skips_the_photos_the_model_trained_on(datasets):
    v1, v2 = datasets
    torch.manual_seed(0)
    model = build_model(20, pretrained=False)
    metrics, logits, targets, _ = evaluate_split(
        model, v2, "val", torch.device("cpu"), batch_size=16, num_workers=0,
        exclude_md5=train_md5s(v1),
    )  # fmt: skip
    # v2 val has 60 photos (20 old val x 1 + 20 x 2 old train); the 40 old train photos are out
    assert metrics["excluded_train_overlap"] == 40
    assert metrics["evaluated_photos"] == 20 == len(targets) == len(logits)
    full, *_ = evaluate_split(
        model, v2, "val", torch.device("cpu"), batch_size=16, num_workers=0
    )
    assert full["evaluated_photos"] == 60 and full["excluded_train_overlap"] == 0


def test_a_split_made_only_of_training_photos_cannot_be_scored(datasets):
    v1, v2 = datasets
    model = build_model(20, pretrained=False)
    with pytest.raises(ValueError, match="training photo"):
        evaluate_split(
            model, v2, "test", torch.device("cpu"), num_workers=0,
            exclude_md5=set(file_md5s(v2).values()),
        )  # fmt: skip
