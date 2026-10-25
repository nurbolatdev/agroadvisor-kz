from collections.abc import Mapping
from dataclasses import dataclass

from app.models.predict import ClassScore
from app.services.model import validate_probabilities
from ml.registry import UNKNOWN, Registry

PREDICT_DIGITS = 4


@dataclass(frozen=True)
class Thresholds:
    ok: float
    low: float
    crop_mismatch: float


@dataclass(frozen=True)
class Decision:
    status: str
    top1: ClassScore
    top3: list[ClassScore]
    detected_crop: str | None


def decide(
    probs: Mapping[str, float], crop: str, registry: Registry, thresholds: Thresholds
) -> Decision:
    """Turn model probabilities into a status for the requested crop (contract: processing order,
    steps 4-5). `probs` is keyed by class code and must cover every active class."""
    active = registry.active()
    validate_probabilities(probs, [c.code for c in active])
    crop_of = {c.code: c.crop for c in active}

    # Step 4: the photo looks like another crop, judged on the unmasked output.
    best_overall = _best(probs)
    looks_like = crop_of[best_overall]
    mismatch = looks_like not in (None, crop) and probs[best_overall] >= thresholds.crop_mismatch

    # Step 5: keep the requested crop's classes plus unknown, renormalize.
    crop_codes = [c.code for c in registry.for_crop(crop)]
    masked = {code: probs[code] for code in (*crop_codes, UNKNOWN)}
    total = sum(masked.values())
    if total > 0:
        masked = {code: p / total for code, p in masked.items()}

    ranked = sorted(crop_codes, key=lambda code: (-masked[code], code))
    top3 = [_score(code, masked[code]) for code in ranked[:3]]
    if mismatch:
        return Decision("crop_mismatch", top3[0], top3, looks_like)

    best = _best(masked)
    confidence = masked[best]
    if best == UNKNOWN or confidence < thresholds.low:
        # "unknown" is reported with the probability of the unknown class itself.
        return Decision("unknown", _score(UNKNOWN, masked[UNKNOWN]), top3, None)
    status = "ok" if confidence >= thresholds.ok else "low_confidence"
    return Decision(status, _score(best, confidence), top3, None)


def _best(probs: Mapping[str, float]) -> str:
    return min(probs, key=lambda code: (-probs[code], code))


def _score(code: str, probability: float) -> ClassScore:
    return ClassScore(code=code, confidence=round(probability, PREDICT_DIGITS))
