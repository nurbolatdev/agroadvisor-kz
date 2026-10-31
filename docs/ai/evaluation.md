# Model evaluation (A6)

Result in one line: **the target of 85 % correct answers and 95 % top-3 is reached only on photos from the same sources the model trained on; on an independent field benchmark neither candidate gets close (0.52–0.56 accuracy, 0.86–0.88 top-3), and A10-E001 answers "healthy" for 4.9 % of the diseased bench photos (A5-E001: 1.1 %).** The model is not ready to answer `ok` on its own; confidence calibration (A7) and more field data come first.

**Status of A6: part 1.** The evaluation on `val`, `test` and `bench` and the tools are done. The own photo set (`own`, 50–100 photos taken by the team, healthy leaves first) is **not collected**, so the task stays open until it is scored.

All numbers below are copied from `ml/runs/<ID>/results.json` by `python -m ml.eval_report` (tables) and are reproducible with the commands at the end. Intervals are 95 % bootstrap intervals over *groups* of photos (1000 resamples, seed 42), not over single photos. The runs were scored from commit `e7d63da` on a clean working tree (`git_dirty: false` in the `*_scored_with` records of `results.json`).

## What was evaluated

| Run | Trained on | Recipe | Role |
| --- | --- | --- | --- |
| A5-E001 | dataset v1 (lab + one field source per crop) | two-stage fine-tuning, balanced sampler | baseline, published as the preliminary model `effnet-b0-v1` |
| A10-E001 | dataset v2 (more field sources), lab photos capped at 400 per class | same recipe, best epoch chosen on field validation | candidate for the next model |

A5-E002 is not scored on `bench` or `test`: it had no significant effect over A5-E001 (see `experiments.md`) and A10-E001 supersedes it as the candidate.

Three splits of dataset v2, with the photos each model trained on left out (by MD5), so both runs are scored on exactly the same photos:

- **`val` and `test`** come from the same sources as the v2 training photos. They measure how well a model does on *more of the same data*. A10-E001 trained on those sources. A5-E001 never saw these photos, but part of them come from sources it did train on (the laboratory photos of PlantVillage, the field wheat of one Kaggle source), so its gap to A10-E001 there is not a clean "seen the source against not".
- **`bench`** is an external field benchmark from sources that are never in training (PlantWild, PlantSeg; 2 792 photos). It is the only split that estimates how the model behaves on photos from somewhere else, which is the situation of a farmer. The "Left out" column shows 31 `bench` photos that are exact copies (same MD5) of v1 training photos; they are not scored.
- **`own`** (photos taken by the team) is prepared but **not collected yet**, see below.

`test` was scored once per candidate, after the recipe was fixed; no parameter was chosen on it. `bench` was scored for the same two runs; the choice between the two runs below is a choice on `bench`, so it is not a clean selection (see Limits).

## Metrics

- **Crop-masked accuracy / macro-F1 with `unknown`** (`crop_masked_product_*`, the headline): the answer is chosen among the classes of the crop the farmer selected plus `unknown`, exactly as `/predict` does. A crop photo answered `unknown` is an error.
- **Top-3 as the app shows it** (`crop_masked_product_top3_acc`): the right class is among the best three answers inside the selected crop (plus `unknown`). The plain `Top-3` column of the first table is over all 20 classes without the crop mask and understates what the app shows.
- Domains: laboratory / field / other; `bench` has field photos only.

## Results against the target

Target: correct answer ≥ 85 %, right class in the top three ≥ 95 % (checked on field and `bench`, not on the whole validation set).

All rows are **field photos** (the whole of `bench` is field).

| Where | Run | Correct (crop-masked) | Top-3 in the crop | Target met |
| --- | --- | ---: | ---: | --- |
| `bench` (independent field photos) | A5-E001 | 0.563 | 0.876 | no / no |
| `bench` (independent field photos) | A10-E001 | 0.520 | 0.863 | no / no |
| `test`, field photos (same sources as training) | A10-E001 | 0.935 | 0.998 | yes / yes |
| `test`, field photos (same sources as training) | A5-E001 | 0.477 | 0.845 | no / no |

The yes/yes row is a measurement on photos of the sources the model trained on; it must not be quoted as the accuracy a farmer will see.

Top-3 is easy for a crop with few classes: the answer is chosen among the crop's classes plus `unknown`, that is 8 options for tomato (7 classes), 4 for potato (3), 5 for corn (4) and 6 for wheat (5); for potato a random top-3 is already right in 75 % of the cases. Read the per-crop column below, not the pooled number: on `bench` the top-3 is below 95 % for tomato and wheat in both runs.

### `bench` (independent field photos)

| Run | Photos | Left out | Accuracy | Top-3 | Crop-masked accuracy | Crop-masked macro-F1 (95 % CI) | Field macro-F1 (95 % CI) |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A5-E001 | 2792 | 31 | 0.509 | 0.779 | 0.563 | 0.564 (0.547–0.581) | 0.564 (0.546–0.581) |
| A10-E001 | 2792 | 31 | 0.465 | 0.770 | 0.520 | 0.530 (0.510–0.548) | 0.530 (0.511–0.547) |

Top-3 as the app shows it: A5-E001 0.876, A10-E001 0.863.

Difference A10-E001 − A5-E001 (paired bootstrap on the same photos): crop-masked macro-F1 **−0.034 (−0.052 … −0.018)**. The interval does not contain 0: on independent field photos A10-E001 is *worse*, although it is far better on its own sources.

Diseased leaves that the app would answer with the crop's healthy class (a missed disease: the farmer is told the plant is fine). `bench` has no healthy photos, so this is the one error towards "healthy" that can be measured now:

| Run | Diseased photos | Called healthy | Share |
| --- | ---: | ---: | ---: |
| A5-E001 | 2792 | 31 | 0.011 |
| A10-E001 | 2792 | 138 | 0.049 |

Field photos by crop:

| Run | Crop | Field photos | Accuracy | Macro-F1 (95 % CI) | Top-3 in the crop |
| --- | --- | ---: | ---: | --- | ---: |
| A5-E001 | tomato | 1187 | 0.504 | 0.537 (0.509–0.565) | 0.824 |
| A5-E001 | potato | 419 | 0.644 | 0.702 (0.657–0.745) | 1.000 |
| A5-E001 | corn | 604 | 0.699 | 0.685 (0.648–0.721) | 0.970 |
| A5-E001 | wheat | 582 | 0.486 | 0.445 (0.410–0.478) | 0.796 |
| A10-E001 | tomato | 1187 | 0.435 | 0.483 (0.454–0.514) | 0.805 |
| A10-E001 | potato | 419 | 0.632 | 0.686 (0.641–0.730) | 0.964 |
| A10-E001 | corn | 604 | 0.672 | 0.657 (0.618–0.695) | 0.954 |
| A10-E001 | wheat | 582 | 0.454 | 0.425 (0.384–0.464) | 0.816 |

Per class on `bench` (no mask). A dash means the class has no photos in `bench`, so recall and F1 are undefined.

| Class | A5-E001 precision / recall / F1 | A10-E001 precision / recall / F1 | Photos |
| --- | --- | --- | ---: |
| tomato__late_blight | 0.415 / 0.539 / 0.469 | 0.397 / 0.426 / 0.411 | 141 |
| tomato__early_blight | 0.511 / 0.376 / 0.433 | 0.423 / 0.339 / 0.376 | 242 |
| tomato__septoria_leaf_spot | 0.430 / 0.430 / 0.430 | 0.402 / 0.363 / 0.381 | 193 |
| tomato__bacterial_spot | 0.529 / 0.176 / 0.264 | 0.423 / 0.276 / 0.334 | 210 |
| tomato__leaf_mold | 0.688 / 0.670 / 0.678 | 0.727 / 0.522 / 0.608 | 230 |
| tomato__mosaic_virus | 0.767 / 0.655 / 0.707 | 0.811 / 0.450 / 0.579 | 171 |
| potato__late_blight | 0.611 / 0.622 / 0.616 | 0.594 / 0.514 / 0.551 | 222 |
| potato__early_blight | 0.567 / 0.431 / 0.490 | 0.444 / 0.503 / 0.471 | 197 |
| corn__common_rust | 0.756 / 0.651 / 0.700 | 0.753 / 0.638 / 0.690 | 229 |
| corn__northern_leaf_blight | 0.527 / 0.831 / 0.645 | 0.503 / 0.826 / 0.625 | 201 |
| corn__gray_leaf_spot | 0.667 / 0.402 / 0.502 | 0.678 / 0.351 / 0.462 | 174 |
| wheat__leaf_rust | 0.199 / 0.843 / 0.322 | 0.204 / 0.871 / 0.331 | 70 |
| wheat__stripe_rust | 0.231 / 0.014 / 0.027 | 0.531 / 0.081 / 0.140 | 211 |
| wheat__septoria | 0.667 / 0.254 / 0.368 | 0.571 / 0.159 / 0.248 | 126 |
| wheat__powdery_mildew | 0.804 / 0.937 / 0.865 | 0.830 / 0.834 / 0.832 | 175 |
| tomato__healthy, potato__healthy, corn__healthy, wheat__healthy | — | — | 0 |
| unknown | — | — | 0 |

### `test` and `val` (same sources as the v2 training photos)

| Split | Run | Photos | Crop-masked macro-F1 (95 % CI) | Field macro-F1 (95 % CI) | Top-3 in the crop |
| --- | --- | ---: | --- | --- | ---: |
| `test` | A5-E001 | 2658 | 0.734 (0.715–0.752) | 0.519 (0.493–0.564) | 0.891 |
| `test` | A10-E001 | 2658 | 0.950 (0.935–0.964) | 0.853 (0.802–0.898) | 0.998 |
| `val` | A5-E001 | 2677 | 0.718 (0.697–0.738) | 0.509 (0.481–0.536) | 0.881 |
| `val` | A10-E001 | 2677 | 0.951 (0.937–0.965) | 0.840 (0.784–0.888) | 0.997 |

On `test` `unknown` has precision 0.466 and recall 0.993 for A5-E001, and precision 0.986 and recall 0.993 for A10-E001. `unknown` is trained on other plants and objects; **it does not recognize unknown diseases**, and these numbers say nothing about them.

The full per-class tables and the by-crop tables for `test` and `val` are produced by `python -m ml.eval_report` (commands below); confusion matrices are in each run folder (`confusion_bench_v2*.png`, `confusion_test_v2*.png`, `confusion_val_v2*.png`).

## What the numbers say

1. **The gap between "more of the same" and "somewhere else" is the main result.** A10-E001: field macro-F1 0.840 on `val` and 0.853 on `test`, 0.530 on `bench`. A5-E001, on the v2 field photos from sources it did not train on, is as low as on `bench` (0.509–0.519 field). A high number on a validation split says how well the sources of the training set are learned, not how the model works elsewhere.
2. **More field data helped on its own sources and did not carry over to independent ones.** A10-E001 beats A5-E001 by +0.216 (0.198 … 0.234) crop-masked macro-F1 on `test`, but loses by −0.034 (−0.052 … −0.018) on `bench`. The second comparison is the one that matches the product. The first is not clean either: A10-E001 knows the field sources of `test`, while A5-E001 does not (it knows only part of them, see above).
3. **Where it fails on independent photos** (confusion matrix `confusion_bench_v2.png`), by F1 on `bench`: `wheat__stripe_rust` 0.03–0.14 (recognized in 1–8 % of its photos, mostly answered `wheat__leaf_rust`); `wheat__septoria` 0.25–0.37; `wheat__leaf_rust` 0.32–0.33 (recall 0.84–0.87, precision 0.20: it takes the photos of the other wheat classes); `tomato__bacterial_spot` 0.26–0.33 (recall 0.18–0.28, mostly answered `tomato__septoria_leaf_spot`); then `corn__gray_leaf_spot` 0.46–0.50 (recall 0.35–0.40, answered `corn__northern_leaf_blight`). These are pairs that look alike. Part of the tomato and potato photos is answered `unknown` even though the crop is chosen.
4. **Wheat looked excellent on v1 and is not.** Field wheat macro-F1 is 0.96–0.97 on validation and test (photos from the same Kaggle source as training) and 0.43–0.45 on `bench`. This confirms that the v1 wheat result reflects one source and one shooting style.
5. **Missed diseases are measurable, false alarms are not.** On `bench` A10-E001 answers "healthy" for 138 of 2 792 diseased photos (4.9 %), A5-E001 for 31 (1.1 %): one more reason against A10-E001 as the candidate. The opposite error (a healthy leaf called diseased, which costs a farmer a needless treatment) is **not measured** for tomato, potato, corn and wheat, because `bench` has no healthy leaves and no `unknown` photos. This is what the `own` set has to cover first.
6. **Top-3 is below 95 % where it is not trivial.** On `bench`, tomato 0.80–0.82 and wheat 0.80–0.82 in both runs; corn 0.95–0.97 and potato 0.96–1.00 reach it, and potato has only 4 options.

## Confidence calibration and thresholds (A7)

The service shows the model's probability as its confidence and compares it with thresholds (`ok`, `low`, `crop_mismatch`). That only makes sense if "70 %" means about 70 % right. A network trained with cross-entropy is overconfident; one number fixes most of it, the temperature `T` that divides the logits before the softmax (the answer never changes, only how sure the model says it is).

**Method.** `T` is fitted on the **field** photos of `val` (v2, the photos the model did not train on: 1 688 photos) by minimizing the log-loss of the answer as the service gives it (the selected crop's classes plus `unknown`). It is then *checked*, never fitted, on `test` and on the independent `bench`. Calibration error is ECE (15 bins). Everything is computed from the saved logits by `python -m ml.calibrate` (no new inference), from commit `11e7181`.

### A5-E001: calibration transfers to independent photos

`T = 3.79`. Field photos, accuracy of the answer does not change:

| Split | Photos | Accuracy | Mean confidence | ECE | Log-loss |
| --- | ---: | ---: | --- | --- | --- |
| `val` (fitted here) | 1688 | 0.459 | 0.788 → 0.483 | 0.331 → **0.067** | 2.139 → 1.301 |
| `test` | 1666 | 0.477 | 0.797 → 0.493 | 0.320 → **0.071** | 2.083 → 1.268 |
| `bench` (independent) | 2792 | 0.563 | 0.831 → 0.504 | 0.269 → **0.087** | 2.035 → 1.247 |

Without `T` the model says 79–83 % while being right 46–56 % of the time. After it, the confidence matches the accuracy within about 0.07–0.09 on all three splits, **including `bench`, which was not used for the fit** (`reliability_bench_v2.png` in the run folder; the curve stays near the diagonal: slightly above it below about 0.7, where the model is a little underconfident, and slightly below it between 0.75 and 0.9, where it is a little overconfident).

What the threshold `ok` (confidence ≥ 0.70) means, share of field photos that reach it and share of those that are right:

| Split | Without `T` | With `T` |
| --- | --- | --- |
| `val` | 67 % of photos, 53 % right | **17 %** of photos, 87 % right |
| `test` | 68 % of photos, 56 % right | **17 %** of photos, 89 % right |
| `bench` | 75 % of photos, 63 % right | **19 %** of photos, 78 % right |

Without calibration the service would answer "ok" for 67–75 % of the field photos and be wrong for 37–47 % of those answers. With it, "ok" is rare (about one photo in six) and 78–89 % of those answers are right.

The check "this looks like another crop" (`crop_mismatch`, on the unmasked output, threshold 0.70) fires on photos of the selected crop: without `T` on **5.5 %** of `bench` photos (153) and 2.9 % of `val` (49); with `T` on 2 photos of `bench` (0.07 %) and none of `val` or `test`.

### A10-E001: calibrating on a split of the training sources does not help

`T = 1.38`. On `val` and `test` (sources it trained on) it is already calibrated (ECE 0.020 → 0.008 and 0.030 → 0.015) and `ok` answers are right 96–97 % of the time. On the independent `bench` it is overconfident and `T` cannot fix it: ECE 0.305 → **0.243**, answers at confidence ≥ 0.70 are right only 61.5 % of the time (63 % of photos reach it), and `crop_mismatch` fires on 4.3 % of `bench` photos even with `T`. A temperature fitted on photos of the training sources reports a calibration that does not exist elsewhere. For this model there is no honest threshold set until it is calibrated on photos from independent sources (the own set, or a held-out source).

### Recommended thresholds (for A5-E001 with `T = 3.79` applied before the softmax)

| Threshold | Now | Recommended | Why |
| --- | --- | --- | --- |
| `ok` | 0.70 | **0.70** | With `T` it means what it says: 78–89 % right on field photos; about one photo in six reaches it |
| `low` (below it: "not recognized", top-3 still shown) | 0.40 | **0.25** | At 0.40 the app would say "not recognized" for 36–41 % of ordinary crop photos, and 34–40 % of them would have been right; at 0.25 it is 9–10 % (29–35 % of them right). The rule is that "crop → `unknown`" is worse than `low_confidence` |
| `crop_mismatch` | 0.70 | **0.70, only with `T`** | 0.07 % false alarms on `bench` with `T`, 5.5 % without it |

Non-plant photos stay rejected: of 279 (`val`) and 280 (`test`) photos of other plants and objects, 99.6–100 % are answered "not recognized" for every crop at both `low = 0.25` and `low = 0.40`. These photos come from the same sources as the training `unknown` (other plants, Caltech objects); there is no independent set of non-plant photos, so this is a check of the class, not a promise for any object.

These values change the defaults of `Thresholds` in the service and are applied together with the real model (A8, item 17): the service must apply `T` (it belongs in `model_card.json`) and must not answer `ok` for a model without it. Nothing in the service was changed here.

### Limits of the calibration

- One scalar for all classes and crops. The residual ECE is 0.07–0.09; per-crop temperatures were not tried.
- The fit uses 1 688 field photos of the v2 sources the model did not train on. The result is checked on `test` (same distribution) and `bench` (independent), which is the strongest check available; a new region, season or camera can still shift it.
- Only 17–19 % of field photos can be answered `ok`; calibration makes the confidence honest, it does not make the model more accurate.
- Test-time augmentation (several crops) was **not measured** (it needs the photos, not the saved logits).
- Intervals for ECE were not computed.

## Own photo set (`own`)

Status: **not collected, not evaluated.** The tools and the protocol are ready:

- protocol, folder layout, privacy: `docs/ai/own-photos.md`;
- `python -m ml.own_set` builds a dataset in the format of `ml/datasets/v2` from a folder of photos (classes by folder name, photos of one leaf grouped, EXIF stripped, photos that the model trained on left out by MD5);
- scoring: `python -m ml.evaluate ml/runs/<RUN> --dataset-dir ml/datasets/own --split bench --bootstrap 1000`.

Priority (decision of 26 Oct 2026): healthy leaves of tomato, potato and corn, `wheat__healthy`, `tomato__early_blight`. Expect wide intervals: 50–100 photos over about 20 classes is a few photos per class.

## Limits

- One training seed per run; the difference between runs of one recipe was never measured. Intervals cover the sampling of photos, not the randomness of training.
- Choosing A5-E001 over A10-E001 on `bench` is a choice made on the benchmark. It is a two-way comparison with an interval that excludes 0, but `bench` is no longer a fresh test for that choice.
- `bench` photos come from PlantWild and PlantSeg (CC BY-NC-ND 4.0): they are only used to evaluate, never to train, and are not in the repository. Their labels come from those projects; label noise was not measured.
- `Top-3 in the crop` is computed with the same crop mask and `unknown` as `/predict`; it does not model any confidence threshold that decides what the app shows.
- Confidence is not calibrated: A7 decides what the service may answer `ok`. These results are about the ranking of answers, not about how reliable a stated confidence is.
- Top-3 depends on how many classes a crop has (4 options for potato, 8 for tomato): compare it per crop, not pooled.
- `test` was first scored once per candidate after the recipes were fixed. Later the same photos were scored again with metrics added afterwards (top-3 in the crop, missed diseases); no parameter was changed and the earlier numbers were reproduced exactly (checked: 0 differences).
- Not done: Grad-CAM attention maps (optional in the task), intervals for the top-3 and the missed-disease share, test-time augmentation.

## Reproduce

From `services/ai-service` (the dataset folders are local and not in git):

```bash
# A5-E001 on the v2 splits, leaving out what A10-E001 trained on
python -m ml.evaluate ml/runs/A5-E001 --dataset-dir ml/datasets/v2 --split bench \
    --bootstrap 1000 --exclude-train-of ml/runs/A10-E001
# A10-E001, paired with A5-E001 on the same photos
python -m ml.evaluate ml/runs/A10-E001 --dataset-dir ml/datasets/v2 --split bench \
    --bootstrap 1000 --compare-with ml/runs/A5-E001
# the same with --split val and --split test; then the tables
python -m ml.eval_report ml/runs/A5-E001 ml/runs/A10-E001 --key bench@v2
```

Environment: Apple M4 (MPS), Python 3.12.10, torch 2.14.1; scoring one run on one split takes about 30–40 seconds.
