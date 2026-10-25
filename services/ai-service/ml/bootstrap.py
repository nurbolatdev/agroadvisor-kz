"""Bootstrap 95 % confidence intervals for macro-F1.

Photos are resampled with replacement inside a slice (e.g. field photos of tomato). The seed is
fixed per slice name, so adding a slice does not change the others. Photos of one leaf are
treated as independent, so the intervals are a little narrower than the real uncertainty.
"""

import zlib

import numpy as np


def macro_f1(targets: np.ndarray, preds: np.ndarray, n_classes: int) -> float:
    """Macro-F1 over the classes present in ``targets`` (same rule as the reported metrics)."""
    if len(targets) == 0:
        return 0.0
    cm = np.bincount(targets * n_classes + preds, minlength=n_classes**2)
    cm = cm.reshape(n_classes, n_classes)
    tp = np.diag(cm).astype(float)
    support, predicted = cm.sum(axis=1), cm.sum(axis=0)
    denom = support + predicted
    f1 = np.divide(2 * tp, denom, out=np.zeros(n_classes), where=denom > 0)
    return float(f1[support > 0].mean())


def _indices(name: str, size: int, n_boot: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng([seed, zlib.crc32(name.encode())])
    return rng.integers(0, size, (n_boot, size))


def _interval(values: np.ndarray) -> list[float]:
    return [float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))]


def ci95(
    targets: np.ndarray,
    preds: np.ndarray,
    slices: dict[str, np.ndarray],
    n_classes: int,
    n_boot: int = 1000,
    seed: int = 42,
) -> dict[str, list[float] | None]:
    """[low, high] of the macro-F1 of every slice; ``None`` for an empty slice."""
    out: dict[str, list[float] | None] = {}
    for name, mask in slices.items():
        t, p = targets[mask], preds[mask]
        if len(t) == 0:
            out[name] = None
            continue
        idx = _indices(name, len(t), n_boot, seed)
        out[name] = _interval(np.array([macro_f1(t[i], p[i], n_classes) for i in idx]))
    return out


def paired_diff_ci95(
    targets: np.ndarray,
    preds_new: np.ndarray,
    preds_parent: np.ndarray,
    slices: dict[str, np.ndarray],
    n_classes: int,
    n_boot: int = 1000,
    seed: int = 42,
) -> dict[str, dict | None]:
    """Macro-F1 of the new run minus the parent's, on the same resampled photos.

    The difference is significant when its interval does not contain 0.
    """
    out: dict[str, dict | None] = {}
    for name, mask in slices.items():
        t, new, old = targets[mask], preds_new[mask], preds_parent[mask]
        if len(t) == 0:
            out[name] = None
            continue
        idx = _indices(name, len(t), n_boot, seed)
        diffs = np.array(
            [macro_f1(t[i], new[i], n_classes) - macro_f1(t[i], old[i], n_classes) for i in idx]
        )
        point = macro_f1(t, new, n_classes) - macro_f1(t, old, n_classes)
        out[name] = {"diff": float(point), "ci95": _interval(diffs)}
    return out
