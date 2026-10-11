# AgroAdvisor KZ — AI Service

Plant disease recognition service used by the backend.

## Scope (MVP)

- Crops: potato, tomato, corn, wheat
- Input: crop and leaf photo
- Output: disease class, confidence, photo quality assessment

## Stack

Python, FastAPI, PyTorch.

## Structure

```
app/
├── api/        # HTTP endpoints
├── core/       # Settings, logging
├── models/     # Request and response schemas
└── services/   # Inference and image preprocessing
ml/
├── notebooks/  # Training and evaluation experiments
├── datasets/   # Local datasets (not committed)
└── weights/    # Trained model weights (not committed)
tests/
```
