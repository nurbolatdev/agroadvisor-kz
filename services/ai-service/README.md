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
- Try a prediction: `curl -F image=@leaf.jpg -F crop=tomato http://localhost:8000/predict`

### Placeholder model

Until trained weights exist, the service loads a **placeholder** model (`model_version`
`placeholder-v0`). It derives deterministic, pseudo-random probabilities from the image pixels and
knows nothing about plants: its answers must never be shown to farmers as a diagnosis. A startup
warning is logged. If the model cannot be loaded, `/health` and `/predict` answer `503`; set
`AI_REQUIRE_MODEL=true` to stop the service at startup instead.

### Docker

```bash
docker build -t agroadvisor-ai-service services/ai-service   # from the repository root
docker run --rm -p 8000:8000 agroadvisor-ai-service
```

The image installs CPU-only PyTorch, runs as a non-root user and needs no secrets or mounted files.

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
| `AI_MODEL_KIND` | `placeholder` | Model to load; only `placeholder` exists so far |
| `AI_REQUIRE_MODEL` | `false` | Stop at startup if the model cannot be loaded |
| `AI_MAX_IMAGE_MB` | `10` | Upload limit for `POST /predict`, MiB |
| `AI_MAX_IMAGE_PIXELS` | `50000000` | Decoded image size limit |
| `AI_MIN_IMAGE_SIDE` | `224` | Shorter side below this is `too_small`, px |
| `AI_MIN_BRIGHTNESS` | `40` | Mean luminance (0–255) below this is `dark` |
| `AI_MIN_SHARPNESS` | `50` | Laplacian variance (at 512 px) below this is `blurry` |
| `AI_OK_THRESHOLD` | `0.70` | Confidence for status `ok` |
| `AI_LOW_THRESHOLD` | `0.40` | Confidence for `low_confidence`; below it the status is `unknown` |
| `AI_CROP_MISMATCH_THRESHOLD` | `0.70` | Confidence of another crop that triggers `crop_mismatch` |
| `AI_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

Quality and status thresholds are preliminary and will be tuned after evaluation and calibration.

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
