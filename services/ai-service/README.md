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

### Real model

Fetch the weights (`python -m ml.fetch_weights`, they are not in git), then run with
`AI_MODEL_KIND=effnet`. The default stays `placeholder` so the tests and a clone without weights
work. The model card must carry `temperature` (A7: `3.7935` for `effnet-b0-v1`); without it the
service logs a warning and never answers `ok` or `crop_mismatch`.

### Placeholder model

By default the service loads a **placeholder** model (`model_version`
`placeholder-v0`). It derives deterministic, pseudo-random probabilities from the image pixels and
knows nothing about plants: its answers must never be shown to farmers as a diagnosis. A startup
warning is logged. If the model cannot be loaded, `/health` and `/predict` answer `503`; set
`AI_REQUIRE_MODEL=true` to stop the service at startup instead.

### Docker

```bash
docker build -t agroadvisor-ai-service services/ai-service   # from the repository root
docker run --rm -p 8000:8000 -v "$PWD/services/ai-service/ml/weights:/srv/ml/weights:ro" agroadvisor-ai-service
```

The image installs CPU-only PyTorch, runs as a non-root user and needs no secrets. It serves the real model (`AI_MODEL_KIND=effnet`, `AI_REQUIRE_MODEL=true`), so it does not start without the mounted weights. To try it with the fake model: `-e AI_MODEL_KIND=placeholder -e AI_REQUIRE_MODEL=false`. With Compose: `docker compose --profile ai up -d ai-service` from `infra/`.

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
| `AI_WEIGHTS_DIR` | `ml/weights` | Folder with one subfolder per model version: `model.pt`, `class_index.json`, `model_card.json` |
| `AI_DEVICE` | `auto` | `auto`, `cpu`, `cuda` or `mps` |
| `AI_MODEL_KIND` | `placeholder` | `placeholder` (fake, for wiring and tests) or `effnet` (EfficientNet-B0 from `AI_WEIGHTS_DIR/AI_MODEL_VERSION`; fetch the weights first with `python -m ml.fetch_weights`) |
| `AI_MODEL_VERSION` | `effnet-b0-v1` | Weights subfolder loaded when `AI_MODEL_KIND=effnet`; startup checks `checkpoint_sha256`, `classes_version` and the class list against the registry |
| `AI_REQUIRE_MODEL` | `false` | Stop at startup if the model cannot be loaded |
| `AI_MAX_IMAGE_MB` | `10` | Upload limit for `POST /predict`, MiB |
| `AI_MAX_IMAGE_PIXELS` | `50000000` | Decoded image size limit |
| `AI_MIN_IMAGE_SIDE` | `224` | Shorter side below this is `too_small`, px |
| `AI_MIN_BRIGHTNESS` | `40` | Mean luminance (0–255) below this is `dark` |
| `AI_MIN_SHARPNESS` | `50` | Laplacian variance (at 512 px) below this is `blurry` |
| `AI_OK_THRESHOLD` | `0.70` | Confidence for status `ok` |
| `AI_LOW_THRESHOLD` | `0.25` | Confidence for `low_confidence`; below it the status is `unknown` |
| `AI_CROP_MISMATCH_THRESHOLD` | `0.70` | Confidence of another crop that triggers `crop_mismatch` (calibrated model only) |
| `AI_UNKNOWN_THRESHOLD` | `0.5` | Probability of `unknown` inside the crop from which the photo is "not recognized" |
| `AI_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

Status thresholds come from the A7 calibration of A5-E001 (`docs/ai/evaluation.md`). Photo-quality thresholds are still preliminary.

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
