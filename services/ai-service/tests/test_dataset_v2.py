import csv
import json
import random
import sys
import zipfile
from collections import Counter

import pytest
from PIL import Image

from ml import build_dataset, splits
from ml.build_dataset import (
    Item,
    _unpack_local,
    build,
    collect,
    collect_coco,
    limit_per_class,
    report,
)
from ml.data_sources import Source, SourceConfigError, load_sources, normalize
from ml.registry import load_registry

REGISTRY = load_registry()


def photo(path, color, size=(8, 8)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path)


def write_sources(tmp_path, body: str):
    text = "sources:\n" + body
    path = tmp_path / "sources.yaml"
    path.write_text(text, encoding="utf-8")
    return load_sources(REGISTRY, path)


COMMON = "    kind: field\n    license: CC BY 4.0\n    url: https://example.org\n"
LOCAL = "    download:\n      type: local\n"


def test_two_level_names_tell_apart_classes_with_the_same_folder_name(tmp_path):
    source = write_sources(
        tmp_path,
        "  ccmt:\n" + COMMON + LOCAL
        + "    classes:\n      Maize/healthy: corn__healthy\n"
        + "      Tomato/healthy: tomato__healthy\n",
    )[0]
    raw = tmp_path / "raw"
    photo(raw / "Maize/healthy/a.png", (0, 90, 0))
    photo(raw / "Tomato/healthy/b.png", (0, 180, 0))
    photo(raw / "Maize/leaf blight/c.png", (90, 90, 0))  # not mapped
    codes = {i.original: i.code for i in collect(source, raw, random.Random(0))}
    assert codes == {
        "Maize/healthy/a.png": "corn__healthy",
        "Tomato/healthy/b.png": "tomato__healthy",
    }


def test_label_path_prefers_the_two_level_name_and_falls_back_to_the_folder(tmp_path):
    source = write_sources(
        tmp_path,
        "  s:\n" + COMMON + LOCAL
        + "    classes:\n      Maize/healthy: corn__healthy\n      brown rust: wheat__leaf_rust\n"
        + "    exclude: [Maize/Smut]\n",
    )[0]
    assert source.label_path(("data", "Maize", "Healthy")) == "corn__healthy"
    assert source.label_path(("train", "Brown-Rust")) == "wheat__leaf_rust"
    assert source.label_path(("Maize", "Smut")) is None
    assert source.label_path(()) is None
    assert normalize("Maize/Leaf Blight") == "maize/leaf_blight"


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        ("    role: judge\n", "role"),
        ("    loader: tiff\n", "loader"),
        ("    limit_per_class: 0\n", "limit_per_class"),
        ("    limit_per_class: many\n", "limit_per_class"),
        ("    role: bench\n    unknown: [x]\n    unknown_limit: 5\n", "bench"),
    ],
)
def test_invalid_new_options_are_rejected(tmp_path, extra, message):
    body = "  s:\n" + COMMON + LOCAL + "    classes:\n      a: corn__healthy\n" + extra
    with pytest.raises(SourceConfigError, match=message):
        write_sources(tmp_path, body)


@pytest.mark.parametrize("missing", ["license", "url", "download"])
def test_missing_required_fields_are_config_errors(tmp_path, missing):
    lines = {"license": "    license: CC0\n", "url": "    url: https://x.org\n", "download": LOCAL}
    body = "  s:\n    kind: field\n" + "".join(v for k, v in lines.items() if k != missing)
    with pytest.raises(SourceConfigError, match=missing):
        write_sources(tmp_path, body)


def test_unknown_download_type_is_rejected(tmp_path):
    body = "  s:\n" + COMMON + "    download:\n      type: ftp\n"
    with pytest.raises(SourceConfigError, match="download type"):
        write_sources(tmp_path, body)


def test_the_real_config_has_the_v2_sources():
    sources = {s.name: s for s in load_sources(REGISTRY)}
    assert sources["pldd-up"].limit_per_class == 1500 and sources["pldd-up"].role == "train"
    assert {n for n, s in sources.items() if s.role == "bench"} == {"plantwild"}
    assert sources["fieldplant"].loader == "coco"
    assert sources["ccmt"].label_path(("Maize", "healthy")) == "corn__healthy"
    assert sources["ccmt"].label_path(("Maize", "leaf blight")) is None  # undecided
    assert sources["tom2024"].label_path(("tomato_diseases", "virosis_d")) is None  # undecided
    fieldplant = sources["fieldplant"]
    assert fieldplant.label("Corn Healthy") == fieldplant.label("Corn_Healthy") == "corn__healthy"


def test_limit_per_class_is_seeded_and_does_not_depend_on_order(tmp_path):
    entries = [(tmp_path / f"{i}.png", "potato__healthy" if i % 2 else "potato__late_blight")
               for i in range(40)]  # fmt: skip
    first = limit_per_class(entries, 5, "pldd-up")
    assert first == limit_per_class(list(reversed(entries)), 5, "pldd-up")
    assert Counter(code for _, code in first) == {"potato__healthy": 5, "potato__late_blight": 5}
    assert first != limit_per_class(entries, 5, "other-source")  # the source name is in the seed
    assert sorted(limit_per_class(entries, 100, "pldd-up")) == sorted(entries)  # under the limit


def test_limit_per_class_applies_while_collecting(tmp_path):
    source = write_sources(
        tmp_path,
        "  s:\n" + COMMON + LOCAL + "    classes:\n      EB: potato__early_blight\n"
        + "    limit_per_class: 3\n",
    )[0]
    raw = tmp_path / "raw"
    for i in range(10):
        photo(raw / "EB" / f"{i}.png", (i * 20, 10, 10))
    kept = {i.original for i in collect(source, raw, random.Random(0))}
    assert len(kept) == 3
    assert kept == {i.original for i in collect(source, raw, random.Random(99))}


def coco_source(tmp_path, extra=""):
    return write_sources(
        tmp_path,
        "  fp:\n" + COMMON + LOCAL + "    loader: coco\n    classes:\n"
        + "      Corn_Healthy: corn__healthy\n      Tomato_Mosaic: tomato__mosaic_virus\n" + extra,
    )[0]


def write_coco(raw, boxes):
    part = raw / "train"
    photo(part / "leaf1_jpg.rf.abc123.jpg", (30, 120, 30), size=(400, 300))
    data = {
        "categories": [
            {"id": 1, "name": "Corn Healthy"},
            {"id": 2, "name": "Tomato_Mosaic"},
            {"id": 3, "name": "Tomato_Brown_Spots"},
        ],
        "images": [{"id": 7, "file_name": "leaf1_jpg.rf.abc123.jpg"}],
        "annotations": [
            {"id": i, "image_id": 7, "category_id": c, "bbox": box}
            for i, (c, box) in enumerate(boxes, start=1)
        ],
    }
    (part / "_annotations.coco.json").write_text(json.dumps(data))


def test_coco_boxes_become_crops_that_share_the_photo_as_their_origin(tmp_path):
    raw = tmp_path / "raw"
    write_coco(raw, [(1, [10, 10, 120, 100]), (2, [200, 50, 100, 120]),
                     (3, [0, 0, 150, 150]), (1, [300, 200, 20, 20])])  # fmt: skip
    items = collect_coco(coco_source(tmp_path), raw)
    assert sorted(i.code for i in items) == ["corn__healthy", "tomato__mosaic_virus"]
    assert {i.original for i in items} == {"train/leaf1_jpg.rf.abc123.jpg"}  # one photo
    for item in items:
        assert item.path.parent.parent == raw / "crops"
        with Image.open(item.path) as crop:
            assert crop.width >= 64 and crop.height >= 64
    keys = {splits.leaf_key("fieldplant", i.original) for i in items}
    assert keys == {"fieldplant:train/leaf1_jpg.jpg"}  # the Roboflow suffix is gone


def test_coco_crops_are_reused_and_respect_the_class_limit(tmp_path):
    raw = tmp_path / "raw"
    write_coco(raw, [(1, [10, 10, 120, 100]), (1, [150, 10, 120, 100]), (1, [10, 150, 120, 100])])
    source = coco_source(tmp_path, "    limit_per_class: 2\n")
    first = collect_coco(source, raw)
    assert len(first) == 2
    assert [i.path for i in first] == [i.path for i in collect_coco(source, raw)]


def item(tmp_path, name, source, role, color, code="potato__healthy"):
    path = tmp_path / f"{source}_{name}.png"
    photo(path, color)
    src = Source(
        name=source, kind="field", license="x", url="x", download={"type": "local"}, classes={},
        unknown=frozenset(), exclude=frozenset(), unknown_limit=None, role=role,
    )  # fmt: skip
    return Item(path, code, src, name, build_dataset._md5(path))


def test_bench_is_processed_first_so_a_shared_photo_stays_in_the_bench(tmp_path):
    train_copy = item(tmp_path, "a", "plantdoc", "train", (10, 200, 10))
    bench_copy = item(tmp_path, "b", "plantwild", "bench", (10, 200, 10))  # identical pixels
    own = item(tmp_path, "c", "pldd-up", "train", (200, 10, 10))
    removed: Counter = Counter()
    rows = build([train_copy, own, bench_copy], REGISTRY, tmp_path / "v2", removed)
    kept = {(r["source"], r["role"]) for r in rows}
    assert kept == {("plantwild", "bench"), ("pldd-up", "train")}
    assert removed == {("plantwild", "plantdoc"): 1}
    text = report(rows, REGISTRY, removed)
    assert "| plantwild | plantdoc | 1 |" in text
    assert "1 bench" in text and "| `potato__healthy` | 0 | 1 | 0 | 1 | 1 |" in text


def test_building_without_images_is_a_clear_error(tmp_path):
    with pytest.raises(ValueError, match="no images"):
        build([], REGISTRY, tmp_path / "v2")


def test_local_archives_are_unpacked_and_checked(tmp_path):
    source = write_sources(
        tmp_path,
        "  s:\n" + COMMON + "    download:\n      type: local\n      archives: [a.zip]\n",
    )[0]
    target = tmp_path / "raw" / "s"
    target.mkdir(parents=True)
    with pytest.raises(FileNotFoundError):
        _unpack_local(source, target)
    (target / "a.zip").write_bytes(b"half a download")
    with pytest.raises(ValueError, match="complete zip"):
        _unpack_local(source, target)
    with zipfile.ZipFile(target / "a.zip", "w") as z:
        z.writestr("EB/x.png", b"data")
    _unpack_local(source, target)
    assert (target / "EB" / "x.png").exists() and (target / "a.zip").exists()


def run_build_cli(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["build_dataset", *args])
    with pytest.raises(SystemExit):
        build_dataset.main()


def test_the_cli_never_rebuilds_v1_or_a_partial_v2(monkeypatch, tmp_path, capsys):
    (tmp_path / "v1").mkdir()
    run_build_cli(monkeypatch, "--skip-download", "--out-dir", str(tmp_path / "v1"))
    assert "frozen" in capsys.readouterr().err
    run_build_cli(monkeypatch, "--skip-download", "--sources", "plantdoc")
    assert "--out-dir" in capsys.readouterr().err


def test_bench_photos_form_their_own_split_and_leaky_train_photos_are_dropped():
    # groups: 0 = bench only, 1 = bench + a train copy (leak), 2 and 3 = train only
    groups = [0, 1, 1, 2, 2, 3, 3, 3]
    roles = ["bench", "bench", "train", "train", "train", "train", "train", "train"]
    strata = ["potato/field"] * 8
    parts = splits.split_with_bench(groups, strata, roles)
    assert parts[0] == parts[1] == "bench"
    assert parts[2] is None  # shares a group with a bench photo
    assert set(parts[3:]) <= {"train", "val", "test"}
    assert parts == splits.split_with_bench(groups, strata, roles)  # deterministic
    assert all(parts[i] != "bench" for i in range(2, 8))


def test_bench_overlap_counts_dropped_photos_by_source_pair(tmp_path):
    groups = [0, 0, 0, 1]
    roles = ["bench", "train", "train", "train"]
    sources = ["plantwild", "plantdoc", "pldd-up", "plantdoc"]
    dropped = splits.bench_overlap(groups, roles, sources)
    assert dropped == {("plantwild", "plantdoc"): 1, ("plantwild", "pldd-up"): 1}
    (tmp_path / "report.md").write_text("Registry v1.\n", encoding="utf-8")
    splits.write_overlap_report(tmp_path, dropped)
    splits.write_overlap_report(tmp_path, dropped)  # rewriting does not stack sections
    text = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert text.count(splits.REPORT_MARKER) == 1
    assert "| plantwild | plantdoc | 1 |" in text and "| **total** | | 2 |" in text
    splits.write_overlap_report(tmp_path, Counter())
    assert "None." in (tmp_path / "report.md").read_text(encoding="utf-8")


def test_splits_main_writes_a_bench_split_for_a_built_dataset(monkeypatch, tmp_path):
    out = tmp_path / "v2"
    train = [item(tmp_path, f"t{i}", "pldd-up", "train", (i * 9, 40, 40)) for i in range(20)]
    bench = [item(tmp_path, f"b{i}", "plantwild", "bench", (40, i * 9 + 3, 200)) for i in range(4)]
    build(train + bench, REGISTRY, out)
    monkeypatch.setattr(sys, "argv", ["splits", "--dataset-dir", str(out)])
    splits.main()
    with (out / "splits.csv").open(encoding="utf-8") as f:
        parts = Counter(r["split"] for r in csv.DictReader(f))
    assert parts["bench"] == 4 and parts["train"] + parts["val"] + parts["test"] <= 20
    assert "Train-pool photos dropped" in (out / "report.md").read_text(encoding="utf-8")
