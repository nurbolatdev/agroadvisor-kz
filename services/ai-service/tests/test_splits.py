import csv
import random
from collections import Counter

import pytest
from PIL import Image

from ml.splits import SPLIT_RATIOS, dhash, group_images, leaf_key, split_groups


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("x___GHLB Leaf 1 Day 1.JPG", "y___GHLB Leaf 1.1 Day 12.JPG"),
        ("x___GH_HL Leaf 259.1.JPG", "y___GH_HL Leaf 259.JPG"),
        ("x___R.S_HL 8315 copy 2.jpg", "y___R.S_HL 8315 copy.jpg"),
    ],
)
def test_shots_of_one_leaf_share_a_key(first, second):
    folder = "raw/color/Tomato___Late_blight/"
    assert leaf_key("plantvillage", folder + first) == leaf_key("plantvillage", folder + second)


def test_different_leaves_and_sources_get_different_keys():
    folder = "raw/color/Tomato___Late_blight/"
    assert leaf_key("plantvillage", folder + "a___GHLB Leaf 1 Day 1.JPG") != leaf_key(
        "plantvillage", folder + "b___GHLB Leaf 12 Day 1.JPG"
    )
    assert leaf_key("plantdoc", "train/a/1.jpg") != leaf_key("plantdoc", "train/a/2.jpg")


def noise_image(seed):
    rng = random.Random(seed)
    image = Image.new("L", (16, 16))
    image.putdata([rng.randrange(256) for _ in range(256)])
    return image.resize((64, 64)).convert("RGB")


def test_dhash_matches_resized_copy(tmp_path):
    image = noise_image(1)
    image.save(tmp_path / "a.png")
    image.resize((200, 200)).save(tmp_path / "b.jpg", quality=80)
    noise_image(2).save(tmp_path / "c.png")

    a, b, c = (dhash(tmp_path / n) for n in ("a.png", "b.jpg", "c.png"))
    assert (a ^ b).bit_count() <= 4
    assert (a ^ c).bit_count() > 4


def test_group_images_joins_keys_and_close_hashes_within_class():
    keys = ["k1", "k1", "k2", "k3", "k4"]
    classes = ["a", "a", "a", "a", "b"]
    hashes = [0, 0b1111_0000, 0b1, 0xFFFF_FFFF, 0b1]

    groups = group_images(keys, classes, hashes)

    assert groups[0] == groups[1]  # same key
    assert groups[2] == groups[0]  # hash 1 bit away from image 0
    assert groups[3] != groups[0]  # far hash
    assert groups[4] != groups[2]  # close hash but another class


def synthetic(n_groups=400, seed=1):
    rng = random.Random(seed)
    groups, strata = [], []
    for g in range(n_groups):
        stratum = rng.choice(["a/lab", "a/field", "b/lab", "c/field"])
        for _ in range(rng.randint(1, 5)):
            groups.append(g)
            strata.append(stratum)
    return groups, strata


def test_splits_do_not_share_groups():
    groups, strata = synthetic()
    parts = split_groups(groups, strata)

    owner: dict[int, set[str]] = {}
    for g, p in zip(groups, parts, strict=True):
        owner.setdefault(g, set()).add(p)
    assert all(len(p) == 1 for p in owner.values())


def test_split_ratios_hold_within_each_stratum():
    groups, strata = synthetic()
    parts = split_groups(groups, strata)

    for stratum in set(strata):
        counts = Counter(p for s, p in zip(strata, parts, strict=True) if s == stratum)
        total = sum(counts.values())
        for part, ratio in SPLIT_RATIOS.items():
            assert counts[part] / total == pytest.approx(ratio, abs=0.05)


def test_split_is_reproducible():
    groups, strata = synthetic()
    assert split_groups(groups, strata, seed=7) == split_groups(groups, strata, seed=7)
    assert split_groups(groups, strata, seed=7) != split_groups(groups, strata, seed=8)


def test_built_dataset_splits_do_not_overlap(tmp_path):
    """Checks the real splits.csv when the dataset has been built locally."""
    from ml.build_dataset import DATASETS_DIR

    path = DATASETS_DIR / "v1" / "splits.csv"
    if not path.exists():
        pytest.skip("dataset not built")
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    files = {p: {r["file"] for r in rows if r["split"] == p} for p in SPLIT_RATIOS}
    groups = {p: {r["group"] for r in rows if r["split"] == p} for p in SPLIT_RATIOS}
    for a, b in [("train", "val"), ("train", "test"), ("val", "test")]:
        assert not files[a] & files[b]
        assert not groups[a] & groups[b]
    classes = {r["class"] for r in rows}
    for part in SPLIT_RATIOS:
        assert {r["class"] for r in rows if r["split"] == part} == classes
