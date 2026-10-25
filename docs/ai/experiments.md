# Training experiments

Every training or evaluation run has an ID (`<task>-E<NNN>`) and a folder `services/ai-service/ml/runs/<ID>/` (not in git). This file records the results. Selection of the best checkpoint uses validation macro-F1 only; the test split is not used for tuning.

The headline metric is **crop-masked macro-F1 with `unknown`** (`crop_masked_product_*`): the answer is restricted to the classes of the crop the farmer selected plus `unknown`, exactly as `/predict` answers (step 5 in `app/services/predict.py`). It is reported on the whole validation split and separately on field photos. "Crop classes only" is an auxiliary metric. Plain overall macro-F1 is kept for reference.

| ID | Status | Change | Crop-masked macro-F1 (val) | Crop-masked macro-F1 (val, field) | Overall macro-F1 | Field macro-F1 (unmasked) |
| --- | --- | --- | --- | --- | --- | --- |
| A5-E001 | completed | Baseline, two-stage fine-tuning, balanced sampler | 0.9619 | 0.7325 | 0.9557 | 0.699 |

## A5-E001 — baseline

**Status:** completed, best epoch 15 of 15 (3 head epochs + 12 full-network epochs).

**Objective.** An honest baseline for EfficientNet-B0 on dataset v1 (20 classes, classes v1).

**Hypothesis.** Two-stage fine-tuning with a class-balanced sampler gives a solid starting point; photos taken in the field will score clearly below laboratory photos.

**Data.** Dataset `v1`: 17 748 train / 3 809 val / 3 795 test images; split grouped by source leaf so near-duplicates do not cross splits. Test was not evaluated for A5-E001 (see the note on the trial run below).

**Model and parameters.** torchvision EfficientNet-B0, ImageNet weights, new 20-class head. Stage 1: head only, AdamW, lr 1e-3, 3 epochs. Stage 2: whole network, AdamW, lr 1e-4 with cosine decay to zero, 12 epochs. Weight decay 1e-4, batch size 32, seed 42, 224 px input, class-balanced sampler, augmentation: random resized crop, flips, rotation, color jitter, blur. Apple M4 (MPS), 5098 s in total, about 6 minutes per full-network epoch.

**Results (validation).**

| Subset | n | Accuracy | Macro-F1 |
| --- | --- | --- | --- |
| Overall | 3809 | 0.9614 | 0.9557 |
| **Crop-masked + `unknown` (headline)** | 3344 | 0.9620 | **0.9619** |
| **Crop-masked + `unknown`, field photos (headline)** | 985 | 0.9015 | **0.7325** |
| Crop-masked + `unknown`, laboratory photos | 2359 | 0.9873 | 0.9847 |
| Crop-masked, crop classes only (auxiliary) | 3344 | 0.9644 | 0.9607 |
| Laboratory photos (unmasked) | 2479 | 0.986 | 0.981 |
| Field photos (unmasked) | 1105 | 0.899 | 0.699 |
| Other (unmasked) | 225 | 1.000 | 1.000 |

Crop-masked numbers cover the 3344 images of a crop; the 465 `unknown` images are skipped because no crop is chosen for them. A crop photo that the model answers with `unknown` counts as an error, as in the product. The headline numbers on field photos only, per crop (macro-F1 / accuracy / photos):

| Crop | Macro-F1 | Accuracy | Field photos |
| --- | --- | --- | --- |
| tomato | 0.571 | 0.529 | 102 |
| potato | 0.688 | 0.667 | 33 |
| corn | 0.751 | 0.768 | 56 |
| wheat | 0.966 | 0.969 | 794 |

Tomato and potato are the main target of the next experiment.

Top-3 accuracy 0.990. `unknown`: precision 0.960, recall 0.987.

Per-class results on the whole validation split:

| Class | Support | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| `tomato__late_blight` | 302 | 0.966 | 0.940 | 0.953 |
| `tomato__early_blight` | 163 | 0.937 | 0.914 | 0.925 |
| `tomato__septoria_leaf_spot` | 289 | 0.956 | 0.969 | 0.962 |
| `tomato__bacterial_spot` | 336 | 0.976 | 0.961 | 0.969 |
| `tomato__leaf_mold` | 157 | 0.955 | 0.949 | 0.952 |
| `tomato__mosaic_virus` | 64 | 0.938 | 0.953 | 0.946 |
| `tomato__healthy` | 248 | 0.984 | 0.972 | 0.978 |
| `potato__late_blight` | 166 | 0.940 | 0.946 | 0.943 |
| `potato__early_blight` | 167 | 0.957 | 0.940 | 0.949 |
| `potato__healthy` | 23 | 0.885 | 1.000 | 0.939 |
| `corn__common_rust` | 196 | 1.000 | 0.980 | 0.990 |
| `corn__northern_leaf_blight` | 178 | 0.943 | 0.927 | 0.935 |
| `corn__gray_leaf_spot` | 86 | 0.868 | 0.919 | 0.893 |
| `corn__healthy` | 175 | 0.989 | 0.994 | 0.991 |
| `wheat__leaf_rust` | 198 | 0.950 | 0.965 | 0.957 |
| `wheat__stripe_rust` | 203 | 0.966 | 0.985 | 0.976 |
| `wheat__septoria` | 67 | 0.928 | 0.955 | 0.941 |
| `wheat__powdery_mildew` | 170 | 0.994 | 0.971 | 0.982 |
| `wheat__healthy` | 156 | 0.968 | 0.955 | 0.961 |
| `unknown` | 465 | 0.960 | 0.987 | 0.973 |

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

**Conclusion.** The baseline reaches 0.956 macro-F1 on validation, but the gap between laboratory and field photos is the main weakness. The best epoch is the last one (15 of 15) and validation loss was still falling slowly, so the model may be undertrained; a longer schedule is worth testing too.

**Model artifact.** The best checkpoint (epoch 15) is published as the preliminary model `effnet-b0-v1` (`calibrated: false`): until confidences are calibrated (A7) the service must not answer `ok`, at most `low_confidence`. The files `model.pt`, `class_index.json` and `model_card.json` (data sources with licenses, SHA-256 of both files, versions) go to the GitHub Release `model-effnet-b0-v1`; `python -m ml.fetch_weights effnet-b0-v1` downloads them into `ml/weights/effnet-b0-v1/` and verifies the checksums. The weights are not in git (no LFS). The fallback is to retrain: a repeat needs a new ID and the same arguments, `python -m ml.train --id <new ID> --objective ... --hypothesis ... --head-epochs 3 --full-epochs 12` (all other parameters are defaults: lr 1e-3 / 1e-4, weight decay 1e-4, batch size 32, seed 42, balanced sampler); results on MPS vary slightly between runs.

**Environment.** Python 3.12.10, torch 2.14.1, torchvision 0.29.1. Python 3.12 is accepted for training and for the service image (`python:3.12-slim`); the package keeps `requires-python >= 3.11`.

**Next step.** Run A5-E002 with a sampler that favours field photos (parent A5-E001), with the same split, preprocessing and metrics; the main comparison metric is the crop-masked macro-F1 with `unknown` on field photos of tomato and potato. A sampler repeats the few field photos more often and does not add new ones, so it may also overfit them. Compare field macro-F1, the per-class field metrics and the laboratory results, and keep E001 available. The test split stays untouched until the final evaluation of a selected model.

## A5-TRIAL — speed check (not an experiment)

A smoke run on 5 % of the train and validation images (1 head epoch + 1 full epoch) to measure epoch time on the Apple M4 (MPS); it did not follow the `<task>-E<NNN>` ID format. It reached 0.556 macro-F1 on validation. By mistake it was started with `--eval-test`, so the test split was scored once with this smoke model (macro-F1 0.571, accuracy 0.586). Its test numbers were not used to choose any parameter (only its epoch time informed the plan), and `--eval-test` is now refused for runs on a subset.
