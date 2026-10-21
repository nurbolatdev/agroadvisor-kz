import csv
import json
from collections import Counter

import torch
from PIL import Image

from ml.data import IMAGE_SIZE, PlantDataset, balanced_sampler, eval_transform, train_transform


def make_dataset(tmp_path):
    rows = []
    for i, (code, split) in enumerate(
        [("a", "train"), ("a", "train"), ("b", "train"), ("b", "val")]
    ):
        path = tmp_path / code / f"{i}.png"
        path.parent.mkdir(exist_ok=True)
        Image.new("RGBA" if i == 0 else "RGB", (300, 180), (10 * i, 120, 40)).save(path)
        rows.append({"file": f"{code}/{i}.png", "class": code, "group": i, "split": split})
    with (tmp_path / "splits.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (tmp_path / "class_index.json").write_text(
        json.dumps({"classes_version": 1, "classes": ["b", "a"]})
    )
    return tmp_path


def test_dataset_reads_split_and_uses_class_index_order(tmp_path):
    dataset = PlantDataset(make_dataset(tmp_path), "train", eval_transform())

    assert len(dataset) == 3
    assert dataset.targets == [1, 1, 0]
    image, label = dataset[0]  # RGBA file is converted to RGB
    assert image.shape == (3, IMAGE_SIZE, IMAGE_SIZE)
    assert image.dtype == torch.float32
    assert label == 1


def test_train_transform_outputs_model_input(tmp_path):
    image = Image.new("RGB", (500, 333), (90, 160, 60))
    assert train_transform()(image).shape == (3, IMAGE_SIZE, IMAGE_SIZE)


def test_balanced_sampler_evens_out_classes():
    torch.manual_seed(0)
    targets = [0] * 900 + [1] * 100
    drawn = Counter(targets[i] for i in balanced_sampler(targets))
    assert abs(drawn[0] - drawn[1]) < 150
