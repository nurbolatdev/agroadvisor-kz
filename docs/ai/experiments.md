# Training experiments

Every training or evaluation run has an ID (`<task>-E<NNN>`) and a folder `services/ai-service/ml/runs/<ID>/` (not in git). This file records the results. Selection of the best checkpoint uses validation macro-F1 only; the test split is not used for tuning.

The headline metric is **crop-masked macro-F1 with `unknown`** (`crop_masked_product_*`): the answer is restricted to the classes of the crop the farmer selected plus `unknown`, exactly as `/predict` answers (step 5 in `app/services/predict.py`). It is reported on the whole validation split and separately on field photos. "Crop classes only" is an auxiliary metric. Plain overall macro-F1 is kept for reference.

Training options (all off by default, so earlier runs stay reproducible): `--selection-metric val_field_product_macro_f1` picks the best epoch by the crop-masked macro-F1 with `unknown` on field photos, with overall macro-F1 breaking ties (`metrics.csv` has this column); `--aug strong` adds tighter crops, TrivialAugment, JPEG compression, sensor noise and random erasing; `--lab-cap N` keeps at most N laboratory photos per class in train (validation is never capped, the kept photos are drawn with the seed); `--label-smoothing` smooths the training loss only; `--field-share` is described in A5-E002.

| ID | Status | Change | Crop-masked macro-F1 (val) | Crop-masked macro-F1 (val, field) | Overall macro-F1 | Field macro-F1 (unmasked) |
| --- | --- | --- | --- | --- | --- | --- |
| A5-E001 | completed | Baseline, two-stage fine-tuning, balanced sampler | 0.9619 | 0.7325 | 0.9557 | 0.699 |
| A5-E002 | completed, criterion not met | E001 + field photos are 35 % of the draws in classes that have them | 0.9620 | 0.7338 | 0.9555 | 0.684 |
| A10-E001 | completed, criterion not met | A5-E001 recipe on dataset v2 (scored on v2 validation, without the training photos of A5-E001) | 0.951 | 0.841 | 0.9456 | — |
| A6-E001 | completed | Scoring of A5-E001 and A10-E001 on v2 `val`, `test`, `bench` (same photos for both); top-3 inside the crop added. Best on `bench`: A5-E001, 0.564 (0.547–0.581) | — | — | — | — |

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

**95 % bootstrap intervals** (1000 resamples, seed 42, same checkpoint scored again; the point values did not change). The unit of resampling is the group of photos from `splits.csv` (photos of one leaf and near-duplicates), not a single photo, inside each slice. The validation split has 3096 groups for 3344 crop photos, and 920 groups for 985 field photos (tomato 100 groups for 102 photos, potato 32 for 33, corn 53 for 56, wheat 735 for 794), so groups are mostly single photos here.

| Headline metric (crop-masked + `unknown`) | Value | 95 % interval |
| --- | --- | --- |
| Overall (3344 photos) | 0.9619 | 0.953 – 0.970 |
| Field | 0.7325 | 0.670 – 0.780 |
| Field tomato (102) | 0.5706 | 0.452 – 0.659 |
| Field potato (33) | 0.6882 | 0.529 – 0.855 |
| Field corn (56) | 0.7515 | 0.609 – 0.873 |
| Field wheat (794) | 0.9656 | 0.948 – 0.980 |

The field intervals of tomato, potato and corn are 0.21 – 0.33 wide. Differences of 0.02 – 0.05 between two runs cannot be told apart from noise on this validation set.

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
- **Wheat is practically one source.** Found while building dataset v2: most of the Kaggle wheat photos are copies of the John Innes photos (1 504 exact copies, Long et al., Plant Pathology 2023). The very good wheat field results here (F1 0.94–0.98) do not show that the model works on wheat photos from other places; it is not an independent test of transfer.
- `unknown` is trained on other plants and objects; it does not recognise unknown diseases.
- One configuration and one seed; confidence is not calibrated (planned in A7).

**Re-scored on dataset v2** (same checkpoint, `python -m ml.evaluate ml/runs/A5-E001 --dataset-dir ml/datasets/v2 --split <val|bench> --bootstrap 1000`). The v2 split was made again, so 2 493 of the 5 170 v2 validation photos (48 %) were in the v1 training set of this model; they are left out by MD5 (31 of the bench photos too), and the rest is scored. Crop-masked macro-F1 with `unknown`, 95 % group-bootstrap intervals:

| Subset | Crop photos | Overall | Field | Field tomato | Field potato | Field corn | Field wheat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 validation (original) | 3 344 | 0.962 | 0.733 | 0.571 | 0.688 | 0.751 | 0.966 |
| v2 validation, without v1-train photos | 2 398 | 0.718 (0.697–0.738) | 0.509 (0.481–0.536) | 0.209–0.278 | 0.291–0.373 | 0.438–0.630 | 0.930–0.991 |
| v2 bench (PlantWild, PlantSeg) | 2 792 | 0.564 (0.547–0.581) | 0.564 (0.546–0.581) | 0.509–0.565 | 0.657–0.745 | 0.648–0.721 | **0.410–0.478** |

The model trained on laboratory photos and PlantDoc transfers poorly to the new field sources, and wheat, which looked excellent on v1, drops to 0.41–0.48 on photos from other places: the v1 wheat result came from one source. "Crop photos" are the photos of the four crops that the crop-masked metric is computed on (`unknown` photos are scored separately; 2 677 v2 validation photos are scored after the exclusion). These numbers are the baseline for A10-E001; both runs must be scored on the same photos (`--exclude-train-of`). A10 chooses its best epoch on v2 validation and A5-E001 never saw it, so v2 validation only guides; the verdict of A5 against A10 is taken on `bench` and `test`.

**Conclusion.** The baseline reaches 0.956 macro-F1 on validation, but the gap between laboratory and field photos is the main weakness. The best epoch is the last one (15 of 15) and validation loss was still falling slowly, so the model may be undertrained; a longer schedule is worth testing too.

**Model artifact.** The best checkpoint (epoch 15) is published as the preliminary model `effnet-b0-v1` (`calibrated: false`): until confidences are calibrated (A7) the service must not answer `ok`, at most `low_confidence`. The files `model.pt`, `class_index.json` and `model_card.json` (data sources with licenses, SHA-256 of both files, versions) go to the GitHub Release `model-effnet-b0-v1`; `python -m ml.fetch_weights effnet-b0-v1` downloads them into `ml/weights/effnet-b0-v1/` and verifies the checksums. The weights are not in git (no LFS). The fallback is to retrain: a repeat needs a new ID and the same arguments, `python -m ml.train --id <new ID> --objective ... --hypothesis ... --head-epochs 3 --full-epochs 12` (all other parameters are defaults: lr 1e-3 / 1e-4, weight decay 1e-4, batch size 32, seed 42, balanced sampler); results on MPS vary slightly between runs.

**Environment.** Python 3.12.10, torch 2.14.1, torchvision 0.29.1. Python 3.12 is accepted for training and for the service image (`python:3.12-slim`); the package keeps `requires-python >= 3.11`.

**Next step.** Run A5-E002 with a sampler that favours field photos (parent A5-E001), with the same split, preprocessing and metrics; the main comparison metric is the crop-masked macro-F1 with `unknown` on field photos of tomato and potato. A sampler repeats the few field photos more often and does not add new ones, so it may also overfit them. Compare field macro-F1, the per-class field metrics and the laboratory results, and keep E001 available. The test split stays untouched until the final evaluation of a selected model.

## A5-E002 — sampler that favours field photos

**Status:** completed, best epoch 13 of 15 (selected by overall validation macro-F1). Parent: A5-E001.

**Objective.** Raise the quality on field photos of tomato and potato.

**Hypothesis and success criterion (fixed before the run).** Field crop-masked macro-F1 (with `unknown`) improves by 0.05 or more for tomato and for potato versus A5-E001, while lab macro-F1 drops by no more than 0.01 and the field metrics of wheat and corn drop by no more than 0.02. A sampler repeats the few field photos and adds none, so it may also overfit them.

**What changed.** Only the sampler: classes are still drawn equally often, and in a class that has both field and other photos, 35 % of the draws go to its field photos (`--field-share 0.35`). In E001 field photos were 4–16 % of the training images of tomato, potato and corn classes; `unknown` (26 % field photos) was moved to 35 % as well, and the wheat classes (field photos only) keep plain 1/count weights. Everything else as in A5-E001: same split, preprocessing, metrics, seed 42, 3 head epochs + 12 full-network epochs. Commit `5dfdbc9`, 5157 s on the Apple M4.

**Results (validation), E001 → E002.**

| Metric | E001 | E002 | Change |
| --- | --- | --- | --- |
| Crop-masked + `unknown`, overall | 0.9619 | 0.9620 | +0.0001 |
| Crop-masked + `unknown`, laboratory | 0.9847 | 0.9834 | −0.0013 |
| Crop-masked + `unknown`, field | 0.7325 | 0.7338 | +0.0013 |
| Field tomato (102 photos) | 0.5706 | 0.5876 | +0.0169 |
| Field potato (33 photos) | 0.6882 | 0.6877 | −0.0005 |
| Field corn (56 photos) | 0.7515 | 0.7132 | −0.0382 |
| Field wheat (794 photos) | 0.9656 | 0.9695 | +0.0039 |
| Overall macro-F1 (no mask) | 0.9557 | 0.9555 | −0.0003 |
| Field macro-F1 (no mask) | 0.699 | 0.684 | −0.015 |

Per-class F1 on field photos (no mask), E001 → E002 (photos in validation). Tomato, all seven classes: `tomato__late_blight` 0.60 → 0.61 (17), `tomato__early_blight` 0.40 → 0.52 (13), `tomato__septoria_leaf_spot` 0.58 → 0.63 (23), `tomato__bacterial_spot` 0.41 → 0.33 (17), `tomato__leaf_mold` 0.50 → 0.46 (14), `tomato__mosaic_virus` 0.63 → 0.63 (8), `tomato__healthy` 0.47 → 0.35 (10). Others: `unknown` 0.92 → 0.91 (120; recall 0.975 → 0.950), `potato__early_blight` 0.50 → 0.45 (17), `potato__late_blight` 0.48 → 0.47 (16), `corn__common_rust` 0.87 → 0.76 (17), `corn__gray_leaf_spot` 0.61 → 0.50 (10), `corn__northern_leaf_blight` 0.79 → 0.85 (29). Wheat classes stay at 0.94–0.98.

**Learning curves.** Training loss falls to 0.064 while validation loss improves only slightly after epoch 9 (0.177 → 0.164), and validation field macro-F1 stays flat between 0.65 and 0.68 from epoch 5 on. More repetitions of the same few field photos did not add generalisation.

**Intervals of E002 itself** (95 %, group bootstrap, 1000 resamples), crop-masked + `unknown`: overall 0.9620 (0.954 – 0.969), field 0.7338 (0.676 – 0.778), field tomato 0.5876 (0.465 – 0.674), potato 0.6877 (0.526 – 0.840), corn 0.7132 (0.582 – 0.843), wheat 0.9695 (0.955 – 0.982).

**Intervals (paired bootstrap of groups on the same validation photos, E002 minus E001, 1000 resamples).**

| Headline metric | Difference | 95 % interval of the difference | Significant |
| --- | --- | --- | --- |
| Overall | +0.0001 | −0.006 … +0.006 | no |
| Field | +0.0013 | −0.035 … +0.035 | no |
| Field tomato | +0.0169 | −0.052 … +0.088 | no |
| Field potato | −0.0005 | −0.115 … +0.110 | no |
| Field corn | −0.0382 | −0.106 … 0.000 | no (the upper bound touches 0) |
| Field wheat | +0.0039 | −0.008 … +0.016 | no |

**Limitations.** Tomato and potato have only 8–23 field photos per class in validation (102 and 33 in total), so their intervals are 0.21 – 0.33 wide (see the table above); there is no repeat with another seed. `potato__healthy` and `corn__healthy` have laboratory photos only. The wheat result (field F1 0.97) comes from practically one source (see the limitations of A5-E001: the Kaggle wheat set is mostly copies of the John Innes photos) and does not prove transfer. The test split was not used.

**Conclusion.** The success criterion is not met: tomato improved by 0.017 and potato did not change, while both needed +0.05. That alone settles the verdict against the pre-set criterion. With intervals the honest reading is: **no significant effect** of the sampler on tomato, potato, corn or the field as a whole (every difference interval contains 0). The corn drop (−0.038, interval −0.106 … 0.000) touches 0 at its upper bound, so a small harm can neither be confirmed nor excluded. Laboratory quality did not change. Sampling field photos more often does not help on its own, and a repeat with another seed is not planned.

**Next step.** A5-E003: stronger background and lighting augmentation (smaller crops, stronger color changes, random erasing or blur of the background) on top of the same sampler, parent A5-E002, with a success criterion fixed beforehand. `--field-share 0.5` is not tried because the curves already show no gain from repeating field photos.

## A10-E001 — the baseline recipe on dataset v2

**Status:** completed, best epoch 13 of 23 (3 head + 20 full-network epochs), chosen by `val_field_product_macro_f1`.

**Objective.** Check whether the new field sources of dataset v2 improve the model on photos taken in other places.

**Hypothesis.** Adding field sources raises the field crop-masked macro-F1 above A5-E001 (0.509) and the `bench` score above 0.564.

**Data.** Dataset `v2`, laboratory photos capped at 400 per class (`--lab-cap 400`), the same split rules as before; `bench` (PlantWild, PlantSeg) is never trained on.

**Model and parameters.** The A5-E001 recipe: EfficientNet-B0, ImageNet weights, class-balanced sampler, basic augmentation, AdamW (lr 1e-3 for the head, 1e-4 for the full network, cosine decay), batch 32, seed 42, Apple M4 (MPS), about 4–7 minutes per epoch.

**Results.** Both models are scored on the same photos (`--exclude-train-of ml/runs/A5-E001`), paired bootstrap with 1 000 resamples, 95 % intervals.

| Subset | Crop photos | A5-E001 | A10-E001 | Difference |
| --- | --- | --- | --- | --- |
| v2 validation, all crops | 2 398 | 0.718 | 0.951 | +0.233 (0.213 … 0.253) |
| v2 validation, field | — | 0.509 | 0.841 (0.784 … 0.888) | +0.332 (0.274 … 0.382) |
| `bench`, all crops (all field) | 2 792 | 0.564 | 0.530 | **−0.034 (−0.052 … −0.018)** |
| `bench`, tomato | — | 0.537 | 0.483 | −0.053 (−0.082 … −0.023) |
| `bench`, corn | — | 0.685 | 0.657 | −0.028 (−0.063 … 0.005) |
| `bench`, potato | — | 0.702 | 0.686 | −0.016 (−0.065 … 0.032) |
| `bench`, wheat | — | 0.445 | 0.425 | −0.020 (−0.050 … 0.009) |

**Limitations.**
- The v2 validation split comes from the same sources as the v2 training split and the best epoch was chosen on it, so its gain is a guide only; the verdict is taken on `bench`.
- Wheat on `bench` stays at 0.43–0.45 for both models: the wheat photos of dataset v1 are practically one source.
- The `test` split was not scored (it is kept for candidate models). `bench` has no photos of healthy tomato, potato, corn or wheat, and `unknown` is not scored on it.
- One configuration and one seed.

**Conclusion.** The criterion is not met. More field photos from known sources made the model much better on its own validation split, but on independent sources it is significantly worse than the baseline (−0.034, interval below 0), mainly because of tomato. Adding data of this kind with the same recipe does not improve transfer to new places.

**Next step.** A10-E002, one change at a time: stronger augmentation (`--aug strong`), then a larger share of field photos or label smoothing, each with the same scoring and the same criterion.

## A6-E001 — evaluation of the two candidates on `val`, `test` and `bench`

**Status:** part 1 completed (`val`, `test`, `bench`); the own photo set `own` is not collected, so A6 stays open. No training: two finished runs are scored (A5-E001, A10-E001); the scores are stored in their `results.json` under `val@v2`, `test@v2`, `bench@v2` (an evaluation run has no folder of its own). The full report is `docs/ai/evaluation.md`.

**Objective.** Measure how the candidates do on field photos of other sources (the situation of a farmer), compared with the target of 85 % correct answers and 95 % top-3.

**Hypothesis (fixed before scoring).** The numbers on `val` and `test` of dataset v2 overstate the quality on independent photos, because those splits share their sources with the training photos; `bench` shows the real level.

**Data.** Dataset v2, splits `val`, `test` and `bench` (2 677, 2 658 and 2 792 photos after leaving out the training photos of both runs, by MD5). `test` was first scored once per run, after the recipes were fixed; no parameter was chosen on it. The own photo set (`own`) is not collected yet.

**Model and parameters.** A5-E001 (v1) and A10-E001 (v2) as trained; scoring with `--bootstrap 1000` (group resampling, seed 42). Two metrics were added to `ml.evaluate` after the first scoring: `crop_masked_product_top3_acc` (the right class among the best three inside the selected crop plus `unknown`; also for field photos and per crop) and `diseased_called_healthy` (diseased photos answered with the crop's healthy class). All six scores (two runs, `val`, `test`, `bench`) were then recomputed from commit `e7d63da` on a clean tree (`git_dirty: false`); every earlier number and interval was reproduced exactly (0 differences).

**Results (crop-masked, with `unknown`).**

| Split | Run | Crop-masked macro-F1 (95 % CI) | Field macro-F1 (95 % CI) | Correct answers | Top-3 in the crop |
| --- | --- | --- | --- | ---: | ---: |
| `bench` | A5-E001 | 0.564 (0.547–0.581) | 0.564 (0.546–0.581) | 0.563 | 0.876 |
| `bench` | A10-E001 | 0.530 (0.510–0.548) | 0.530 (0.511–0.547) | 0.520 | 0.863 |
| `test` | A5-E001 | 0.734 (0.715–0.752) | 0.519 (0.493–0.564) | 0.629 | 0.891 |
| `test` | A10-E001 | 0.950 (0.935–0.964) | 0.853 (0.802–0.898) | 0.949 | 0.998 |

Laboratory photos: 0.982–0.986 accuracy on `test`; `unknown` on `test`: A5-E001 precision 0.466 / recall 0.993, A10-E001 0.986 / 0.993; `bench` has no `unknown` and no healthy photos. A10-E001 minus A5-E001 on `bench`: −0.034 (−0.052 … −0.018).

**Limitations.** One seed per run; `bench` has no healthy leaves and no `unknown`, so the false-alarm rate on healthy leaves is not measured; the choice between the two runs is made on `bench`; no calibration (A7); `unknown` does not recognize unknown diseases.

**Conclusion.** The target is met only on photos from the training sources (A10-E001: 0.949 / 0.998 on `test`). On independent field photos the best candidate, A5-E001, reaches 0.563 correct answers and 0.876 top-3; A10-E001, better on its own sources, is significantly worse there and answers "healthy" for 4.9 % of the diseased `bench` photos (A5-E001: 1.1 %). By F1 on `bench` the weakest classes are `wheat__stripe_rust` (0.03–0.14), `wheat__septoria` (0.25–0.37), `wheat__leaf_rust` (0.32–0.33) and `tomato__bacterial_spot` (0.26–0.33). Top-3 in the crop is below 95 % for tomato and wheat on `bench` in both runs.

**Next step.** A7 (calibration) on field data and a check on `bench`; collect the own set, healthy leaves first (`docs/ai/own-photos.md`); more field data from other sources for wheat and tomato before the next training run. The choice of the model for the service stays with the lead.

## A5-TRIAL — speed check (not an experiment)

A smoke run on 5 % of the train and validation images (1 head epoch + 1 full epoch) to measure epoch time on the Apple M4 (MPS); it did not follow the `<task>-E<NNN>` ID format. It reached 0.556 macro-F1 on validation. By mistake it was started with `--eval-test`, so the test split was scored once with this smoke model (macro-F1 0.571, accuracy 0.586). Its test numbers were not used to choose any parameter (only its epoch time informed the plan), and `--eval-test` is now refused for runs on a subset.
