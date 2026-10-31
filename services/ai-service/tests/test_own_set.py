import csv
import hashlib
import json
from pathlib import Path

import pytest
from images import noise_image
from PIL import Image

from ml.own_set import MIN_SIDE, build_own, missing_required
from ml.registry import load_registry


def put(raw: Path, relative: str, seed: int = 0, size: tuple[int, int] = (400, 300)) -> Path:
    path = raw / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    noise_image(size, seed).save(path)
    return path


def rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_builds_a_dataset_the_evaluation_can_read(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    put(raw, "tomato__healthy/a.jpg", seed=1)
    put(raw, "wheat__septoria/b.png", seed=2)

    summary = build_own(raw, out)

    manifest = rows(out / "manifest.csv")
    assert {r["class"] for r in manifest} == {"tomato__healthy", "wheat__septoria"}
    assert {r["crop"] for r in manifest} == {"tomato", "wheat"}
    assert all((r["kind"], r["role"], r["source"]) == ("field", "bench", "own") for r in manifest)
    assert all((out / r["file"]).is_file() for r in manifest)
    splits = rows(out / "splits.csv")
    assert {r["split"] for r in splits} == {"bench"}
    index = json.loads((out / "class_index.json").read_text(encoding="utf-8"))
    assert index["classes"] == [c.code for c in load_registry().active()]
    assert summary["kept"] == 2
    assert summary["per_class"] == {"tomato__healthy": 1, "wheat__septoria": 1}


def test_md5_is_the_hash_of_the_original_bytes(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    original = put(raw, "tomato__healthy/a.jpg", seed=3)

    build_own(raw, out)

    assert rows(out / "manifest.csv")[0]["md5"] == hashlib.md5(original.read_bytes()).hexdigest()


def test_photos_of_one_leaf_share_a_group(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    put(raw, "tomato__healthy/a.jpg", seed=1)
    put(raw, "tomato__healthy/b.jpg", seed=2)
    put(raw, "tomato__healthy/c.jpg", seed=3)
    (raw / "meta.csv").write_text(
        "file,leaf,region,date,identified_by\n"
        "tomato__healthy/a.jpg,leaf-1,Almaty,2026-10-20,agronomist\n"
        "tomato__healthy/b.jpg,leaf-1,Almaty,2026-10-20,agronomist\n",
        encoding="utf-8",
    )

    build_own(raw, out)

    by_original = {r["original"]: r for r in rows(out / "meta.csv")}
    groups = {r["file"]: r["group"] for r in rows(out / "splits.csv")}
    manifest = {r["original"]: r["file"] for r in rows(out / "manifest.csv")}
    a, b, c = (groups[manifest[f"tomato__healthy/{n}.jpg"]] for n in "abc")
    assert a == b
    assert c not in {a, b}
    assert by_original["tomato__healthy/a.jpg"]["region"] == "Almaty"
    assert by_original["tomato__healthy/c.jpg"]["region"] == ""


def test_rejects_a_folder_that_is_not_a_class_code(tmp_path):
    raw = tmp_path / "raw"
    put(raw, "tomato_healthy/a.jpg")

    with pytest.raises(ValueError, match="tomato_healthy"):
        build_own(raw, tmp_path / "own")


def test_the_unknown_class_is_not_collected_by_hand(tmp_path):
    raw = tmp_path / "raw"
    put(raw, "unknown/a.jpg")

    with pytest.raises(ValueError, match="unknown"):
        build_own(raw, tmp_path / "own")


def test_drops_unreadable_small_and_duplicate_photos_and_says_why(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    put(raw, "tomato__healthy/ok.jpg", seed=1)
    (raw / "tomato__healthy").mkdir(exist_ok=True)
    (raw / "tomato__healthy" / "broken.jpg").write_bytes(b"not an image")
    put(raw, "tomato__healthy/tiny.jpg", seed=2, size=(MIN_SIDE - 1, 400))
    folder = raw / "tomato__healthy"
    (folder / "copy.jpg").write_bytes((folder / "ok.jpg").read_bytes())

    summary = build_own(raw, out)

    assert summary["kept"] == 1
    assert summary["dropped"] == {
        "unreadable": 1, "too_small": 1, "duplicate": 1, "train_overlap": 0,
    }  # fmt: skip


def test_leaves_out_photos_the_model_trained_on(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    seen = put(raw, "tomato__healthy/seen.jpg", seed=1)
    put(raw, "tomato__healthy/new.jpg", seed=2)
    train_md5 = {hashlib.md5(seen.read_bytes()).hexdigest()}

    summary = build_own(raw, out, exclude_md5=train_md5)

    assert summary["kept"] == 1
    assert summary["dropped"]["train_overlap"] == 1
    assert [r["original"] for r in rows(out / "manifest.csv")] == ["tomato__healthy/new.jpg"]


def test_strips_location_and_camera_data_but_keeps_the_orientation(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "own"
    image = noise_image((400, 300), seed=5)
    exif = Image.Exif()
    exif[0x010F] = "SomePhone"  # Make
    exif[0x0112] = 6  # rotated: the pixels must come out upright
    exif.get_ifd(0x8825)[1] = "N"  # a GPS entry
    path = raw / "tomato__healthy" / "gps.jpg"
    path.parent.mkdir(parents=True)
    image.save(path, exif=exif)

    build_own(raw, out)

    with Image.open(out / rows(out / "manifest.csv")[0]["file"]) as stored:
        assert not dict(stored.getexif())
        assert stored.size == (300, 400)  # turned upright, as the phone meant it


def test_reports_the_classes_the_lead_asked_to_collect(tmp_path):
    raw = tmp_path / "raw"
    put(raw, "tomato__healthy/a.jpg", seed=1)
    put(raw, "potato__healthy/a.jpg", seed=2)

    summary = build_own(raw, tmp_path / "own")

    assert missing_required(summary["per_class"]) == [
        "corn__healthy",
        "wheat__healthy",
        "tomato__early_blight",
    ]


def test_an_empty_folder_is_an_error(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()

    with pytest.raises(ValueError, match="no photos"):
        build_own(raw, tmp_path / "own")
