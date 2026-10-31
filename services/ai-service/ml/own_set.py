"""Own photo set (A6): field photos taken by the team, scored but never trained on.

Layout of the raw folder::

    <raw>/<class code>/<photo>.jpg|jpeg|png    e.g. tomato__healthy/IMG_0412.jpg
    <raw>/meta.csv                             optional: file,leaf,region,date,identified_by

``file`` in ``meta.csv`` is the path relative to ``<raw>``; photos of one leaf share a ``leaf``
value, so the bootstrap in ``ml.evaluate`` resamples leaves, not near-identical photos. The
result is a small dataset in the format of ``ml/datasets/v2`` (every photo in the ``bench``
split), scored with ``python -m ml.evaluate <run> --dataset-dir ml/datasets/own --split bench``.
Photos the model trained on (same MD5) are left out. The copies carry no EXIF: field photos
hold the GPS position of a farm.

    python -m ml.own_set <raw dir> --exclude-train-of ml/datasets/v1 \\
        --exclude-train-of ml/datasets/v2
"""

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from ml.registry import Registry, load_registry

MIN_SIDE = 224  # the service refuses smaller photos (docs/api/ai-predict.md)
SUFFIXES = {".jpg", ".jpeg", ".png"}
# Photo formats that are not read: counted and reported, not skipped silently (iPhone saves HEIC)
UNSUPPORTED = {".heic", ".heif", ".webp", ".tif", ".tiff", ".bmp", ".gif", ".dng", ".raw"}
SOURCE = "own"
# Classes with no independent field source anywhere else (lead's decision of 26 Oct 2026)
REQUIRED = (
    "tomato__healthy",
    "potato__healthy",
    "corn__healthy",
    "wheat__healthy",
    "tomato__early_blight",
)
META_COLUMNS = ("file", "original", "leaf", "region", "date", "identified_by")


def missing_required(per_class: dict[str, int]) -> list[str]:
    """Classes that must be collected and have no photo yet."""
    return [code for code in REQUIRED if not per_class.get(code)]


def _read_meta(raw_dir: Path) -> dict[str, dict]:
    path = raw_dir / "meta.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return {r["file"].replace("\\", "/"): r for r in csv.DictReader(f)}


def _class_folders(raw_dir: Path, registry: Registry) -> list[Path]:
    folders = sorted(p for p in raw_dir.iterdir() if p.is_dir())
    active = {c.code for c in registry.active() if c.code != "unknown"}
    wrong = [p.name for p in folders if p.name not in active]
    if wrong:
        raise ValueError(
            f"folders that are not class codes of the registry: {', '.join(wrong)} "
            "(the 'unknown' class is not collected by hand)"
        )
    return folders


def _store(photo: Path, target: Path) -> str:
    """Copy upright and without EXIF; returns '' if stored, else the reason it was refused."""
    try:
        with Image.open(photo) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
    except (UnidentifiedImageError, OSError):
        return "unreadable"
    if min(image.size) < MIN_SIDE:
        return "too_small"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.suffix == ".png":
        image.save(target, "PNG")
    else:
        image.convert("RGB").save(target, "JPEG", quality=95)
    return ""


def build_own(
    raw_dir: Path,
    out_dir: Path,
    registry: Registry | None = None,
    exclude_md5: set[str] | None = None,
) -> dict:
    """Build the own set in ``out_dir``; returns a summary (kept, per class, dropped by reason)."""
    registry = registry or load_registry()
    raw_dir, out_dir = Path(raw_dir), Path(out_dir)
    meta = _read_meta(raw_dir)
    dropped = Counter(
        unreadable=0, too_small=0, duplicate=0, train_overlap=0, unsupported_format=0
    )
    seen: set[str] = set()
    found: set[str] = set()  # every photo file met, kept or not: what meta.csv rows can match
    manifest, splits, provenance = [], [], []

    for folder in _class_folders(raw_dir, registry):
        code = folder.name
        crop = registry.get(code).crop or ""
        files = sorted(p for p in folder.rglob("*") if p.is_file())
        dropped["unsupported_format"] += sum(p.suffix.lower() in UNSUPPORTED for p in files)
        photos = [p for p in files if p.suffix.lower() in SUFFIXES]
        for photo in photos:
            original = photo.relative_to(raw_dir).as_posix()
            found.add(original)
            md5 = hashlib.md5(photo.read_bytes()).hexdigest()
            if md5 in seen:
                dropped["duplicate"] += 1
                continue
            if exclude_md5 and md5 in exclude_md5:
                dropped["train_overlap"] += 1
                continue
            suffix = ".png" if photo.suffix.lower() == ".png" else ".jpg"
            name = f"{code}/{md5[:16]}{suffix}"
            reason = _store(photo, out_dir / name)
            if reason:
                dropped[reason] += 1
                continue
            seen.add(md5)
            row = meta.get(original, {})
            leaf = (row.get("leaf") or "").strip()
            manifest.append([name, code, crop, SOURCE, "field", "bench", original, md5])
            splits.append([name, code, f"{code}:{leaf}" if leaf else md5[:16], "bench"])
            provenance.append(
                [name, original, leaf]
                + [(row.get(c) or "").strip() for c in META_COLUMNS[3:]]
            )

    if not manifest:
        raise ValueError(f"no photos kept from {raw_dir} (dropped: {dict(dropped)})")
    manifest_header = ["file", "class", "crop", "source", "kind", "role", "original", "md5"]
    _write(out_dir / "manifest.csv", manifest_header, manifest)
    _write(out_dir / "splits.csv", ["file", "class", "group", "split"], splits)
    _write(out_dir / "meta.csv", list(META_COLUMNS), provenance)
    index = {"classes_version": registry.version, "classes": [c.code for c in registry.active()]}
    (out_dir / "class_index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    per_class = dict(Counter(row[1] for row in manifest))
    return {
        "kept": len(manifest),
        "per_class": per_class,
        "dropped": dict(dropped),
        "unmatched_meta": sorted(set(meta) - found),
        # without a leaf every photo is its own group, and the intervals come out too narrow
        "without_leaf": sum(1 for row in provenance if not row[2]),
    }


def _write(path: Path, header: list[str], rows: list[list]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def main() -> None:
    from ml.evaluate import train_md5s

    parser = argparse.ArgumentParser(description="Build the own photo set from a folder of photos")
    parser.add_argument("raw_dir", type=Path)
    parser.add_argument("--out", type=Path, default=Path("ml/datasets/own"))
    parser.add_argument(
        "--exclude-train-of", type=Path, action="append", default=[], metavar="DATASET_DIR",
        help="leave out photos in the train split of this dataset (by MD5); repeat for several",
    )  # fmt: skip
    args = parser.parse_args()
    exclude: set[str] = set()
    for dataset in args.exclude_train_of:
        exclude |= train_md5s(dataset)
    summary = build_own(args.raw_dir, args.out, exclude_md5=exclude)
    print(f"kept {summary['kept']} photos in {args.out}; dropped {summary['dropped']}")
    for code, count in sorted(summary["per_class"].items()):
        print(f"  {code:30} {count:>4}")
    if summary["dropped"]["unsupported_format"]:
        print("WARNING: HEIC and other formats are not read; convert them to JPEG (iPhone: "
              "Settings > Camera > Formats > Most Compatible)")  # fmt: skip
    if summary["unmatched_meta"]:
        print(f"WARNING: meta.csv rows with no photo: {', '.join(summary['unmatched_meta'])}")
    if summary["without_leaf"]:
        print(f"WARNING: {summary['without_leaf']} photos have no `leaf` in meta.csv; photos of "
              "one leaf count as independent, so the intervals come out too narrow")  # fmt: skip
    missing = missing_required(summary["per_class"])
    if missing:
        print(f"still to collect (no independent field source elsewhere): {', '.join(missing)}")


if __name__ == "__main__":
    main()
