"""Confidence calibration of a finished run (A7), from the logits that ``ml.evaluate`` saved.

``/predict`` shows the model's probability as its confidence and compares it with thresholds, so the
probability must mean what it says: of the answers given with 70 % confidence, about 70 % should be
right. A network trained with cross-entropy is usually overconfident. One number fixes most of it:
the *temperature* ``T`` that divides the logits before the softmax (the answer does not change,
only how sure the model says it is).

``T`` is fitted on the field photos of a split that looks like what the service will see (photos
from sources the model did not train on) and then *checked* on other splits, never fitted on
them. The numbers are computed on the answer as the service gives it: the crop's classes plus
``unknown``.

    python -m ml.calibrate ml/runs/A5-E001 --fit-on val_v2 --check test_v2 --check bench_v2
"""

import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np

from ml.evaluate import crop_masks, load_meta, mask_logits
from ml.registry import UNKNOWN, Registry, load_registry

ECE_BINS = 15
OK_THRESHOLDS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
MISMATCH_THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9]
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
    service could never answer them.
    """
    masked = _masked(logits, crops, classes, registry)
    reachable = np.isfinite(masked[np.arange(len(targets)), targets])
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


def risk_coverage(conf: np.ndarray, correct: np.ndarray, thresholds: list[float]) -> list[dict]:
    """For each threshold: how many answers reach it, and what share of those is right."""
    rows = []
    for threshold in thresholds:
        answered = conf >= threshold
        count = int(answered.sum())
        rows.append({
            "threshold": threshold, "answered": count, "share": count / len(conf),
            "accuracy": float(correct[answered].mean()) if count else None,
        })  # fmt: skip
    return rows


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


def _load(run_dir: Path, tag: str, domain: str, registry: Registry):
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


def calibrate_run(
    run_dir: Path,
    fit_tag: str = "val_v2",
    check_tags: list[str] | tuple[str, ...] = ("test_v2", "bench_v2"),
    domain: str = "field",
    registry: Registry | None = None,
    plots: bool = True,
) -> dict:
    """Fit ``T`` on ``fit_tag`` and report the effect on it and on every ``check_tags`` split."""
    registry = registry or load_registry()
    run_dir = Path(run_dir)
    logits, targets, crops, classes = _load(run_dir, fit_tag, domain, registry)
    temperature = fit_temperature(logits, targets, crops, classes, registry)
    result = {
        "run": json.loads((run_dir / "config.json").read_text(encoding="utf-8"))["id"]
        if (run_dir / "config.json").exists() else run_dir.name,
        "temperature": temperature,
        "fitted_on": {"tag": fit_tag, "domain": domain, "photos": int(len(targets))},
        "thresholds_checked": {"ok": OK_THRESHOLDS, "crop_mismatch": MISMATCH_THRESHOLDS},
        "checks": {},
        "scored_at": datetime.now().isoformat(timespec="seconds"),
    }  # fmt: skip
    for tag in (fit_tag, *check_tags):
        lg, tg, cr, cl = _load(run_dir, tag, domain, registry)
        before = product_probs(lg, cr, cl, registry)
        after = product_probs(lg, cr, cl, registry, temperature)
        correct = after.argmax(axis=1) == tg
        result["checks"][tag] = {
            "before": _metrics(before, tg),
            "after": _metrics(after, tg),
            "risk_coverage_before": risk_coverage(before.max(axis=1), correct, OK_THRESHOLDS),
            "risk_coverage_after": risk_coverage(after.max(axis=1), correct, OK_THRESHOLDS),
            "false_mismatch_before": false_mismatch_rate(lg, cr, cl, registry, MISMATCH_THRESHOLDS),
            "false_mismatch_after": false_mismatch_rate(
                lg, cr, cl, registry, MISMATCH_THRESHOLDS, temperature
            ),
            "reliability_after": reliability_bins(after.max(axis=1), correct.astype(float)),
        }
        if plots:
            _plot_reliability(
                run_dir / f"reliability_{tag}.png", result["run"], tag, before, after, tg
            )
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


if __name__ == "__main__":
    main()
