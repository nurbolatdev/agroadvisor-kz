# AgroAdvisor KZ — AI Service

Plant disease recognition service used by the backend.

## Scope (MVP)

- Crops: potato, tomato, corn, wheat
- Input: crop and leaf photo
- Output: disease class, confidence, photo quality assessment

API contract: [`docs/api/ai-predict.md`](../../docs/api/ai-predict.md) · classes: [`docs/ai/classes.md`](../../docs/ai/classes.md).

## Stack

Python 3.11+, FastAPI, PyTorch (EfficientNet-B0 via torchvision), Pillow, pytest, Ruff.

## Setup

From `services/ai-service`:

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

Then activate the environment: `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`).

Optional: `cp .env.example .env` and adjust settings (all `AI_*` variables have defaults).

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health — returns `503 model_not_loaded` until a model is loaded
- Interactive docs: http://localhost:8000/docs

## Test and lint

```bash
pytest
ruff check .
ruff format --check .
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `AI_CLASSES_PATH` | `ml/classes.yaml` | Class registry |
| `AI_WEIGHTS_DIR` | `ml/weights` | Model weights and `class_index.json` |
| `AI_DEVICE` | `auto` | `auto`, `cpu`, `cuda` or `mps` |
| `AI_MAX_IMAGE_MB` | `10` | Upload limit for `POST /predict` |
| `AI_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

## Structure

```
app/
├── main.py     # FastAPI app factory
├── api/        # HTTP endpoints
├── core/       # Settings, logging
├── models/     # Request and response schemas
└── services/   # Inference and image preprocessing
ml/
├── classes.yaml # Class registry — single source of truth
├── notebooks/  # Training and evaluation experiments
├── datasets/   # Local datasets (not committed)
└── weights/    # Trained model weights (not committed)
tests/
```

Datasets and weights are never committed: `ml/datasets/` and `ml/weights/` are in `.gitignore`.
