"""Confidence calibration of a finished run (A7), from the logits that ``ml.evaluate`` saved.

``/predict`` shows the model's probability as its confidence and compares it with thresholds, so the
probability must mean what it says: of the answers given with 70 % confidence, about 70 % should be
right. A network trained with cross-entropy is usually overconfident. One number fixes most of it:
the *temperature* ``T`` that divides the logits before the softmax (the answer does not change,
only how sure the model says it is).

``T`` is fitted on the field photos of a split that the model did not train on and then *checked* on
other splits, never fitted on them. Statuses (``ok``, ``low_confidence``, ``unknown``,
``crop_mismatch``) are computed by ``decide_statuses``, a vectorized copy of
``app.services.predict.decide`` that a test compares with the real one.

    python -m ml.calibrate ml/runs/A5-E001 --fit-on val_v2 --check test_v2 --check bench_v2
"""

import argparse
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np

from ml.evaluate import crop_masks, load_meta, mask_logits
from ml.registry import UNKNOWN, Registry, load_registry

ECE_BINS = 15
STATUSES = ("ok", "low_confidence", "unknown", "crop_mismatch")
STATUS_GRID = [(ok, low) for ok in (0.6, 0.7, 0.8, 0.9) for low in (0.25, 0.4)]
LOW_THRESHOLDS = [0.25, 0.4]  # below this the answer is "not recognized"
MISMATCH_THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9]
UNKNOWN_LEVELS = (None, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)  # None: unknown whenever it wins (today)
RULE_OK, RULE_LOW, RULE_MISMATCH = 0.70, 0.25, 0.70  # the thresholds the unknown rule is tried at
TEMPERATURE_RANGE = (0.2, 20.0)


def _masked(logits: np.ndarray, crops: list, classes: list[str], registry: Registry) -> np.ndarray:
    if any(c is None for c in crops):
        raise ValueError("every photo needs a crop to be answered as the service does")
    masks = crop_masks(classes, registry)
    return mask_logits(logits, list(crops), masks, (classes.index(UNKNOWN),))


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)  # -inf stays -inf and gives 0
    p = np.exp(shifted)
    return p / p.sum(axis=1, keepdims=True)


def product_probs(
    logits: np.ndarray,
    crops: list,
    classes: list[str],
    registry: Registry,
    temperature: float = 1.0,
) -> np.ndarray:
    """Probabilities as ``/predict`` renormalizes them.

    Only the selected crop's classes and ``unknown`` can be answered; the rest get 0 and each row
    sums to 1.
    """
    return _softmax(_masked(logits, crops, classes, registry) / temperature)


def _nll(masked: np.ndarray, targets: np.ndarray, temperature: float) -> float:
    scaled = masked / temperature
    top = scaled.max(axis=1, keepdims=True)
    log_norm = np.log(np.exp(scaled - top).sum(axis=1)) + top[:, 0]
    return float((log_norm - scaled[np.arange(len(targets)), targets]).mean())


def fit_temperature(
    logits: np.ndarray, targets: np.ndarray, crops: list, classes: list[str], registry: Registry
) -> float:
    """The ``T`` that minimizes the negative log-likelihood of the answer (golden-section search).

    Photos whose true class is outside the selected crop (a wrong label) are skipped: the
    service could never answer them. Without any photo left there is nothing to fit.
    """
    if len(targets) == 0:
        raise ValueError("no photos to fit the temperature on")
    masked = _masked(logits, crops, classes, registry)
    reachable = np.isfinite(masked[np.arange(len(targets)), targets])
    if not reachable.any():
        raise ValueError("no photos to fit the temperature on: every label is outside its crop")
    masked, targets = masked[reachable], targets[reachable]
    low, high = np.log(TEMPERATURE_RANGE[0]), np.log(TEMPERATURE_RANGE[1])
    phi = (np.sqrt(5) - 1) / 2
    a, b = high - phi * (high - low), low + phi * (high - low)
    fa, fb = _nll(masked, targets, np.exp(a)), _nll(masked, targets, np.exp(b))
    for _ in range(80):
        if fa < fb:
            high, b, fb = b, a, fa
            a = high - phi * (high - low)
            fa = _nll(masked, targets, np.exp(a))
        else:
            low, a, fa = a, b, fb
            b = low + phi * (high - low)
            fb = _nll(masked, targets, np.exp(b))
    return float(np.exp((low + high) / 2))


def reliability_bins(conf: np.ndarray, correct: np.ndarray, bins: int = ECE_BINS) -> list[dict]:
    """Equal-width bins of confidence: how many photos, the mean confidence, the share right."""
    edges = np.linspace(0, 1, bins + 1)
    rows = []
    for low, high in zip(edges[:-1], edges[1:], strict=True):
        sel = (conf > low) & (conf <= high)
        rows.append({
            "low": float(low), "high": float(high), "photos": int(sel.sum()),
            "confidence": float(conf[sel].mean()) if sel.any() else None,
            "accuracy": float(correct[sel].mean()) if sel.any() else None,
        })  # fmt: skip
    return rows


def ece(conf: np.ndarray, correct: np.ndarray, bins: int = ECE_BINS) -> float:
    """Expected calibration error: the average gap between confidence and accuracy per bin."""
    total = 0.0
    for row in reliability_bins(conf, np.asarray(correct, dtype=float), bins):
        if row["photos"]:
            total += row["photos"] / len(conf) * abs(row["accuracy"] - row["confidence"])
    return float(total)


@dataclass(frozen=True)
class Decisions:
    """What the service answers for each photo: status, best class, its probability, top three."""

    status: np.ndarray
    answer: np.ndarray
    confidence: np.ndarray
    top3: np.ndarray  # the crop's three best classes (``unknown`` excluded), as ``decide`` shows


def decide_statuses(
    logits: np.ndarray,
    crops: list,
    classes: list[str],
    registry: Registry,
    temperature: float = 1.0,
    ok: float = 0.70,
    low: float = 0.40,
    mismatch: float = 0.70,
    unknown_at: float | None = None,
) -> Decisions:
    """A vectorized copy of ``app.services.predict.decide`` (a test compares the two).

    With ``unknown_at`` the rule for ``unknown`` changes: the photo is "not recognized" only when
    the probability of ``unknown`` is at least that, instead of whenever ``unknown`` wins; the
    answer is then the crop's best class. This is a proposal to try, not what the service does.
    """
    n = len(logits)
    probs = _softmax(logits / temperature)
    crop_arr = np.array(crops)
    crop_of = np.array([registry.get(code).crop or "" for code in classes])
    looks_like = crop_of[probs.argmax(axis=1)]
    crop_mismatch = (looks_like != "") & (looks_like != crop_arr) & (probs.max(axis=1) >= mismatch)

    masked = product_probs(logits, crops, classes, registry, temperature)
    unknown = classes.index(UNKNOWN)
    crop_only = masked.copy()
    crop_only[:, unknown] = -1.0
    top3 = np.argsort(-crop_only, axis=1, kind="stable")[:, :3]
    if unknown_at is None:
        answer = masked.argmax(axis=1)
        not_recognized = answer == unknown
    else:
        answer = crop_only.argmax(axis=1)
        not_recognized = masked[:, unknown] >= unknown_at
    confidence = masked[np.arange(n), answer]
    status = np.where(
        crop_mismatch,
        "crop_mismatch",
        np.where(
            not_recognized | (confidence < low),
            "unknown",
            np.where(confidence >= ok, "ok", "low_confidence"),
        ),
    )
    return Decisions(status, answer, confidence, top3)


def status_summary(decisions: Decisions, targets: np.ndarray) -> dict:
    """Shares of each status, how often an answer is right, and what "not recognized" loses.

    ``right_of_all`` is the share of all photos that got an answer (``ok`` or ``low_confidence``)
    and the right one; a photo answered "not recognized" is a miss, not a wrong answer.
    ``unknown_top3_right`` is the share of "not recognized" photos whose right class is still in
    the top three the app shows.
    """
    status, answer = decisions.status, decisions.answer
    right = answer == targets

    def accuracy(name: str):
        sel = status == name
        return float(right[sel].mean()) if sel.any() else None

    answered = np.isin(status, ("ok", "low_confidence"))
    rejected = status == "unknown"
    top3_right = (decisions.top3[rejected] == targets[rejected][:, None]).any(axis=1)
    return {
        "photos": int(len(targets)),
        "shares": {name: float((status == name).mean()) for name in STATUSES},
        "ok_accuracy": accuracy("ok"),
        "low_confidence_accuracy": accuracy("low_confidence"),
        "right_of_all": float((answered & right).mean()),
        "unknown_top3_right": float(top3_right.mean()) if rejected.any() else None,
    }


def false_mismatch_rate(
    logits: np.ndarray,
    crops: list,
    classes: list[str],
    registry: Registry,
    thresholds: list[float],
    temperature: float = 1.0,
) -> list[dict]:
    """How often the service says "this looks like another crop" for a photo of the selected one.

    The farmer picked the crop, so every such answer on a correctly labelled photo is a false
    alarm. The check is made on the unmasked output, as ``decide`` does.
    """
    probs = _softmax(logits / temperature)
    best = probs.argmax(axis=1)
    crop_of = [registry.get(code).crop for code in classes]
    other_crop = np.array([crop_of[b] not in (None, c) for b, c in zip(best, crops, strict=True)])
    top = probs.max(axis=1)
    return [
        {
            "threshold": t, "photos": len(best), "mismatches": int((other_crop & (top >= t)).sum()),
            "rate": float((other_crop & (top >= t)).sum() / len(best)),
        }
        for t in thresholds
    ]  # fmt: skip


def unknown_rejection(
    logits: np.ndarray,
    classes: list[str],
    registry: Registry,
    low: float,
    temperature: float = 1.0,
    ok: float = 0.70,
    mismatch: float = 0.70,
    unknown_at: float | None = None,
) -> dict[str, dict[str, float]]:
    """Statuses of photos of no known class, once for every crop the farmer could pick.

    "Not recognized" (``unknown``) is the right answer here; ``ok``, ``low_confidence`` and
    ``crop_mismatch`` are all wrong answers for such a photo.
    """
    out = {}
    for crop in sorted(crop_masks(classes, registry)):
        got = decide_statuses(
            logits, [crop] * len(logits), classes, registry, temperature, ok, low, mismatch,
            unknown_at,
        )  # fmt: skip
        out[crop] = {name: float((got.status == name).mean()) for name in STATUSES}
    return out


def _unknown_rule_rows(
    crop_logits: np.ndarray,
    crop_names: list,
    crop_targets: np.ndarray,
    other_logits: np.ndarray,
    classes: list[str],
    registry: Registry,
    temperature: float,
) -> list[dict]:
    """Try each level of the ``unknown`` rule: false rejections of crop photos against true ones."""
    rows = []
    for level in UNKNOWN_LEVELS:
        got = decide_statuses(
            crop_logits, crop_names, classes, registry, temperature,
            RULE_OK, RULE_LOW, RULE_MISMATCH, level,
        )  # fmt: skip
        summary = status_summary(got, crop_targets)
        rejected = None
        if len(other_logits):
            by_crop = unknown_rejection(
                other_logits, classes, registry, RULE_LOW, temperature,
                RULE_OK, RULE_MISMATCH, level,
            )  # fmt: skip
            rejected = float(np.mean([shares["unknown"] for shares in by_crop.values()]))
        rows.append({
            "unknown_at": "argmax" if level is None else level,
            "crop_photos_unknown": summary["shares"]["unknown"],
            "right_of_all": summary["right_of_all"],
            "non_plant_rejected": rejected,
        })  # fmt: skip
    return rows


def _unknown_photos(run_dir: Path, tag: str) -> tuple[np.ndarray, list[str]]:
    """Saved logits of the photos whose true class is ``unknown`` (any domain), and the classes."""
    saved = np.load(run_dir / f"logits_{tag}.npz")
    classes = json.loads((run_dir / "class_index.json").read_text(encoding="utf-8"))["classes"]
    keep = saved["targets"] == classes.index(UNKNOWN)
    return saved["logits"].astype(np.float64)[keep], classes


def _metrics(probs: np.ndarray, targets: np.ndarray) -> dict:
    conf, answer = probs.max(axis=1), probs.argmax(axis=1)
    correct = answer == targets
    picked = np.clip(probs[np.arange(len(targets)), targets], 1e-12, None)
    return {
        "photos": int(len(targets)),
        "accuracy": float(correct.mean()),
        "mean_confidence": float(conf.mean()),
        "ece": ece(conf, correct),
        "nll": float(-np.log(picked).mean()),
    }


def _load(run_dir: Path, tag: str, domain: str):
    """Saved logits of a split, reduced to the photos of one domain that have a crop."""
    saved = np.load(run_dir / f"logits_{tag}.npz")
    classes = json.loads((run_dir / "class_index.json").read_text(encoding="utf-8"))["classes"]
    files = saved["files"].tolist()
    crops, kinds = load_meta(Path(str(saved["dataset_dir"])), files)
    keep = np.array([c is not None and k == domain for c, k in zip(crops, kinds, strict=True)])
    return (
        saved["logits"].astype(np.float64)[keep],
        saved["targets"][keep],
        [c for c, k in zip(crops, keep, strict=True) if k],
        classes,
    )


def _grid_key(ok: float, low: float) -> str:
    return f"ok={ok},low={low}"


def calibrate_run(
    run_dir: Path,
    fit_tag: str = "val_v2",
    check_tags: list[str] | tuple[str, ...] = ("test_v2", "bench_v2"),
    domain: str = "field",
    registry: Registry | None = None,
    plots: bool = True,
) -> dict:
    """Fit ``T`` on ``fit_tag`` and report the effect on it and on every ``check_tags`` split."""
    from ml.train import git_info

    registry = registry or load_registry()
    run_dir = Path(run_dir)
    logits, targets, crops, classes = _load(run_dir, fit_tag, domain)
    temperature = fit_temperature(logits, targets, crops, classes, registry)
    git = git_info()
    config = run_dir / "config.json"
    result = {
        "run": json.loads(config.read_text(encoding="utf-8"))["id"] if config.exists()
        else run_dir.name,
        "temperature": temperature,
        "fitted_on": {"tag": fit_tag, "domain": domain, "photos": int(len(targets))},
        "thresholds_checked": {
            "status_grid": [_grid_key(ok, low) for ok, low in STATUS_GRID],
            "low": LOW_THRESHOLDS, "crop_mismatch": MISMATCH_THRESHOLDS,
            "unknown_levels": ["argmax" if u is None else u for u in UNKNOWN_LEVELS],
        },
        "checks": {},
        "non_plant": {},
        "scored_with": {
            "git_commit": git["git_commit"],
            "git_dirty": git["git_dirty"],
            "scored_at": datetime.now().isoformat(timespec="seconds"),
        },
    }  # fmt: skip
    for tag in (fit_tag, *check_tags):
        lg, tg, cr, cl = _load(run_dir, tag, domain)
        others, _ = _unknown_photos(run_dir, tag)
        before = product_probs(lg, cr, cl, registry)
        after = product_probs(lg, cr, cl, registry, temperature)
        status = {"before": {}, "after": {}}
        for ok, low in STATUS_GRID:
            for name, t in (("before", 1.0), ("after", temperature)):
                got = decide_statuses(lg, cr, cl, registry, t, ok, low)
                status[name][_grid_key(ok, low)] = status_summary(got, tg)
        result["checks"][tag] = {
            "before": _metrics(before, tg),
            "after": _metrics(after, tg),
            "status_before": status["before"],
            "status_after": status["after"],
            "false_mismatch_before": false_mismatch_rate(lg, cr, cl, registry, MISMATCH_THRESHOLDS),
            "false_mismatch_after": false_mismatch_rate(
                lg, cr, cl, registry, MISMATCH_THRESHOLDS, temperature
            ),
            "unknown_rule": _unknown_rule_rows(lg, cr, tg, others, cl, registry, temperature),
            "reliability_after": reliability_bins(
                after.max(axis=1), (after.argmax(axis=1) == tg).astype(float)
            ),
        }
        if plots:
            _plot_reliability(
                run_dir / f"reliability_{tag}.png", result["run"], tag, before, after, tg
            )
        if len(others):  # not every split has them (bench has none)
            result["non_plant"][tag] = {
                "photos": int(len(others)),
                "before": {
                    str(low): unknown_rejection(others, cl, registry, low) for low in LOW_THRESHOLDS
                },
                "after": {
                    str(low): unknown_rejection(others, cl, registry, low, temperature)
                    for low in LOW_THRESHOLDS
                },
            }
    (run_dir / "calibration.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return result


def _plot_reliability(out: Path, run: str, tag: str, before, after, targets) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], color="grey", linestyle=":", label="perfect")
    for name, probs in (("before", before), ("after", after)):
        correct = (probs.argmax(axis=1) == targets).astype(float)
        rows = [r for r in reliability_bins(probs.max(axis=1), correct) if r["photos"]]
        ax.plot([r["confidence"] for r in rows], [r["accuracy"] for r in rows], marker="o",
                label=f"{name} (ECE {ece(probs.max(axis=1), correct):.3f})")  # fmt: skip
    ax.set(title=f"{run} — {tag} (field)", xlabel="confidence", ylabel="share right",
           xlim=(0, 1), ylim=(0, 1))  # fmt: skip
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fit and check the temperature of a run")
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--fit-on", default="val_v2", help="logits tag to fit on (field photos)")
    parser.add_argument("--check", action="append", default=None, help="logits tag to check on")
    parser.add_argument("--domain", default="field")
    args = parser.parse_args()
    result = calibrate_run(
        args.run_dir, args.fit_on, args.check or ["test_v2", "bench_v2"], args.domain
    )
    fitted = result["fitted_on"]
    print(f"{result['run']}: T = {result['temperature']:.3f} "
          f"(fitted on {fitted['photos']} {args.domain} photos of {args.fit_on})")  # fmt: skip
    for tag, check in result["checks"].items():
        b, a = check["before"], check["after"]
        print(f"  {tag:10s} ECE {b['ece']:.3f} -> {a['ece']:.3f}   "
              f"NLL {b['nll']:.3f} -> {a['nll']:.3f}   accuracy {a['accuracy']:.3f}")  # fmt: skip
        now = check["status_after"][_grid_key(0.7, 0.25)]["shares"]
        print("    statuses at ok 0.7, low 0.25: "
              + ", ".join(f"{name} {share:.3f}" for name, share in now.items()))  # fmt: skip
    for tag, info in result["non_plant"].items():
        for low, by_crop in info["after"].items():
            shares = ", ".join(f"{crop} {s['unknown']:.3f}" for crop, s in by_crop.items())
            print(f"  {tag}: {info['photos']} non-plant photos \"not recognized\" at low {low}: "
                  f"{shares}")  # fmt: skip


if __name__ == "__main__":
    main()
