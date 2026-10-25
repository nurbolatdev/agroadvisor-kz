# Training experiments

Every training or evaluation run has an ID (`<task>-E<NNN>`) and a folder `services/ai-service/ml/runs/<ID>/` (not in git). This file records the results. Selection of the best checkpoint uses validation macro-F1 only; the test split is not used for tuning.

| ID | Status | Change | Val macro-F1 | Crop-masked macro-F1 | Field macro-F1 |
| --- | --- | --- | --- | --- | --- |
| A5-E001 | completed | Baseline, two-stage fine-tuning, balanced sampler | 0.9557 | 0.9607 | 0.699 |

## A5-E001 — baseline

**Status:** completed, best epoch 15 of 15 (3 head epochs + 12 full-network epochs).

**Objective.** An honest baseline for EfficientNet-B0 on dataset v1 (20 classes, classes v1).

**Hypothesis.** Two-stage fine-tuning with a class-balanced sampler gives a solid starting point; photos taken in the field will score clearly below laboratory photos.

**Data.** Dataset `v1`: 17 748 train / 3 809 val / 3 795 test images; split grouped by source leaf so near-duplicates do not cross splits. Test was not evaluated.

**Model and parameters.** torchvision EfficientNet-B0, ImageNet weights, new 20-class head. Stage 1: head only, AdamW, lr 1e-3, 3 epochs. Stage 2: whole network, AdamW, lr 1e-4 with cosine decay to zero, 12 epochs. Weight decay 1e-4, batch size 32, seed 42, 224 px input, class-balanced sampler, augmentation: random resized crop, flips, rotation, color jitter, blur. Apple M4 (MPS), 5098 s in total, about 6 minutes per full-network epoch.

**Results (validation).**

| Subset | n | Accuracy | Macro-F1 |
| --- | --- | --- | --- |
| Overall | 3809 | 0.9614 | 0.9557 |
| Crop-masked (crop chosen by the user) | — | 0.9644 | 0.9607 |
| Laboratory photos | 2479 | 0.986 | 0.981 |
| Field photos | 1105 | 0.899 | 0.699 |
| Other | 225 | 1.000 | 1.000 |

Top-3 accuracy 0.990. `unknown`: precision 0.960, recall 0.987. The weakest classes by F1 are `corn__gray_leaf_spot` (0.893), `tomato__early_blight` (0.925) and `corn__northern_leaf_blight` (0.935).

Per-class results on field photos only (the same checkpoint, scored again after the per-class field metrics were added; the overall numbers did not change). Classes with field photos in validation, worst first:

| Class | Field photos | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| `tomato__early_blight` | 13 | 0.42 | 0.38 | 0.40 |
| `tomato__bacterial_spot` | 17 | 0.50 | 0.35 | 0.41 |
| `tomato__healthy` | 10 | 0.57 | 0.40 | 0.47 |
| `potato__late_blight` | 16 | 0.47 | 0.50 | 0.48 |
| `tomato__leaf_mold` | 14 | 0.60 | 0.43 | 0.50 |
| `potato__early_blight` | 17 | 0.53 | 0.47 | 0.50 |
| `tomato__septoria_leaf_spot` | 23 | 0.56 | 0.61 | 0.58 |
| `tomato__late_blight` | 17 | 0.69 | 0.53 | 0.60 |
| `corn__gray_leaf_spot` | 10 | 0.54 | 0.70 | 0.61 |
| `tomato__mosaic_virus` | 8 | 0.62 | 0.62 | 0.62 |
| `corn__northern_leaf_blight` | 29 | 0.81 | 0.76 | 0.79 |
| `corn__common_rust` | 17 | 1.00 | 0.76 | 0.87 |
| `unknown` | 120 | 0.87 | 0.97 | 0.92 |
| `wheat__septoria` | 67 | 0.93 | 0.96 | 0.94 |
| `wheat__leaf_rust` | 198 | 0.95 | 0.96 | 0.96 |
| `wheat__healthy` | 156 | 0.97 | 0.96 | 0.96 |
| `wheat__stripe_rust` | 203 | 0.97 | 0.99 | 0.98 |
| `wheat__powdery_mildew` | 170 | 0.99 | 0.97 | 0.98 |

Wheat has hundreds of field photos and is recognised well. Tomato, potato and corn have 8–29 field photos per class and score between 0.40 and 0.87 F1. With so few images these per-class numbers are noisy.

**Limitations.**
- Most validation images are laboratory photos, so the overall numbers say little about field quality. The field macro-F1 of 0.699 is much lower than the laboratory 0.981.
- Field accuracy is inflated by wheat: most field validation photos are wheat or `unknown`. The weak field results come from tomato, potato and corn, which also have the fewest field photos in training.
- `potato__healthy` and `corn__healthy` have laboratory photos only.
- `unknown` is trained on other plants and objects; it does not recognise unknown diseases.
- One configuration and one seed; confidence is not calibrated (planned in A7).

**Conclusion.** The baseline reaches 0.956 macro-F1 on validation, but the gap between laboratory and field photos is the main weakness.

**Model artifact.** The best checkpoint (epoch 15) is stored locally as `ml/weights/effnet-b0-v1/` (`model.pt`, `class_index.json`, `model_card.json`). It is a baseline and research artifact, not a production model; the folder is outside git. The checkpoint can be reproduced with `python -m ml.train --id A5-E001 ... --head-epochs 3 --full-epochs 12`; its SHA-256 is in `model_card.json`.

**Next step.** Run A5-E002 with a sampler that favours field photos (parent A5-E001), with the same split, preprocessing and metrics. A sampler repeats the few field photos more often and does not add new ones, so it may also overfit them. Compare field macro-F1, the per-class field metrics and the laboratory results, and keep E001 available. The test split stays untouched until the final evaluation of a selected model.
