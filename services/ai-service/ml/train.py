"""Train EfficientNet-B0 on the plant dataset.

Stage 1 trains only the new classification head, stage 2 the whole network with a smaller
learning rate. Every run writes its artifacts to ``ml/runs/<ID>/`` (not in git): config,
environment, per-epoch metrics, results, plots and the best checkpoint by validation macro-F1.
Results are recorded in ``docs/ai/experiments.md``.

    python -m ml.train --id A5-E001 --objective "..." --hypothesis "..."
"""

import argparse
import csv
import hashlib
import json
import os
import platform
import random
import subprocess
import time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torchvision  # noqa: E402
import yaml  # noqa: E402
from torch import nn  # noqa: E402
from torch.utils.data import DataLoader, Subset  # noqa: E402

from ml.data import (  # noqa: E402
    AUGMENTATIONS,
    IMAGE_SIZE,
    MEAN,
    STD,
    PlantDataset,
    balanced_sampler,
    eval_transform,
    field_weighted_sampler,
    lab_cap_indices,
    train_transform,
)
from ml.evaluate import (  # noqa: E402
    compute_metrics,
    evaluate_split,
    load_meta,
    plot_confusion,
    plot_curves,
    predict_logits,
)
from ml.registry import load_registry  # noqa: E402

ML_DIR = Path(__file__).resolve().parent
RUNS_DIR = ML_DIR / "runs"
SELECTION_METRICS = ("val_macro_f1", "val_field_product_macro_f1")
METRIC_COLUMNS = [
    "epoch", "stage", "train_loss", "val_loss", "val_acc", "val_macro_f1",
    "val_macro_f1_lab", "val_macro_f1_field", "val_field_product_macro_f1", "lr", "epoch_time_s",
]  # fmt: skip


def selection_key(metric: str, scores: dict) -> tuple[float, float]:
    """Order of epochs: the selection metric first, overall macro-F1 breaks ties."""
    return round(float(scores[metric]), 6), round(float(scores["val_macro_f1"]), 6)


def resolve_device(name: str) -> torch.device:
    """``auto`` picks cuda, then mps, then cpu; an unavailable explicit choice falls back to cpu."""
    if name == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    available = {
        "cuda": torch.cuda.is_available(),
        "mps": torch.backends.mps.is_available(),
        "cpu": True,
    }
    return torch.device(name if available.get(name) else "cpu")


def build_model(num_classes: int, pretrained: bool = True) -> nn.Module:
    """EfficientNet-B0 with a fresh ``num_classes`` head."""
    weights = torchvision.models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    model = torchvision.models.efficientnet_b0(weights=weights)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model


def set_stage(model: nn.Module, frozen_backbone: bool) -> list[nn.Parameter]:
    """Freeze or unfreeze the backbone; returns the parameters to optimize."""
    for param in model.features.parameters():
        param.requires_grad = not frozen_backbone
    return [p for p in model.parameters() if p.requires_grad]


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def subset_indices(n: int, fraction: float, seed: int) -> list[int]:
    count = max(1, round(n * fraction))
    return sorted(random.Random(seed).sample(range(n), count))


def build_loaders(args: argparse.Namespace) -> dict[str, DataLoader]:
    """Train / val loaders.

    ``--subset`` keeps a seeded random fraction of both (smoke runs); ``--lab-cap`` limits the
    laboratory photos per class in train only, validation is never touched.
    """
    train = PlantDataset(args.dataset_dir, "train", train_transform(args.aug))
    val = PlantDataset(args.dataset_dir, "val", eval_transform())
    train_set, val_set, targets, files = train, val, train.targets, train.files
    if args.subset < 1.0:
        keep = subset_indices(len(train), args.subset, args.seed)
        train_set, targets = Subset(train, keep), [train.targets[i] for i in keep]
        files = [train.files[i] for i in keep]
        val_set = Subset(val, subset_indices(len(val), args.subset, args.seed))
    kinds = None
    if args.lab_cap or args.field_share > 0:
        _, kinds = load_meta(args.dataset_dir, files)
    if args.lab_cap:
        keep_pos = lab_cap_indices(targets, kinds, args.lab_cap, args.seed)
        original = train_set.indices if isinstance(train_set, Subset) else list(range(len(train)))
        train_set = Subset(train, [original[i] for i in keep_pos])
        targets = [targets[i] for i in keep_pos]
        kinds = [kinds[i] for i in keep_pos]
    print(
        f"train images: {len(targets)} (aug {args.aug}, lab cap {args.lab_cap or 'none'})",
        flush=True,
    )
    if args.field_share > 0:
        sampler = field_weighted_sampler(targets, kinds, args.field_share)
    else:
        sampler = balanced_sampler(targets) if args.balanced else None
    workers = args.num_workers
    return {
        "train": DataLoader(
            train_set,
            batch_size=args.batch_size,
            sampler=sampler,
            shuffle=sampler is None,
            num_workers=workers,
            persistent_workers=workers > 0,
        ),
        "val": DataLoader(
            val_set, batch_size=args.batch_size, num_workers=workers, persistent_workers=workers > 0
        ),
    }


def git_info() -> dict:
    def run(*cmd: str) -> str:
        return subprocess.run(cmd, capture_output=True, text=True, cwd=ML_DIR).stdout.strip()

    return {
        "git_commit": run("git", "rev-parse", "--short", "HEAD"),
        "git_branch": run("git", "rev-parse", "--abbrev-ref", "HEAD"),
        "git_dirty": bool(run("git", "status", "--porcelain")),
    }


def chip_name() -> str:
    if platform.system() == "Darwin":
        out = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True
        ).stdout.strip()
        return out or platform.processor()
    return platform.processor() or platform.machine()


def build_config(args: argparse.Namespace, device: torch.device, classes_version: int) -> dict:
    return {
        "id": args.id,
        "task": args.id.split("-")[0],
        "objective": args.objective,
        "hypothesis": args.hypothesis,
        "parent": args.parent,
        "dataset_dir": str(args.dataset_dir),
        "dataset_version": args.dataset_dir.name,
        "classes_version": classes_version,
        "model": "efficientnet_b0",
        "pretrained": not args.no_pretrained,
        "stages": [
            {"name": "head", "epochs": args.head_epochs, "lr": args.head_lr,
             "frozen_backbone": True},
            {"name": "full", "epochs": args.full_epochs, "lr": args.full_lr,
             "frozen_backbone": False},
        ],  # fmt: skip
        "batch_size": args.batch_size,
        "optimizer": "AdamW",
        "scheduler": "constant in the head stage, cosine to zero in the full stage",
        "weight_decay": args.weight_decay,
        "seed": args.seed,
        "image_size": IMAGE_SIZE,
        "transforms": {
            "train": (
                "RandomResizedCrop(224, 0.3-1.0), flips, rotation 30, TrivialAugmentWide, "
                "ColorJitter, blur, JPEG compression, Gaussian noise, RandomErasing"
                if args.aug == "strong"
                else "RandomResizedCrop(224, 0.6-1.0), flips, rotation 30, ColorJitter, blur"
            ),
            "eval": "Resize 256, CenterCrop 224, ImageNet normalization",
        },
        "aug": args.aug,
        "lab_cap": args.lab_cap,
        "label_smoothing": args.label_smoothing,
        "sampler": (
            f"balanced by class, {args.field_share:.1%} of the draws of a class that has both "
            "field and other photos go to its field photos"
            if args.field_share > 0
            else "balanced (1/class count)"
            if args.balanced
            else "uniform shuffle"
        ),
        "field_share": args.field_share,
        "selection_metric": args.selection_metric,
        "device": str(device),
        "num_workers": args.num_workers,
        "subset": args.subset,
    }


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def train_epoch(model, loader, optimizer, criterion, device, desc: str, frozen: bool) -> float:
    from tqdm import tqdm

    model.train()
    if frozen:  # keep the frozen backbone's batch-norm statistics untouched
        model.features.eval()
    total, seen = 0.0, 0
    for images, labels in tqdm(loader, desc=desc, leave=False):
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(model(images), labels)
        loss.backward()
        optimizer.step()
        total += loss.item() * len(labels)
        seen += len(labels)
    return total / seen


def validate(model, loader, device, args, registry, classes) -> dict:
    """Validation metrics for one epoch (the loader may be a subset)."""
    logits, targets, loss = predict_logits(model, loader, device)
    files = _files_of(loader.dataset)
    crops, kinds = load_meta(args.dataset_dir, files)
    metrics = compute_metrics(logits, targets, classes, crops, kinds, registry)
    metrics["loss"] = loss
    return metrics


def _files_of(dataset) -> list[str]:
    if isinstance(dataset, Subset):
        return [dataset.dataset.files[i] for i in dataset.indices]
    return dataset.files


def run_training(args: argparse.Namespace, run_dir: Path, device: torch.device) -> None:
    from torch.utils.tensorboard import SummaryWriter

    registry = load_registry()
    loaders = build_loaders(args)
    classes = PlantDataset(args.dataset_dir, "val").classes
    model = build_model(len(classes), pretrained=not args.no_pretrained).to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)
    writer = SummaryWriter(run_dir / "tb")
    stages = [
        ("head", args.head_epochs, args.head_lr, True),
        ("full", args.full_epochs, args.full_lr, False),
    ]
    best_key, epoch = (-1.0, -1.0), 0
    with (run_dir / "metrics.csv").open("w", newline="", encoding="utf-8") as f:
        log = csv.writer(f)
        log.writerow(METRIC_COLUMNS)
        for name, epochs, lr, frozen in stages:
            if epochs == 0:
                continue
            params = set_stage(model, frozen)
            optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=args.weight_decay)
            scheduler = (
                None
                if frozen
                else torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
            )
            for _ in range(epochs):
                epoch += 1
                started = time.time()
                current_lr = optimizer.param_groups[0]["lr"]
                train_loss = train_epoch(
                    model, loaders["train"], optimizer, criterion, device,
                    f"{name} {epoch}", frozen,
                )  # fmt: skip
                if scheduler:
                    scheduler.step()
                val = validate(model, loaders["val"], device, args, registry, classes)
                field_product = val["crop_masked_product_by_domain"]["field"]["macro_f1"]
                row = [
                    epoch, name, train_loss, val["loss"], val["acc"], val["macro_f1"],
                    val["by_domain"]["lab"]["macro_f1"], val["by_domain"]["field"]["macro_f1"],
                    field_product, current_lr, time.time() - started,
                ]  # fmt: skip
                log.writerow([f"{v:.6f}" if isinstance(v, float) else v for v in row])
                f.flush()
                for column, value in zip(METRIC_COLUMNS[2:], row[2:], strict=True):
                    writer.add_scalar(column, value, epoch)
                print(
                    f"epoch {epoch:2d} [{name}] train_loss={train_loss:.4f} "
                    f"val_loss={val['loss']:.4f} val_acc={val['acc']:.4f} "
                    f"val_macro_f1={val['macro_f1']:.4f} time={row[-1]:.0f}s",
                    flush=True,
                )
                scores = {
                    "val_macro_f1": val["macro_f1"],
                    "val_field_product_macro_f1": field_product,
                }
                key = selection_key(args.selection_metric, scores)
                if key > best_key:
                    best_key = key
                    torch.save({"model": model.state_dict(), "classes": classes},
                               run_dir / "best.pt")  # fmt: skip
    writer.close()


def finalize(args, run_dir: Path, device: torch.device, status: str) -> None:
    """Write results.json, then re-score the best checkpoint on the full val split.

    The status is saved first, so a failure while scoring cannot lose it.
    """
    epochs = []
    if (run_dir / "metrics.csv").exists():
        with (run_dir / "metrics.csv").open(encoding="utf-8") as f:
            epochs = list(csv.DictReader(f))
    best = max(epochs, key=lambda r: selection_key(args.selection_metric, r), default=None)
    results = {
        "status": status,
        "best_epoch": int(best["epoch"]) if best else 0,
        "selection_metric": args.selection_metric,
    }
    write_json(run_dir / "results.json", results)
    if epochs:
        plot_curves(run_dir / "metrics.csv", run_dir / "curves.png")
    if not (run_dir / "best.pt").exists():
        return
    try:
        checkpoint = torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True)
        classes = checkpoint["classes"]
        model = build_model(len(classes), pretrained=False)
        model.load_state_dict(checkpoint["model"])
        model.to(device)
        for split in ["val", "test"] if args.eval_test else ["val"]:
            metrics, logits, targets, field = evaluate_split(
                model, args.dataset_dir, split, device, args.batch_size, args.num_workers,
                bootstrap=args.bootstrap, run_dir=run_dir,
            )  # fmt: skip
            results[split] = metrics
            title = f"{args.id} — {split}"
            plot_confusion(logits, targets, classes, run_dir / f"confusion_{split}.png", title)
            plot_confusion(
                logits, targets, classes, run_dir / f"confusion_{split}_field.png",
                f"{title} (field photos)", mask=field,
            )  # fmt: skip
        (run_dir / "class_index.json").write_text(
            (args.dataset_dir / "class_index.json").read_text(encoding="utf-8"), encoding="utf-8"
        )
        write_json(
            run_dir / "model_card.json",
            model_card(args, run_dir, classes, results["best_epoch"], results["val"]),
        )
    except Exception as exc:  # keep the training status, record why scoring failed
        results["scoring_error"] = f"{type(exc).__name__}: {exc}"
    write_json(run_dir / "results.json", results)


def data_sources() -> list[dict]:
    """Where the training images come from and under which licenses (ml/data_sources.yaml)."""
    with (ML_DIR / "data_sources.yaml").open(encoding="utf-8") as f:
        sources = yaml.safe_load(f)["sources"]
    return [
        {"name": name, "kind": s["kind"], "license": s["license"], "url": s["url"]}
        for name, s in sources.items()
    ]


def model_card(args, run_dir: Path, classes: list[str], epoch: int, val: dict) -> dict:
    """Everything needed to publish the checkpoint: copy model.pt, class_index.json, this card."""
    return {
        "source_run": args.id,
        "checkpoint_epoch": epoch,
        "checkpoint_sha256": hashlib.sha256((run_dir / "best.pt").read_bytes()).hexdigest(),
        "class_index_sha256": hashlib.sha256(
            (run_dir / "class_index.json").read_bytes()
        ).hexdigest(),
        "calibrated": False,  # confidences are raw softmax values until A7
        "checkpoint_format": "torch.save({'model': state_dict, 'classes': [codes]})",
        "architecture": "efficientnet_b0",
        "num_classes": len(classes),
        "classes_version": json.loads((args.dataset_dir / "class_index.json").read_text())[
            "classes_version"
        ],
        "dataset_version": args.dataset_dir.name,
        "input_size": IMAGE_SIZE,
        "preprocessing": "resize 256 -> center crop 224 -> ImageNet normalization",
        "normalize_mean": list(MEAN),
        "normalize_std": list(STD),
        "val_macro_f1": val["macro_f1"],
        "val_crop_masked_product_macro_f1": val["crop_masked_product_macro_f1"],
        "val_field_macro_f1": val["by_domain"]["field"]["macro_f1"],
        "val_field_crop_masked_product_macro_f1": val["crop_masked_product_by_domain"]["field"][
            "macro_f1"
        ],
        "data_sources": data_sources(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "torchvision": torchvision.__version__,
        **git_info(),
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--id", required=True, help="run ID, e.g. A5-E001")
    p.add_argument("--objective", required=True)
    p.add_argument("--hypothesis", required=True)
    p.add_argument("--parent", default=None, help="run this one is compared with")
    p.add_argument("--dataset-dir", type=Path, default=ML_DIR / "datasets" / "v1")
    p.add_argument("--head-epochs", type=int, default=3)
    p.add_argument("--full-epochs", type=int, default=12)
    p.add_argument("--head-lr", type=float, default=1e-3)
    p.add_argument("--full-lr", type=float, default=1e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"])
    p.add_argument("--subset", type=float, default=1.0, help="fraction of train/val (smoke run)")
    p.add_argument("--no-balanced", dest="balanced", action="store_false")
    p.add_argument(
        "--selection-metric", choices=SELECTION_METRICS, default="val_macro_f1",
        help="metric that picks the best epoch (ties: overall macro-F1)",
    )  # fmt: skip
    p.add_argument("--aug", choices=AUGMENTATIONS, default="basic", help="train augmentations")
    p.add_argument(
        "--lab-cap", type=int, default=0,
        help="at most N laboratory photos per class in train (0 = all); val is not touched",
    )  # fmt: skip
    p.add_argument("--label-smoothing", type=float, default=0.0)
    p.add_argument(
        "--field-share", type=float, default=0.0,
        help="share of a class's draws that go to its field photos (0 = plain class balance)",
    )  # fmt: skip
    p.add_argument("--no-pretrained", action="store_true")
    p.add_argument("--eval-test", action="store_true", help="also score the test split")
    p.add_argument(
        "--bootstrap", type=int, default=1000,
        help="resamples for the 95%% intervals of the final scoring (0 = none)",
    )  # fmt: skip
    p.add_argument("--runs-dir", type=Path, default=RUNS_DIR)
    args = p.parse_args()
    if args.lab_cap < 0:
        p.error("--lab-cap must be 0 or positive")
    if not 0.0 <= args.label_smoothing < 1.0:
        p.error("--label-smoothing must be in [0, 1)")
    if not 0.0 <= args.field_share < 1.0:
        p.error("--field-share must be in [0, 1)")
    if args.field_share > 0 and not args.balanced:
        p.error("--field-share replaces the class-balanced sampler; drop --no-balanced")
    if args.eval_test and args.subset < 1.0:
        p.error("--eval-test is for full runs only; do not score test with a smoke model")
    return args


def main() -> None:
    args = parse_args()
    run_dir = args.runs_dir / args.id
    if run_dir.exists():
        raise SystemExit(f"{run_dir} exists — every run needs a new ID")
    run_dir.mkdir(parents=True)
    started = time.time()
    env: dict = {}
    status = "completed"
    device = torch.device("cpu")
    try:
        seed_everything(args.seed)
        device = resolve_device(args.device)
        classes_version = json.loads((args.dataset_dir / "class_index.json").read_text())[
            "classes_version"
        ]
        write_json(run_dir / "config.json", build_config(args, device, classes_version))
        env = {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "torchvision": torchvision.__version__,
            "device": str(device),
            "chip": chip_name(),
            "os": platform.platform(),
            **git_info(),
            "started_at": datetime.now().isoformat(timespec="seconds"),
        }
        run_training(args, run_dir, device)
    except KeyboardInterrupt:
        status = "stopped"
        raise SystemExit(130) from None
    except BaseException:
        status = "failed"
        raise
    finally:
        env["finished_at"] = datetime.now().isoformat(timespec="seconds")
        env["duration_s"] = round(time.time() - started)
        write_json(run_dir / "env.json", env)
        finalize(args, run_dir, device, status)
        print(f"{args.id}: {status}, artifacts in {run_dir}", flush=True)


if __name__ == "__main__":
    main()
