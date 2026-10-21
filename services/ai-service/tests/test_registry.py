import pytest

from ml.registry import RegistryError, load_registry

VALID = """
version: 1
crops:
  - code: tomato
    names: { ru: Томат, kk: Қызанақ, en: Tomato }
classes:
  - code: tomato__late_blight
    crop: tomato
    names: { ru: Фитофтороз, kk: Фитофтороз, en: Late blight }
    status: active
    added_in: 1
  - code: tomato__leaf_curl
    crop: tomato
    names: { ru: Курчавость, kk: Бұйралану, en: Leaf curl }
    status: planned
    added_in: 1
  - code: unknown
    crop: null
    names: { ru: Не распознано, kk: Анықталмады, en: Not recognized }
    status: active
    added_in: 1
"""


def write(tmp_path, text):
    path = tmp_path / "classes.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def test_project_registry_is_valid():
    registry = load_registry()

    assert registry.version >= 1
    assert registry.get("unknown").crop is None
    for crop in registry.crops:
        assert registry.for_crop(crop.code), f"{crop.code} has no active classes"


def test_active_and_for_crop_skip_planned_and_unknown(tmp_path):
    registry = load_registry(write(tmp_path, VALID))

    assert [c.code for c in registry.active()] == ["tomato__late_blight", "unknown"]
    assert [c.code for c in registry.for_crop("tomato")] == ["tomato__late_blight"]


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("code: tomato__leaf_curl", "code: tomato__late_blight"),
        ("code: tomato__leaf_curl", "code: potato__leaf_curl"),
        ("crop: tomato\n    names: { ru: Курчавость", "crop: corn\n    names: { ru: Курчавость"),
        ("status: planned", "status: removed"),
        ("kk: Бұйралану, ", ""),
        ("crop: null", "crop: tomato"),
    ],
    ids=[
        "duplicate",
        "wrong-prefix",
        "unknown-crop",
        "bad-status",
        "missing-name",
        "unknown-crop-set",
    ],
)
def test_invalid_registry_is_rejected(tmp_path, old, new):
    with pytest.raises(RegistryError):
        load_registry(write(tmp_path, VALID.replace(old, new)))
