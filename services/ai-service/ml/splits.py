"""Leakage-safe train/val/test split of the built dataset.

Usage (from services/ai-service): python -m ml.splits

Photos of the same leaf must land in the same part, otherwise test accuracy is
inflated. Images are grouped by two rules, and a whole group goes to one part:

1. File names — PlantVillage names several shots of one leaf alike
   ("GHLB Leaf 1 Day 6", "GHLB Leaf 1.1 Day 12", "R.S_HL 8315 copy 2").
2. Image content — near-identical photos (resized or recompressed copies) of the
   same class have close perceptual hashes (dHash).
"""

import argparse
import csv
import json
import random
import re
from collections import Counter
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image

from ml.build_dataset import DATASETS_DIR
from ml.registry import load_registry

HASH_DISTANCE = 4  # max differing bits of two 64-bit dHashes to treat images as copies
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}
SEED = 42


def leaf_key(source: str, original: str) -> str:
    """Key shared by all shots of one leaf; other sources get one key per file."""
    path = PurePosixPath(original)
    if source != "plantvillage":
        return f"{source}:{original}"
    name = path.stem.split("___", 1)[-1]  # drop the UUID prefix
    name = re.sub(r"\s+copy(\s*\d+)?$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+day\s*\d+$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"(leaf\s*\d+)\.\d+$", r"\1", name, flags=re.IGNORECASE)
    return f"{source}:{path.parent.name}:{name.strip()}"


def dhash(path: Path) -> int:
    """64-bit difference hash: compares neighbouring pixels of a 9x8 grayscale thumbnail."""
    with Image.open(path) as img:
        pixels = np.asarray(
            img.convert("L").resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16
        )
    bits = (pixels[:, 1:] > pixels[:, :-1]).flatten()
    return int(np.packbits(bits).view(">u8")[0])


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a: int, b: int) -> None:
        self.parent[self.find(a)] = self.find(b)


def group_images(
    keys: list[str], classes: list[str], hashes: list[int], max_distance: int = HASH_DISTANCE
) -> list[int]:
    """Group index for every image: same leaf key, or near-identical images of one class."""
    n = len(keys)
    uf = _UnionFind(n)
    first_by_key: dict[str, int] = {}
    for i, key in enumerate(keys):
        uf.union(i, first_by_key.setdefault(key, i))

    by_class: dict[str, list[int]] = {}
    for i, cls in enumerate(classes):
        by_class.setdefault(cls, []).append(i)
    for members in by_class.values():
        values = np.array([hashes[i] for i in members], dtype=np.uint64)
        for a in range(len(members) - 1):
            distance = np.bitwise_count(values[a + 1 :] ^ values[a])
            for b in np.nonzero(distance <= max_distance)[0]:
                uf.union(members[a], members[a + 1 + b])

    roots: dict[int, int] = {}
    return [roots.setdefault(uf.find(i), len(roots)) for i in range(n)]


def split_groups(
    groups: list[int],
    strata: list[str],
    ratios: dict[str, float] = SPLIT_RATIOS,
    seed: int = SEED,
) -> list[str]:
    """Split name for every image. Whole groups are assigned, separately within each stratum
    (class + photo kind), to the part that is furthest below its target share."""
    rng = random.Random(seed)
    group_stratum: dict[int, str] = {}
    group_size: Counter[int] = Counter(groups)
    for g, stratum in zip(groups, strata, strict=True):
        group_stratum.setdefault(g, stratum)

    assignment: dict[int, str] = {}
    for stratum in sorted(set(group_stratum.values())):
        stratum_groups = sorted(g for g, s in group_stratum.items() if s == stratum)
        rng.shuffle(stratum_groups)
        total = sum(group_size[g] for g in stratum_groups)
        filled = dict.fromkeys(ratios, 0)
        for g in stratum_groups:
            part = max(ratios, key=lambda p: ratios[p] * total - filled[p])
            assignment[g] = part
            filled[part] += group_size[g]
    return [assignment[g] for g in groups]


def main() -> None:
    parser = argparse.ArgumentParser(description="Write splits.csv and class_index.json.")
    parser.add_argument("--dataset-dir", type=Path)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    registry = load_registry()
    dataset_dir = args.dataset_dir or DATASETS_DIR / f"v{registry.version}"
    with (dataset_dir / "manifest.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"hashing {len(rows)} images")
    keys = [leaf_key(r["source"], r["original"]) for r in rows]
    classes = [r["class"] for r in rows]
    hashes = [dhash(dataset_dir / r["file"]) for r in rows]
    groups = group_images(keys, classes, hashes)
    # Lab and field photos are split separately, so each part gets its share of field photos
    strata = [f"{r['class']}/{r['kind']}" for r in rows]
    parts = split_groups(groups, strata, seed=args.seed)

    with (dataset_dir / "splits.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "class", "group", "split"])
        writer.writerows(zip([r["file"] for r in rows], classes, groups, parts, strict=True))

    # Index order of the model head; saved next to the weights after training
    class_index = {
        "classes_version": registry.version,
        "classes": [c.code for c in registry.active()],
    }
    (dataset_dir / "class_index.json").write_text(json.dumps(class_index, indent=2) + "\n")

    counts = Counter(zip(classes, parts, strict=True))
    field = Counter(p for r, p in zip(rows, parts, strict=True) if r["kind"] == "field")
    print(
        f"{len(set(groups))} groups; field photos: "
        + ", ".join(f"{p} {field[p]}" for p in SPLIT_RATIOS)
    )
    print(f"{'class':30} {'train':>6} {'val':>6} {'test':>6}")
    for code in class_index["classes"]:
        print(f"{code:30} " + " ".join(f"{counts[(code, p)]:>6}" for p in SPLIT_RATIOS))


if __name__ == "__main__":
    main()
