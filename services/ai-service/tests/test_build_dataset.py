import csv
import random

from PIL import Image

from ml.build_dataset import build, collect, report
from ml.data_sources import load_sources
from ml.registry import load_registry


def make_image(path, color):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color).save(path)


def test_collect_and_build(tmp_path):
    registry = load_registry()
    source = next(s for s in load_sources(registry) if s.name == "wheat_kaggle")
    raw = tmp_path / "raw"
    make_image(raw / "data/train/Brown Rust/a.png", (200, 80, 0))
    make_image(raw / "data/test/brown_rust_test/b.png", (200, 80, 0))  # exact duplicate of a
    make_image(raw / "data/train/Healthy/c.png", (0, 160, 0))
    make_image(raw / "data/train/Smut/d.png", (40, 40, 40))  # not mapped
    make_image(raw / "__MACOSX/Healthy/._e.png", (1, 1, 1))  # archive junk
    (raw / "data/train/Healthy/broken.png").write_bytes(b"not an image")

    items = collect(source, raw, random.Random(0))
    assert sorted(i.code for i in items) == [
        "wheat__healthy",
        "wheat__leaf_rust",
        "wheat__leaf_rust",
    ]

    out = tmp_path / "v1"
    rows = build(items, registry, out)

    assert len(rows) == 2
    assert {r["class"] for r in rows} == {"wheat__leaf_rust", "wheat__healthy"}
    for row in rows:
        assert (out / row["file"]).exists()
        assert row["crop"] == "wheat" and row["kind"] == "field"
    with (out / "manifest.csv").open(encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) == 2

    text = report(rows, registry)
    assert "| `wheat__healthy` | 0 | 1 | 0 | 1 | below 100 |" in text
