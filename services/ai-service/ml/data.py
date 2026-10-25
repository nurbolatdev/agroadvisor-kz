"""Dataset, augmentations and data loaders for training.

Reads ml/datasets/v<version>/splits.csv and class_index.json written by `python -m ml.splits`.
Labels are indices from class_index.json — the same order as the model head.
"""

import csv
import json
from collections import Counter
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision.transforms import v2

IMAGE_SIZE = 224
# ImageNet statistics — EfficientNet-B0 is pretrained on ImageNet
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def train_transform() -> v2.Compose:
    """Augmentations that imitate field conditions: framing, angle, light, focus."""
    return v2.Compose(
        [
            v2.ToImage(),
            v2.RandomResizedCrop(IMAGE_SIZE, scale=(0.6, 1.0), antialias=True),
            v2.RandomHorizontalFlip(),
            v2.RandomVerticalFlip(),
            v2.RandomRotation(30),
            v2.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.02),
            v2.RandomApply([v2.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0))], p=0.2),
            v2.ToDtype(torch.float32, scale=True),
            v2.Normalize(MEAN, STD),
        ]
    )


def eval_transform() -> v2.Compose:
    return v2.Compose(
        [
            v2.ToImage(),
            v2.Resize(256, antialias=True),
            v2.CenterCrop(IMAGE_SIZE),
            v2.ToDtype(torch.float32, scale=True),
            v2.Normalize(MEAN, STD),
        ]
    )


def load_class_index(dataset_dir: Path) -> list[str]:
    data = json.loads((dataset_dir / "class_index.json").read_text(encoding="utf-8"))
    return data["classes"]


class PlantDataset(Dataset):
    """Images of one split: train, val or test."""

    def __init__(self, dataset_dir: Path, split: str, transform=None) -> None:
        self.dataset_dir = Path(dataset_dir)
        self.classes = load_class_index(self.dataset_dir)
        index = {code: i for i, code in enumerate(self.classes)}
        with (self.dataset_dir / "splits.csv").open(encoding="utf-8") as f:
            rows = [r for r in csv.DictReader(f) if r["split"] == split]
        if not rows:
            raise ValueError(f"no images in split {split!r} — run python -m ml.splits")
        self.files = [r["file"] for r in rows]
        self.targets = [index[r["class"]] for r in rows]
        self.transform = transform

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, int]:
        with Image.open(self.dataset_dir / self.files[i]) as img:
            image = img.convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, self.targets[i]


def balanced_sampler(targets: list[int]) -> WeightedRandomSampler:
    """Every class is drawn equally often, regardless of its size (152 to 2 237 images)."""
    counts = Counter(targets)
    weights = torch.tensor([1.0 / counts[t] for t in targets], dtype=torch.double)
    return WeightedRandomSampler(weights, num_samples=len(targets), replacement=True)


def field_weights(targets: list[int], kinds: list[str], field_share: float) -> list[float]:
    """Sampling weights: classes are drawn equally often, and inside a class that has field
    photos, ``field_share`` of the draws go to them (the rest to lab and other photos).

    A class without field photos, or consisting only of them, keeps plain 1/count weights.
    """
    total = Counter(targets)
    field = Counter(t for t, k in zip(targets, kinds, strict=True) if k == "field")
    weights = []
    for target, kind in zip(targets, kinds, strict=True):
        n_field, n_rest = field[target], total[target] - field[target]
        if n_field == 0 or n_rest == 0:
            weights.append(1.0 / total[target])
        elif kind == "field":
            weights.append(field_share / n_field)
        else:
            weights.append((1.0 - field_share) / n_rest)
    return weights


def field_weighted_sampler(
    targets: list[int], kinds: list[str], field_share: float
) -> WeightedRandomSampler:
    weights = torch.tensor(field_weights(targets, kinds, field_share), dtype=torch.double)
    return WeightedRandomSampler(weights, num_samples=len(targets), replacement=True)


def make_loaders(
    dataset_dir: Path, batch_size: int = 32, num_workers: int = 4, balanced: bool = True
) -> dict[str, DataLoader]:
    train = PlantDataset(dataset_dir, "train", train_transform())
    loaders = {
        "train": DataLoader(
            train,
            batch_size=batch_size,
            sampler=balanced_sampler(train.targets) if balanced else None,
            shuffle=not balanced,
            num_workers=num_workers,
            persistent_workers=num_workers > 0,
        )
    }
    for split in ("val", "test"):
        loaders[split] = DataLoader(
            PlantDataset(dataset_dir, split, eval_transform()),
            batch_size=batch_size,
            num_workers=num_workers,
        )
    return loaders
