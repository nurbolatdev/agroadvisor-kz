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
from torch.utils.data import DataLoader, Subset

from ml.bootstrap import ci95, paired_diff_ci95
from ml.data import PlantDataset, eval_transform
from ml.registry import Registry, load_registry

BOOTSTRAP_SEED = 42
DOMAINS = ("lab", "field", "other")
UNKNOWN = "unknown"


def load_meta(dataset_dir: Path, files: list[str]) -> tuple[list[str | None], list[str]]:
    """Crop and photo domain of every file, joined from manifest.csv (splits.csv has neither)."""
    with (Path(dataset_dir) / "manifest.csv").open(encoding="utf-8") as f:
        rows = {r["file"]: r for r in csv.DictReader(f)}
    crops = [rows[name]["crop"] or None for name in files]
    kinds = [rows[name]["kind"] for name in files]
    return crops, kinds


def load_groups(dataset_dir: Path, files: list[str]) -> np.ndarray:
    """Group of every file (photos of one leaf / near-duplicates), from splits.csv."""
    with (Path(dataset_dir) / "splits.csv").open(encoding="utf-8") as f:
        rows = {r["file"]: r["group"] for r in csv.DictReader(f)}
    return np.array([rows[name] for name in files])


def file_md5s(dataset_dir: Path) -> dict[str, str]:
    """MD5 of every file of a dataset, from manifest.csv."""
    with (Path(dataset_dir) / "manifest.csv").open(encoding="utf-8") as f:
        return {r["file"]: r["md5"] for r in csv.DictReader(f)}


def train_md5s(dataset_dir: Path) -> set[str]:
    """MD5 of the photos a model trained on this dataset has seen (its ``train`` split)."""
    md5 = file_md5s(dataset_dir)
    with (Path(dataset_dir) / "splits.csv").open(encoding="utf-8") as f:
        return {md5[r["file"]] for r in csv.DictReader(f) if r["split"] == "train"}


def excluded_md5s(
    run_dir: Path, dataset_dir: Path, other_runs: list[Path] | None = None
) -> tuple[set[str], list[str]]:
    """Photos that a comparison on ``dataset_dir`` must leave out, and where they come from.

    A run scored on another dataset than its own has seen that dataset's train photos, and some
    of them are in val, test or bench of the new one (the split was made again). They are left
    out. ``other_runs`` adds the train photos of other runs, so that two runs trained on
    different datasets are scored on exactly the same photos.
    """
    own = Path(json.loads((run_dir / "config.json").read_text(encoding="utf-8"))["dataset_dir"])
    datasets = [own] if own.resolve() != Path(dataset_dir).resolve() else []
    for other in other_runs or []:
        config = json.loads((other / "config.json").read_text(encoding="utf-8"))
        datasets.append(Path(config["dataset_dir"]))
    md5: set[str] = set()
    names: list[str] = []
    for path in dict.fromkeys(p.resolve() for p in datasets):
        if path != Path(dataset_dir).resolve():  # a dataset's own train never reaches its val
            md5 |= train_md5s(path)
            names.append(path.name)
    return md5, names


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
    numbers skip images whose class is ``unknown``: no crop is chosen for them.
    ``crop_masked_product_*`` is the headline number: the answer is restricted to the classes of
    the crop plus ``unknown``, as ``/predict`` does, so a crop photo answered ``unknown`` counts
    as an error; it is also reported per domain and, for field photos, per crop. ``crop_masked_*``
    (the crop's classes only) is an auxiliary metric.
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
    product_preds = np.full(len(targets), -1)
    product_preds[has_crop] = product.argmax(axis=1)
    crop_arr = np.array([c or "" for c in crops])
    product_by_domain, product_field_by_crop = {}, {}
    for domain in DOMAINS:
        sel = has_crop & (np.array(kinds) == domain)
        d_acc, d_f1 = _acc_f1(targets[sel], product_preds[sel])
        product_by_domain[domain] = {"acc": d_acc, "macro_f1": d_f1, "n": int(sel.sum())}
    for crop in sorted(masks):
        sel = (crop_arr == crop) & (np.array(kinds) == "field")
        c_acc, c_f1 = _acc_f1(targets[sel], product_preds[sel])
        product_field_by_crop[crop] = {"acc": c_acc, "macro_f1": c_f1, "n": int(sel.sum())}

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
        "crop_masked_product_by_domain": product_by_domain,
        "crop_masked_product_field_by_crop": product_field_by_crop,
        "by_domain": by_domain,
        "unknown": unknown,
        "per_class": per_class,
    }


def product_slices(
    logits: np.ndarray,
    crops: list[str | None],
    kinds: list[str],
    classes: list[str],
    registry: Registry,
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """Product-style predictions (crop classes + ``unknown``) and the photo masks of the headline
    slices: all crop photos, field photos, and field photos of each crop."""
    has_crop = np.array([c is not None for c in crops], dtype=bool)
    masks = crop_masks(classes, registry)
    preds = np.full(len(logits), -1)
    masked = mask_logits(
        logits[has_crop], [c for c in crops if c], masks, (classes.index(UNKNOWN),)
    )
    preds[has_crop] = masked.argmax(axis=1)
    field = has_crop & (np.array(kinds) == "field")
    crop_arr = np.array([c or "" for c in crops])
    slices = {"overall": has_crop, "field": field}
    for crop in sorted(masks):
        slices[f"field_{crop}"] = field & (crop_arr == crop)
    return preds, slices


def ci_key(slice_name: str) -> str:
    """Key of a slice in ``ci95``: ``crop_masked_product_macro_f1[_field[_<crop>]]``."""
    return "crop_masked_product_macro_f1" + ("" if slice_name == "overall" else f"_{slice_name}")


def compare_runs(
    run_dir: Path, parent_dir: Path, tag: str, n_boot: int, registry: Registry | None = None
) -> dict:
    """Paired bootstrap of the headline metrics: this run minus its parent on the same photos.

    ``tag`` names the saved logits (``logits_<tag>.npz``): the split, plus the dataset name when a
    run was scored on a dataset other than its own.
    """
    new, old = (np.load(d / f"logits_{tag}.npz") for d in (run_dir, parent_dir))
    if new["files"].shape != old["files"].shape or not (new["files"] == old["files"]).all():
        raise ValueError("the two runs were scored on different photos")
    if not (new["targets"] == old["targets"]).all():
        raise ValueError("the two runs have different targets (different class index?)")
    classes = json.loads((run_dir / "class_index.json").read_text(encoding="utf-8"))["classes"]
    parent_classes = json.loads((parent_dir / "class_index.json").read_text(encoding="utf-8"))
    if parent_classes["classes"] != classes:
        raise ValueError("the two runs have different class indexes")
    if "dataset_dir" in new.files:
        dataset_dir = Path(str(new["dataset_dir"]))
    else:  # logits saved before the dataset was recorded: the run's own dataset
        config = json.loads((run_dir / "config.json").read_text(encoding="utf-8"))
        dataset_dir = Path(config["dataset_dir"])
    files = new["files"].tolist()
    crops, kinds = load_meta(dataset_dir, files)
    registry = registry or load_registry()
    preds_new, slices = product_slices(new["logits"], crops, kinds, classes, registry)
    preds_old, _ = product_slices(old["logits"], crops, kinds, classes, registry)
    groups = load_groups(dataset_dir, files)
    diff = paired_diff_ci95(
        new["targets"], preds_new, preds_old, slices, len(classes), n_boot,
        seed=BOOTSTRAP_SEED, groups=groups,
    )  # fmt: skip
    return {ci_key(name): value for name, value in diff.items()}


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
    bootstrap: int = 0,
    run_dir: Path | None = None,
    tag: str | None = None,
    exclude_md5: set[str] | None = None,
) -> tuple[dict, np.ndarray, np.ndarray, np.ndarray]:
    """Score ``model`` on one full split; returns (metrics, logits, targets, field mask).

    With ``bootstrap`` > 0 the headline metrics get 95 % intervals (``ci95``); with ``run_dir``
    the logits are saved as ``logits_<split>.npz`` so runs can be compared on the same photos.
    Photos whose MD5 is in ``exclude_md5`` (training photos of a model) are left out; their
    number is reported as ``excluded_train_overlap``.
    """
    registry = registry or load_registry()
    dataset = PlantDataset(dataset_dir, split, eval_transform())
    files, scored, excluded = dataset.files, dataset, 0
    if exclude_md5:
        md5 = file_md5s(dataset_dir)
        keep = [i for i, name in enumerate(files) if md5[name] not in exclude_md5]
        if not keep:
            raise ValueError(f"every photo of {split} is a training photo of the model")
        excluded = len(files) - len(keep)
        files, scored = [files[i] for i in keep], Subset(dataset, keep)
    loader = DataLoader(scored, batch_size=batch_size, num_workers=num_workers)
    logits, targets, loss = predict_logits(model, loader, device)
    crops, kinds = load_meta(dataset_dir, files)
    metrics = compute_metrics(logits, targets, dataset.classes, crops, kinds, registry)
    metrics["loss"] = loss
    metrics["evaluated_photos"] = len(files)
    metrics["excluded_train_overlap"] = excluded
    if bootstrap:
        preds, slices = product_slices(logits, crops, kinds, dataset.classes, registry)
        groups = load_groups(dataset_dir, files)
        intervals = ci95(
            targets, preds, slices, len(dataset.classes), bootstrap,
            seed=BOOTSTRAP_SEED, groups=groups,
        )  # fmt: skip
        metrics["ci95"] = {ci_key(name): value for name, value in intervals.items()}
        metrics["ci95_bootstrap"] = {
            "resamples": bootstrap, "seed": BOOTSTRAP_SEED, "unit": "group",
        }  # fmt: skip
    if run_dir is not None:
        np.savez_compressed(
            run_dir / f"logits_{tag or split}.npz",
            logits=logits.astype(np.float32),
            targets=targets,
            files=np.array(files),
            dataset_dir=str(dataset_dir),
        )
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


def score_key(config: dict, dataset_dir: Path, split: str, excluded: bool) -> tuple[str, str]:
    """File tag and results key; a score on other photos never replaces the run's own numbers.

    Relative paths are resolved against the current directory (run from ``services/ai-service``).
    """
    own = dataset_dir.resolve() == Path(config["dataset_dir"]).resolve() and not excluded
    if own:
        return split, split
    return f"{split}_{dataset_dir.name}", f"{split}@{dataset_dir.name}"


def main() -> None:
    from ml.train import build_model, git_info, resolve_device

    parser = argparse.ArgumentParser(description="Score the best checkpoint of a run")
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--split", choices=["val", "test", "bench"], default="val")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--bootstrap", type=int, default=0, help="resamples for 95%% intervals")
    parser.add_argument(
        "--compare-with", type=Path, help="parent run dir: paired difference with intervals "
        "(score the parent first with the same --dataset-dir and --exclude-train-of)"
    )
    parser.add_argument(
        "--dataset-dir", type=Path,
        help="score on another dataset than the run was trained on (results are kept under "
        "'<split>@<dataset>' so the original numbers stay)",
    )  # fmt: skip
    parser.add_argument(
        "--exclude-train-of", type=Path, action="append", default=[], metavar="RUN_DIR",
        help="also leave out the training photos (by MD5) of this run; repeat for several runs. "
        "A run scored on another dataset always leaves out the train photos of its own one",
    )  # fmt: skip
    args = parser.parse_args()
    if args.compare_with and not args.bootstrap:
        parser.error("--compare-with needs --bootstrap")

    config = json.loads((args.run_dir / "config.json").read_text(encoding="utf-8"))
    dataset_dir = args.dataset_dir or Path(config["dataset_dir"])
    # a run compared with a parent is scored on the photos the parent did not train on either
    others = [*args.exclude_train_of, *([args.compare_with] if args.compare_with else [])]
    exclude, sources = excluded_md5s(args.run_dir, dataset_dir, others)
    tag, key = score_key(config, dataset_dir, args.split, bool(exclude))
    checkpoint = torch.load(args.run_dir / "best.pt", map_location="cpu", weights_only=True)
    device = resolve_device(args.device)
    model = build_model(len(checkpoint["classes"]), pretrained=False)
    model.load_state_dict(checkpoint["model"])
    model.to(device)

    metrics, logits, targets, field = evaluate_split(
        model, dataset_dir, args.split, device, num_workers=args.num_workers,
        bootstrap=args.bootstrap, run_dir=args.run_dir, tag=tag, exclude_md5=exclude,
    )  # fmt: skip
    if args.compare_with:
        parent_config = (args.compare_with / "config.json").read_text(encoding="utf-8")
        parent_id = json.loads(parent_config)["id"]
        metrics["ci95_diff"] = {
            parent_id: compare_runs(args.run_dir, args.compare_with, tag, args.bootstrap)
        }
    classes, title = checkpoint["classes"], f"{config['id']} — {key}"
    plot_confusion(logits, targets, classes, args.run_dir / f"confusion_{tag}.png", title)
    plot_confusion(
        logits, targets, classes, args.run_dir / f"confusion_{tag}_field.png",
        f"{title} (field photos)", mask=field,
    )  # fmt: skip
    results_path = args.run_dir / "results.json"
    results = json.loads(results_path.read_text(encoding="utf-8"))
    results[key] = metrics
    results[f"{key}_scored_with"] = {
        "dataset_dir": str(dataset_dir),
        "excluded_train_of": sources,
        "excluded_train_overlap": metrics["excluded_train_overlap"],
        "git_commit": git_info()["git_commit"],
        "scored_at": datetime.now().isoformat(timespec="seconds"),
    }
    results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"{key}: acc={metrics['acc']:.4f} macro_f1={metrics['macro_f1']:.4f} "
        f"({metrics['evaluated_photos']} photos, {metrics['excluded_train_overlap']} left out as "
        f"training photos of {sources or 'no run'})"
    )


if __name__ == "__main__":
    main()
