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
THUMB_SIZE = 32
# Among 45 000 PLDD-UP pairs with a close hash, about 700 have a thumbnail difference below 8
# (copies of one photo); the rest are different leaves shot the same way (difference 8 to 30).
THUMB_DIFF = 6.0  # max mean absolute difference (0-255) of the 32x32 thumbnails of a copy
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}
SEED = 42
BENCH = "bench"
RF_SUFFIX = re.compile(r"\.rf\.[0-9a-f]+")
REPORT_MARKER = "<!-- bench-overlap -->"


def leaf_key(source: str, original: str) -> str:
    """Key shared by all shots of one leaf; other sources get one key per file."""
    path = PurePosixPath(original)
    if source != "plantvillage":
        # Roboflow exports name augmented copies "<photo>.rf.<hash>.jpg": one photo, one key
        return f"{source}:{RF_SUFFIX.sub('', original)}"
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


def thumbnail(path: Path) -> np.ndarray:
    """32x32 grayscale thumbnail, to tell near-copies from merely similar photos."""
    with Image.open(path) as img:
        small = img.convert("L").resize((THUMB_SIZE, THUMB_SIZE), Image.Resampling.LANCZOS)
    return np.asarray(small, dtype=np.int16).flatten()


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
    keys: list[str],
    classes: list[str],
    hashes: list[int],
    max_distance: int = HASH_DISTANCE,
    thumbs: np.ndarray | None = None,
    max_diff: float = THUMB_DIFF,
) -> list[int]:
    """Group index for every image: same leaf key, or near-identical images of one class.

    The 64-bit hash alone is coarse: leaves photographed the same way on a plain background often
    share it, and joining such pairs one after another chains hundreds of different leaves into
    one group. With ``thumbs`` (one row per image) a pair with a close hash is joined only if the
    mean absolute difference of the thumbnails is at most ``max_diff``, i.e. it is a real copy.
    """
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
            close = np.nonzero(distance <= max_distance)[0]
            if thumbs is not None and len(close):
                others = thumbs[[members[a + 1 + b] for b in close]]
                close = close[np.abs(others - thumbs[members[a]]).mean(axis=1) <= max_diff]
            for b in close:
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


def split_with_bench(
    groups: list[int], strata: list[str], roles: list[str], seed: int = SEED
) -> list[str | None]:
    """Split name for every image, with the bench kept apart.

    Bench photos go to ``bench``; the rest is split into train / val / test as before. A train-pool
    photo that shares a group with a bench photo (same leaf, or a near-identical copy) would leak
    into the benchmark, so it is dropped: its entry is ``None``.
    """
    bench_groups = {g for g, role in zip(groups, roles, strict=True) if role == "bench"}
    pool = [i for i, g in enumerate(groups) if g not in bench_groups]
    parts: list[str | None] = [None] * len(groups)
    for i, role in enumerate(roles):
        if role == "bench":
            parts[i] = BENCH
    assigned = split_groups([groups[i] for i in pool], [strata[i] for i in pool], seed=seed)
    for i, part in zip(pool, assigned, strict=True):
        parts[i] = part
    return parts


def bench_overlap(
    groups: list[int], roles: list[str], sources: list[str]
) -> Counter[tuple[str, str]]:
    """Train-pool photos dropped because of a bench photo, as (bench source, train source)."""
    bench_sources: dict[int, set[str]] = {}
    for g, role, source in zip(groups, roles, sources, strict=True):
        if role == "bench":
            bench_sources.setdefault(g, set()).add(source)
    dropped: Counter[tuple[str, str]] = Counter()
    for g, role, source in zip(groups, roles, sources, strict=True):
        if role != "bench" and g in bench_sources:
            dropped[(" + ".join(sorted(bench_sources[g])), source)] += 1
    return dropped


def largest_groups(
    groups: list[int], classes: list[str], parts: list[str | None], top: int = 5
) -> list[tuple[int, str, str]]:
    """(size, class, part) of the biggest groups: a very big group is one blob in the split."""
    sizes = Counter(groups)
    first: dict[int, int] = {}
    for i, g in enumerate(groups):
        first.setdefault(g, i)
    return [(n, classes[first[g]], str(parts[first[g]])) for g, n in sizes.most_common(top)]


def write_overlap_report(
    dataset_dir: Path,
    dropped: Counter[tuple[str, str]],
    largest: list[tuple[int, str, str]] | None = None,
) -> None:
    """Replace the split section at the end of report.md (the build writes the rest)."""
    path = dataset_dir / "report.md"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    text = text.split(REPORT_MARKER)[0].rstrip() + "\n"
    lines = [
        "",
        REPORT_MARKER,
        "Train-pool photos dropped because the same leaf or a near-identical copy is in a bench "
        "source (dHash within a class and shared leaf key; the bench keeps the photo):",
        "",
    ]
    if dropped:
        lines += ["| Bench source | Train source | Photos dropped |", "| --- | --- | ---: |"]
        lines += [f"| {b} | {t} | {n} |" for (b, t), n in sorted(dropped.items())]
        lines.append(f"| **total** | | {sum(dropped.values())} |")
    else:
        lines.append("None.")
    if largest:
        lines += [
            "",
            "Largest groups of near-identical photos (a group always goes to one part):",
            "",
            "| Photos | Class | Part |",
            "| ---: | --- | --- |",
        ]
        lines += [f"| {n} | `{code}` | {part} |" for n, code, part in largest]
    path.write_text(text + "\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Write splits.csv and class_index.json.")
    parser.add_argument("--dataset-dir", type=Path)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    registry = load_registry()
    dataset_dir = args.dataset_dir or DATASETS_DIR / "v2"
    with (dataset_dir / "manifest.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"hashing {len(rows)} images")
    keys = [leaf_key(r["source"], r["original"]) for r in rows]
    classes = [r["class"] for r in rows]
    hashes = [dhash(dataset_dir / r["file"]) for r in rows]
    thumbs = np.stack([thumbnail(dataset_dir / r["file"]) for r in rows])
    groups = group_images(keys, classes, hashes, thumbs=thumbs)
    # Lab and field photos are split separately, so each part gets its share of field photos
    strata = [f"{r['class']}/{r['kind']}" for r in rows]
    roles = [r.get("role") or "train" for r in rows]  # v1 has no role column
    all_parts = split_with_bench(groups, strata, roles, seed=args.seed)
    dropped = bench_overlap(groups, roles, [r["source"] for r in rows])
    if "bench" in roles:  # a dataset without a bench (v1) keeps its report as it is
        largest = largest_groups(groups, classes, all_parts)
        write_overlap_report(dataset_dir, dropped, largest)
    print(f"train-pool photos dropped because of bench matches: {sum(dropped.values())}")
    kept = [i for i, part in enumerate(all_parts) if part is not None]
    rows = [rows[i] for i in kept]
    classes = [classes[i] for i in kept]
    groups = [groups[i] for i in kept]
    parts = [all_parts[i] for i in kept]

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
    names = (*SPLIT_RATIOS, BENCH)
    print(
        f"{len(set(groups))} groups; field photos: "
        + ", ".join(f"{p} {field[p]}" for p in names)
    )
    print(f"{'class':30} " + " ".join(f"{p:>6}" for p in names))
    for code in class_index["classes"]:
        print(f"{code:30} " + " ".join(f"{counts[(code, p)]:>6}" for p in names))


if __name__ == "__main__":
    main()
