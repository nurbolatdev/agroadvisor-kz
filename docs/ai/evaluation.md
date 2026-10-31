# Model evaluation (A6)

Result in one line: **the target of 85 % correct answers and 95 % top-3 is reached only on photos from the same sources the model trained on; on an independent field benchmark neither candidate gets close (0.52–0.56 accuracy, 0.86–0.88 top-3).** The model is not ready to answer `ok` on its own; confidence calibration (A7) and more field data come first.

All numbers below are copied from `ml/runs/<ID>/results.json` by `python -m ml.eval_report` (tables) and are reproducible with the commands at the end. Intervals are 95 % bootstrap intervals over *groups* of photos (1000 resamples, seed 42), not over single photos.

## What was evaluated

| Run | Trained on | Recipe | Role |
| --- | --- | --- | --- |
| A5-E001 | dataset v1 (lab + one field source per crop) | two-stage fine-tuning, balanced sampler | baseline, published as the preliminary model `effnet-b0-v1` |
| A10-E001 | dataset v2 (more field sources), lab photos capped at 400 per class | same recipe, best epoch chosen on field validation | candidate for the next model |

A5-E002 is not scored on `bench` or `test`: it had no significant effect over A5-E001 (see `experiments.md`) and A10-E001 supersedes it as the candidate.

Three splits of dataset v2, with the photos each model trained on left out (by MD5), so both runs are scored on exactly the same photos:

- **`val` and `test`** come from the same sources as the v2 training photos. They measure how well a model does on *more of the same data*. A10-E001 trained on those sources, A5-E001 did not.
- **`bench`** is an external field benchmark from sources that are never in training (PlantWild, PlantSeg; 2 792 photos). It is the only split that estimates how the model behaves on photos from somewhere else, which is the situation of a farmer.
- **`own`** (photos taken by the team) is prepared but **not collected yet**, see below.

`test` was scored once per candidate, after the recipe was fixed; no parameter was chosen on it. `bench` was scored for the same two runs; the choice between the two runs below is a choice on `bench`, so it is not a clean selection (see Limits).

## Metrics

- **Crop-masked accuracy / macro-F1 with `unknown`** (`crop_masked_product_*`, the headline): the answer is chosen among the classes of the crop the farmer selected plus `unknown`, exactly as `/predict` does. A crop photo answered `unknown` is an error.
- **Top-3 as the app shows it** (`crop_masked_product_top3_acc`): the right class is among the best three answers inside the selected crop (plus `unknown`). The plain `Top-3` column of the first table is over all 20 classes without the crop mask and understates what the app shows.
- Domains: laboratory / field / other; `bench` has field photos only.

## Results against the target

Target: correct answer ≥ 85 %, right class in the top three ≥ 95 % (checked on field and `bench`, not on the whole validation set).

| Where | Run | Correct (crop-masked) | Top-3 in the crop | Target met |
| --- | --- | ---: | ---: | --- |
| `bench` (independent field photos) | A5-E001 | 0.563 | 0.876 | no / no |
| `bench` (independent field photos) | A10-E001 | 0.520 | 0.863 | no / no |
| `test` (same sources as training) | A10-E001 | 0.949 | 0.998 | yes / yes |
| `test` (same sources as training) | A5-E001 | 0.629 | 0.891 | no / no |

The yes/yes row is a measurement on photos of the sources the model trained on; it must not be quoted as the accuracy a farmer will see.

### `bench` (independent field photos)

| Run | Photos | Left out | Accuracy | Top-3 | Crop-masked accuracy | Crop-masked macro-F1 (95 % CI) | Field macro-F1 (95 % CI) |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A5-E001 | 2792 | 31 | 0.509 | 0.779 | 0.563 | 0.564 (0.547–0.581) | 0.564 (0.546–0.581) |
| A10-E001 | 2792 | 31 | 0.465 | 0.770 | 0.520 | 0.530 (0.510–0.548) | 0.530 (0.511–0.547) |

Top-3 as the app shows it: A5-E001 0.876, A10-E001 0.863.

Difference A10-E001 − A5-E001 (paired bootstrap on the same photos): crop-masked macro-F1 **−0.034 (−0.052 … −0.018)**. The interval does not contain 0: on independent field photos A10-E001 is *worse*, although it is far better on its own sources.

Field photos by crop:

| Run | Crop | Field photos | Accuracy | Macro-F1 (95 % CI) |
| --- | --- | ---: | ---: | --- |
| A5-E001 | tomato | 1187 | 0.504 | 0.537 (0.509–0.565) |
| A5-E001 | potato | 419 | 0.644 | 0.702 (0.657–0.745) |
| A5-E001 | corn | 604 | 0.699 | 0.685 (0.648–0.721) |
| A5-E001 | wheat | 582 | 0.486 | 0.445 (0.410–0.478) |
| A10-E001 | tomato | 1187 | 0.435 | 0.483 (0.454–0.514) |
| A10-E001 | potato | 419 | 0.632 | 0.686 (0.641–0.730) |
| A10-E001 | corn | 604 | 0.672 | 0.657 (0.618–0.695) |
| A10-E001 | wheat | 582 | 0.454 | 0.425 (0.384–0.464) |

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

1. **The gap between "more of the same" and "somewhere else" is the main result.** A10-E001: field macro-F1 0.840 on `val` and 0.853 on `test`, 0.530 on `bench`. A5-E001 on the v2 sources it never saw is as low as on `bench` (0.509–0.519 field). A high number on a validation split says how well the sources of the training set are learned, not how the model works elsewhere.
2. **More field data helped on its own sources and did not carry over to independent ones.** A10-E001 beats A5-E001 by +0.216 (0.198 … 0.234) crop-masked macro-F1 on `test`, but loses by −0.034 (−0.052 … −0.018) on `bench`. The second comparison is the one that matches the product; the first is largely a comparison of "seen the source" against "not".
3. **Where it fails on independent photos** (confusion matrix `confusion_bench_v2.png`): `wheat__stripe_rust` is recognized in 1–8 % of its photos and goes to `wheat__leaf_rust` (the two rusts look alike; `wheat__leaf_rust` has recall 0.84–0.87 but precision 0.20); `tomato__bacterial_spot` (recall 0.18–0.28) goes mostly to `tomato__septoria_leaf_spot`; `corn__gray_leaf_spot` goes to `corn__northern_leaf_blight` (recall 0.35–0.40). Part of the tomato and potato photos is answered `unknown` even though the crop is chosen.
4. **Wheat looked excellent on v1 and is not.** Field wheat macro-F1 is 0.96–0.97 on validation and test (photos from the same Kaggle source as training) and 0.43–0.45 on `bench`. This confirms that the v1 wheat result reflects one source and one shooting style.
5. **Not measured at all:** `bench` has no healthy leaves and no `unknown` photos. The rate at which the model calls a healthy leaf diseased (the false alarm that costs a farmer a treatment) is therefore **unknown** for tomato, potato, corn and wheat. This is what the `own` set has to cover first.

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
- Not done: Grad-CAM attention maps (optional in the task), crop-masked top-3 intervals, test-time augmentation.

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
