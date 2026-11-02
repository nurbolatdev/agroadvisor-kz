"""A tiny but real checkpoint for the loader tests."""

import hashlib
import json
from pathlib import Path

import torch
import torchvision

from app.core.config import Settings
from ml.registry import load_registry

REGISTRY = load_registry()
CODES = [c.code for c in REGISTRY.active()]


def write_weights(
    folder: Path, *, classes=None, temperature=2.0, version=None, **card_extra
) -> Settings:
    """Random head; by default the class order is deliberately not the registry's.

    `temperature=None` leaves the key out of the card. Returns Settings pointing at the folder."""
    classes = classes or list(reversed(CODES))
    folder.mkdir(parents=True)
    torch.manual_seed(0)
    model = torchvision.models.efficientnet_b0(weights=None)
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, len(classes))
    torch.save({"model": model.state_dict(), "classes": classes}, folder / "model.pt")
    index = {"classes_version": version or REGISTRY.version, "classes": classes}
    (folder / "class_index.json").write_text(json.dumps(index))
    card = {
        "architecture": "efficientnet_b0",
        "checkpoint_sha256": hashlib.sha256((folder / "model.pt").read_bytes()).hexdigest(),
        **card_extra,
    }
    if temperature is not None:
        card["temperature"] = temperature
    (folder / "model_card.json").write_text(json.dumps(card))
    return Settings(
        _env_file=None,
        model_kind="effnet",
        weights_dir=folder.parent,
        model_version=folder.name,
        device="cpu",
    )
