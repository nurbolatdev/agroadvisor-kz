"""Metrics and plots for a trained model.

Besides plain accuracy / macro-F1 it reports the numbers that matter for the product: the
answer restricted to the crop the farmer selected (``crop_masked_*``) and the split by photo
domain (lab / field / other). ``python -m ml.evaluate <run dir> --split test`` scores the best
checkpoint of a finished run.
"""

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from ml.data import PlantDataset, eval_transform
from ml.registry import Registry, load_registry

DOMAINS = ("lab", "field", "other")
UNKNOWN = "unknown"


def load_meta(dataset_dir: Path, files: list[str]) -> tuple[list[str | None], list[str]]:
    """Crop and photo domain of every file, joined from manifest.csv (splits.csv has neither)."""
    with (Path(dataset_dir) / "manifest.csv").open(encoding="utf-8") as f:
        rows = {r["file"]: r for r in csv.DictReader(f)}
    crops = [rows[name]["crop"] or None for name in files]
    kinds = [rows[name]["kind"] for name in files]
    return crops, kinds


def crop_masks(classes: list[str], registry: Registry) -> dict[str, list[int]]:
    """Indices of the classes of each crop (``unknown`` belongs to no crop)."""
    masks: dict[str, list[int]] = {}
    for i, code in enumerate(classes):
        crop = registry.get(code).crop
        if crop:
            masks.setdefault(crop, []).append(i)
    return masks


def mask_logits(
    logits: np.ndarray,
    crops: list[str | None],
    masks: dict[str, list[int]],
    also_keep: tuple[int, ...] = (),
) -> np.ndarray:
    """Keep only the classes of each row's crop (plus ``also_keep``, e.g. ``unknown``).

    Rows without a crop are left untouched.
    """
    out = logits.copy()
    for row, crop in enumerate(crops):
        if crop is None:
            continue
        keep = np.zeros(logits.shape[1], dtype=bool)
        keep[masks[crop]] = True
        keep[list(also_keep)] = True
        out[row, ~keep] = -np.inf
    return out


def _acc_f1(targets: np.ndarray, preds: np.ndarray) -> tuple[float, float]:
    """Accuracy and macro-F1 over the classes present in ``targets``."""
    from sklearn.metrics import f1_score

    if len(targets) == 0:
        return 0.0, 0.0
    labels = sorted(set(targets.tolist()))
    f1 = f1_score(targets, preds, labels=labels, average="macro", zero_division=0)
    return float((targets == preds).mean()), float(f1)


def per_class_metrics(targets: np.ndarray, preds: np.ndarray, classes: list[str]) -> dict:
    from sklearn.metrics import precision_recall_fscore_support

    if len(targets) == 0:  # a domain with no images in this split
        empty = {"precision": 0.0, "recall": 0.0, "f1": 0.0, "support": 0}
        return {code: dict(empty) for code in classes}
    p, r, f, support = precision_recall_fscore_support(
        targets, preds, labels=list(range(len(classes))), zero_division=0
    )
    return {
        code: {
            "precision": float(p[i]),
            "recall": float(r[i]),
            "f1": float(f[i]),
            "support": int(support[i]),
        }
        for i, code in enumerate(classes)
    }


def compute_metrics(
    logits: np.ndarray,
    targets: np.ndarray,
    classes: list[str],
    crops: list[str | None],
    kinds: list[str],
    registry: Registry,
) -> dict:
    """Everything results.json needs for one split.

    Macro-F1 is averaged over the classes that occur in the evaluated subset. The crop-masked
    numbers skip images whose class is ``unknown``: no crop is chosen for them. ``crop_masked_*``
    keeps only the classes of the crop; ``crop_masked_product_*`` also keeps ``unknown``, which
    is what ``/predict`` does, so a crop photo answered ``unknown`` counts as an error.
    """
    preds = logits.argmax(axis=1)
    acc, macro_f1 = _acc_f1(targets, preds)
    top3 = np.argsort(-logits, axis=1)[:, :3]
    top3_acc = float((top3 == targets[:, None]).any(axis=1).mean())

    has_crop = np.array([c is not None for c in crops], dtype=bool)
    crop_list, masks = [c for c in crops if c], crop_masks(classes, registry)
    masked = mask_logits(logits[has_crop], crop_list, masks)
    masked_acc, masked_f1 = _acc_f1(targets[has_crop], masked.argmax(axis=1))
    # as /predict answers: the crop's classes plus ``unknown``
    product = mask_logits(logits[has_crop], crop_list, masks, (classes.index(UNKNOWN),))
    product_acc, product_f1 = _acc_f1(targets[has_crop], product.argmax(axis=1))

    kind_arr = np.array(kinds)
    by_domain = {}
    for domain in DOMAINS:
        sel = kind_arr == domain
        d_acc, d_f1 = _acc_f1(targets[sel], preds[sel])
        by_domain[domain] = {
            "acc": d_acc,
            "macro_f1": d_f1,
            "n": int(sel.sum()),
            "per_class": per_class_metrics(targets[sel], preds[sel], classes),
        }

    unk = classes.index(UNKNOWN)
    pred_unk, true_unk = preds == unk, targets == unk
    hit = int((pred_unk & true_unk).sum())
    unknown = {
        "precision": hit / int(pred_unk.sum()) if pred_unk.any() else 0.0,
        "recall": hit / int(true_unk.sum()) if true_unk.any() else 0.0,
    }

    per_class = per_class_metrics(targets, preds, classes)
    return {
        "n": int(len(targets)),
        "acc": acc,
        "macro_f1": macro_f1,
        "top3_acc": top3_acc,
        "crop_masked_acc": masked_acc,
        "crop_masked_macro_f1": masked_f1,
        "crop_masked_product_acc": product_acc,
        "crop_masked_product_macro_f1": product_f1,
        "crop_masked_n": int(has_crop.sum()),
        "by_domain": by_domain,
        "unknown": unknown,
        "per_class": per_class,
    }


@torch.no_grad()
def predict_logits(
    model: nn.Module, loader: DataLoader, device: torch.device
) -> tuple[np.ndarray, np.ndarray, float]:
    """Logits, targets and mean cross-entropy loss over a loader."""
    model.eval()
    all_logits, all_targets, total = [], [], 0.0
    criterion = nn.CrossEntropyLoss(reduction="sum")
    for images, labels in loader:
        out = model(images.to(device)).float()
        total += criterion(out, labels.to(device)).item()
        all_logits.append(out.cpu())
        all_targets.append(labels)
    logits = torch.cat(all_logits).numpy()
    targets = torch.cat(all_targets).numpy()
    return logits, targets, total / len(targets)


def evaluate_split(
    model: nn.Module,
    dataset_dir: Path,
    split: str,
    device: torch.device,
    batch_size: int = 64,
    num_workers: int = 4,
    registry: Registry | None = None,
) -> tuple[dict, np.ndarray, np.ndarray, np.ndarray]:
    """Score ``model`` on one full split; returns (metrics, logits, targets, field mask)."""
    dataset = PlantDataset(dataset_dir, split, eval_transform())
    loader = DataLoader(dataset, batch_size=batch_size, num_workers=num_workers)
    logits, targets, loss = predict_logits(model, loader, device)
    crops, kinds = load_meta(dataset_dir, dataset.files)
    metrics = compute_metrics(
        logits, targets, dataset.classes, crops, kinds, registry or load_registry()
    )
    metrics["loss"] = loss
    return metrics, logits, targets, np.array(kinds) == "field"


def plot_curves(metrics_csv: Path, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    with metrics_csv.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    epochs = [int(r["epoch"]) for r in rows]

    def col(name: str) -> list[float]:
        return [float(r[name]) for r in rows]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4))
    ax1.plot(epochs, col("train_loss"), label="train")
    ax1.plot(epochs, col("val_loss"), label="val")
    ax1.set(title="Loss", xlabel="epoch")
    ax2.plot(epochs, col("val_macro_f1"), label="val macro-F1")
    ax2.plot(epochs, col("val_macro_f1_lab"), label="lab", linestyle="--")
    ax2.plot(epochs, col("val_macro_f1_field"), label="field", linestyle="--")
    ax2.set(title="Validation macro-F1", xlabel="epoch", ylim=(0, 1))
    for ax in (ax1, ax2):
        ax.grid(alpha=0.3)
        ax.legend()
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)


def plot_confusion(
    logits: np.ndarray,
    targets: np.ndarray,
    classes: list[str],
    out: Path,
    title: str,
    mask: np.ndarray | None = None,
) -> None:
    """Row-normalized confusion matrix; ``mask`` keeps a subset of the images (e.g. field)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import confusion_matrix

    if mask is not None:
        logits, targets = logits[mask], targets[mask]
    if len(targets) == 0:  # nothing of this kind in the split, nothing to draw
        return
    labels = list(range(len(classes)))
    cm = confusion_matrix(targets, logits.argmax(axis=1), labels=labels).astype(float)
    cm /= np.maximum(cm.sum(axis=1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(10, 9))
    image = ax.imshow(cm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(labels, classes, rotation=90, fontsize=7)
    ax.set_yticks(labels, classes, fontsize=7)
    ax.set(title=title, xlabel="predicted", ylabel="true")
    fig.colorbar(image, ax=ax, fraction=0.04)
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)


def main() -> None:
    from ml.train import build_model, git_info, resolve_device

    parser = argparse.ArgumentParser(description="Score the best checkpoint of a run")
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--split", choices=["val", "test"], default="val")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--num-workers", type=int, default=4)
    args = parser.parse_args()

    config = json.loads((args.run_dir / "config.json").read_text(encoding="utf-8"))
    checkpoint = torch.load(args.run_dir / "best.pt", map_location="cpu", weights_only=True)
    device = resolve_device(args.device)
    model = build_model(len(checkpoint["classes"]), pretrained=False)
    model.load_state_dict(checkpoint["model"])
    model.to(device)

    metrics, logits, targets, field = evaluate_split(
        model, Path(config["dataset_dir"]), args.split, device, num_workers=args.num_workers
    )
    classes, title = checkpoint["classes"], f"{config['id']} — {args.split}"
    plot_confusion(logits, targets, classes, args.run_dir / f"confusion_{args.split}.png", title)
    plot_confusion(
        logits, targets, classes, args.run_dir / f"confusion_{args.split}_field.png",
        f"{title} (field photos)", mask=field,
    )  # fmt: skip
    results_path = args.run_dir / "results.json"
    results = json.loads(results_path.read_text(encoding="utf-8"))
    results[args.split] = metrics
    results[f"{args.split}_scored_with"] = {
        "git_commit": git_info()["git_commit"],
        "scored_at": datetime.now().isoformat(timespec="seconds"),
    }
    results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{args.split}: acc={metrics['acc']:.4f} macro_f1={metrics['macro_f1']:.4f}")


if __name__ == "__main__":
    main()
