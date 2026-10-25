import pytest

from app.services.model import ModelOutputError
from app.services.predict import Thresholds, decide
from ml.registry import UNKNOWN, load_registry

REGISTRY = load_registry()
CODES = [c.code for c in REGISTRY.active()]
THRESHOLDS = Thresholds(ok=0.70, low=0.40, crop_mismatch=0.70)


def probs_for(crop: str, main: dict[str, float], **other: float) -> dict[str, float]:
    """Probabilities where `main` is given, the rest of the mass goes to the crop's other
    classes and unknown, and `other` (code -> p) sits on classes outside the crop."""
    crop_codes = [c.code for c in REGISTRY.for_crop(crop)] + [UNKNOWN]
    others = {code.replace("-", "__"): p for code, p in other.items()}
    result = dict.fromkeys(CODES, 0.0)
    result.update(others)
    result.update(main)
    leftover = 1.0 - sum(result.values())
    free = [c for c in crop_codes if c not in main]
    for code in free:
        result[code] += leftover / len(free)
    return result


def test_ok_when_top1_reaches_ok_threshold():
    probs = probs_for("tomato", {"tomato__late_blight": 0.91, "tomato__early_blight": 0.05})

    decision = decide(probs, "tomato", REGISTRY, THRESHOLDS)

    assert decision.status == "ok"
    assert decision.top1.code == "tomato__late_blight"
    assert decision.top1.confidence == 0.91
    assert [s.code for s in decision.top3][:2] == ["tomato__late_blight", "tomato__early_blight"]
    assert decision.detected_crop is None


def test_low_confidence_between_thresholds():
    probs = probs_for("wheat", {"wheat__leaf_rust": 0.56, "wheat__stripe_rust": 0.31})

    decision = decide(probs, "wheat", REGISTRY, THRESHOLDS)

    assert decision.status == "low_confidence"
    assert decision.top1.code == "wheat__leaf_rust"
    assert [s.code for s in decision.top3] == [
        "wheat__leaf_rust",
        "wheat__stripe_rust",
        decision.top3[2].code,
    ]


def test_unknown_when_top_class_is_unknown():
    probs = probs_for("potato", {UNKNOWN: 0.62, "potato__early_blight": 0.21})

    decision = decide(probs, "potato", REGISTRY, THRESHOLDS)

    assert decision.status == "unknown"
    assert decision.top1.code == UNKNOWN
    assert decision.top1.confidence == 0.62
    assert UNKNOWN not in [s.code for s in decision.top3]
    assert decision.top3[0].code == "potato__early_blight"


def test_unknown_when_best_disease_is_below_low_threshold():
    probs = probs_for("tomato", {"tomato__late_blight": 0.30, UNKNOWN: 0.10})

    decision = decide(probs, "tomato", REGISTRY, THRESHOLDS)

    assert decision.status == "unknown"
    assert decision.top1.code == UNKNOWN
    # Reported with the unknown class's own probability.
    assert decision.top1.confidence == 0.10
    assert decision.top3[0].code == "tomato__late_blight"


@pytest.mark.parametrize(
    ("top", "expected"),
    [(0.70, "ok"), (0.6999, "low_confidence"), (0.40, "low_confidence"), (0.3999, "unknown")],
)
def test_thresholds_are_inclusive_at_the_lower_edge(top, expected):
    # The rest of the mass is spread over the other corn classes and unknown, so the top stays top.
    probs = probs_for("corn", {"corn__common_rust": top})

    assert decide(probs, "corn", REGISTRY, THRESHOLDS).status == expected


def test_crop_mismatch_when_other_crop_dominates():
    probs = probs_for("potato", {"tomato__late_blight": 0.80}, **{"tomato__early_blight": 0.05})

    decision = decide(probs, "potato", REGISTRY, THRESHOLDS)

    assert decision.status == "crop_mismatch"
    assert decision.detected_crop == "tomato"
    assert decision.top1.code.startswith("potato__")
    assert all(s.code.startswith("potato__") for s in decision.top3)


def test_crop_mismatch_threshold_is_inclusive():
    at_edge = probs_for("potato", {"tomato__late_blight": 0.70})
    below = probs_for("potato", {"tomato__late_blight": 0.69})

    assert decide(at_edge, "potato", REGISTRY, THRESHOLDS).status == "crop_mismatch"
    assert decide(below, "potato", REGISTRY, THRESHOLDS).status != "crop_mismatch"


def test_below_mismatch_threshold_the_masked_distribution_is_renormalized():
    # 0.60 sits on another crop (below the mismatch threshold); 0.40 is left for potato.
    probs = dict.fromkeys(CODES, 0.0)
    probs["tomato__late_blight"] = 0.60
    probs["potato__late_blight"] = 0.24
    probs["potato__early_blight"] = 0.16

    decision = decide(probs, "potato", REGISTRY, THRESHOLDS)

    assert decision.status == "low_confidence"
    assert decision.top1.code == "potato__late_blight"
    assert decision.top1.confidence == 0.6  # 0.24 / (0.24 + 0.16)
    assert decision.top3[1].confidence == 0.4
    assert decision.detected_crop is None


def test_unknown_is_never_a_crop_mismatch():
    probs = probs_for("potato", {UNKNOWN: 0.95})

    decision = decide(probs, "potato", REGISTRY, THRESHOLDS)

    assert decision.status == "unknown"
    assert decision.detected_crop is None


def test_all_mass_on_other_crops_is_unknown_with_zero_confidence():
    probs = dict.fromkeys(CODES, 0.0)
    probs["tomato__late_blight"] = 0.5
    probs["wheat__leaf_rust"] = 0.5

    decision = decide(probs, "potato", REGISTRY, THRESHOLDS)

    assert decision.status == "unknown"
    assert decision.top1.confidence == 0.0


@pytest.mark.parametrize(("crop", "classes"), [("potato", 3), ("tomato", 3), ("wheat", 3)])
def test_top3_has_at_most_three_sorted_classes_without_unknown(crop, classes):
    probs = probs_for(crop, {})

    top3 = decide(probs, crop, REGISTRY, THRESHOLDS).top3

    assert len(top3) == classes
    assert UNKNOWN not in [s.code for s in top3]
    confidences = [s.confidence for s in top3]
    assert confidences == sorted(confidences, reverse=True)


def test_ties_are_broken_by_class_code():
    probs = probs_for("tomato", {})

    first = decide(probs, "tomato", REGISTRY, THRESHOLDS)
    second = decide(dict(reversed(list(probs.items()))), "tomato", REGISTRY, THRESHOLDS)

    assert first == second


def test_probabilities_must_match_the_registry():
    probs = probs_for("tomato", {})
    del probs["wheat__healthy"]

    with pytest.raises(ModelOutputError):
        decide(probs, "tomato", REGISTRY, THRESHOLDS)
