import pytest

from ml.data_sources import SourceConfigError, coverage, load_sources, normalize
from ml.registry import load_registry


@pytest.fixture(scope="module")
def registry():
    return load_registry()


@pytest.mark.parametrize(
    ("folder", "expected"),
    [
        ("Brown Rust", "brown_rust"),
        ("brown_rust_test", "brown_rust"),
        ("Tomato___Late_blight", "tomato___late_blight"),
        ("Bell_pepper leaf-spot", "bell_pepper_leaf_spot"),
    ],
)
def test_normalize(folder, expected):
    assert normalize(folder) == expected


def test_project_sources_cover_every_active_class(registry):
    sources = load_sources(registry)

    missing = [code for code, names in coverage(sources, registry).items() if not names]
    assert missing == []


def test_project_sources_label_real_folder_names(registry):
    sources = {s.name: s for s in load_sources(registry)}

    assert sources["wheat_kaggle"].label("Brown Rust") == "wheat__leaf_rust"
    assert sources["wheat_kaggle"].label("yellow_rust_test") == "wheat__stripe_rust"
    assert sources["wheat_kaggle"].label("Smut") is None
    assert sources["plantdoc"].label("Tomato leaf") == "tomato__healthy"
    assert sources["plantdoc"].label("grape leaf") == "unknown"
    assert sources["plantvillage"].label("Tomato___Target_Spot") is None
    assert sources["caltech101"].label("airplanes") == "unknown"
    assert sources["caltech101"].label("sunflower") is None


SOURCES = """
version: 1
sources:
  demo:
    kind: field
    license: CC0 1.0
    url: https://example.com
    download: {type: url, url: https://example.com/demo.zip}
    classes:
      Late blight: tomato__late_blight
    unknown: [Apple]
    unknown_limit: 10
"""


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("tomato__late_blight", "tomato__no_such_class"),
        ("kind: field", "kind: synthetic"),
        ("    unknown_limit: 10\n", ""),
        ("unknown: [Apple]", "unknown: [Late blight]"),
    ],
    ids=["unknown-code", "bad-kind", "no-unknown-limit", "folder-in-both"],
)
def test_invalid_sources_are_rejected(tmp_path, registry, old, new):
    path = tmp_path / "data_sources.yaml"
    path.write_text(SOURCES.replace(old, new), encoding="utf-8")

    with pytest.raises(SourceConfigError):
        load_sources(registry, path)
