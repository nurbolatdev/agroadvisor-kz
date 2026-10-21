"""Leakage-safe train/val/test split of the built dataset.

Photos of the same leaf must land in the same part, otherwise test accuracy is
inflated. Images are grouped by two rules, and a whole group goes to one part:

1. File names — PlantVillage names several shots of one leaf alike
   ("GHLB Leaf 1 Day 6", "GHLB Leaf 1.1 Day 12", "R.S_HL 8315 copy 2").
2. Image content — near-identical photos (resized or recompressed copies) of the
   same class have close perceptual hashes (dHash).
"""

import re
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image

HASH_DISTANCE = 4  # max differing bits of two 64-bit dHashes to treat images as copies


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
