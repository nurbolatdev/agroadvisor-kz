"""Bootstrap 95 % confidence intervals for macro-F1.

Groups of photos (the ``group`` column of splits.csv: photos of one leaf and near-duplicates) are
resampled with replacement inside a slice (e.g. field photos of tomato), not single photos, so
the interval reflects that photos of one group are not independent. Without groups every photo
is its own group. The seed is fixed per slice name, so adding a slice does not change the others.
"""

import zlib

import numpy as np


def _macro_f1_from_confusion(cm: np.ndarray) -> float:
    """Macro-F1 over the classes present in the truth (rows) of a confusion matrix."""
    tp = np.diag(cm).astype(float)
    support, predicted = cm.sum(axis=1), cm.sum(axis=0)
    denom = support + predicted
    f1 = np.divide(2 * tp, denom, out=np.zeros(len(cm)), where=denom > 0)
    return float(f1[support > 0].mean())


def macro_f1(targets: np.ndarray, preds: np.ndarray, n_classes: int) -> float:
    """Macro-F1 over the classes present in ``targets`` (same rule as the reported metrics)."""
    if len(targets) == 0:
        return 0.0
    cm = np.bincount(targets * n_classes + preds, minlength=n_classes**2)
    return _macro_f1_from_confusion(cm.reshape(n_classes, n_classes))


def _group_confusions(
    targets: np.ndarray, preds: np.ndarray, groups: np.ndarray | None, n_classes: int
) -> np.ndarray:
    """One flattened confusion matrix per group, groups numbered by first appearance."""
    if groups is None:
        group_id, count = np.arange(len(targets)), len(targets)
    else:
        unique, first, inverse = np.unique(groups, return_index=True, return_inverse=True)
        rank = np.empty(len(unique), dtype=int)
        rank[np.argsort(first)] = np.arange(len(unique))
        group_id, count = rank[inverse], len(unique)
    per_group = np.zeros((count, n_classes * n_classes))
    np.add.at(per_group, (group_id, targets * n_classes + preds), 1)
    return per_group


def _resamples(name: str, n_groups: int, n_boot: int, seed: int) -> np.ndarray:
    """Per resample, how many times each group is drawn (shape ``n_boot`` x ``n_groups``)."""
    rng = np.random.default_rng([seed, zlib.crc32(name.encode())])
    draws = rng.integers(0, n_groups, (n_boot, n_groups))
    return np.stack([np.bincount(row, minlength=n_groups) for row in draws]).astype(float)


def _interval(values: np.ndarray) -> list[float]:
    return [float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))]


def _scores(counts: np.ndarray, per_group: np.ndarray, n_classes: int) -> np.ndarray:
    totals = counts @ per_group
    return np.array([_macro_f1_from_confusion(t.reshape(n_classes, n_classes)) for t in totals])


def ci95(
    targets: np.ndarray,
    preds: np.ndarray,
    slices: dict[str, np.ndarray],
    n_classes: int,
    n_boot: int = 1000,
    seed: int = 42,
    groups: np.ndarray | None = None,
) -> dict[str, list[float] | None]:
    """[low, high] of the macro-F1 of every slice; ``None`` for an empty slice."""
    out: dict[str, list[float] | None] = {}
    for name, mask in slices.items():
        if not mask.any():
            out[name] = None
            continue
        per_group = _group_confusions(
            targets[mask], preds[mask], None if groups is None else groups[mask], n_classes
        )
        counts = _resamples(name, len(per_group), n_boot, seed)
        out[name] = _interval(_scores(counts, per_group, n_classes))
    return out


def paired_diff_ci95(
    targets: np.ndarray,
    preds_new: np.ndarray,
    preds_parent: np.ndarray,
    slices: dict[str, np.ndarray],
    n_classes: int,
    n_boot: int = 1000,
    seed: int = 42,
    groups: np.ndarray | None = None,
) -> dict[str, dict | None]:
    """Macro-F1 of the new run minus the parent's, on the same resampled groups.

    The difference is significant when its interval does not contain 0.
    """
    out: dict[str, dict | None] = {}
    for name, mask in slices.items():
        if not mask.any():
            out[name] = None
            continue
        g = None if groups is None else groups[mask]
        new = _group_confusions(targets[mask], preds_new[mask], g, n_classes)
        old = _group_confusions(targets[mask], preds_parent[mask], g, n_classes)
        counts = _resamples(name, len(new), n_boot, seed)
        diffs = _scores(counts, new, n_classes) - _scores(counts, old, n_classes)
        point = macro_f1(targets[mask], preds_new[mask], n_classes) - macro_f1(
            targets[mask], preds_parent[mask], n_classes
        )
        out[name] = {"diff": float(point), "ci95": _interval(diffs)}
    return out
