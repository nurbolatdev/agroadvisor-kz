# Own photo set

Photos taken by the team in Kazakhstan (market, greenhouse, kitchen garden, field). They are **only scored, never trained on**: the model has not seen them, so the result shows how it behaves on photos like a farmer's. The set is small (50–100 photos), so its intervals are wide; it complements the `bench` split, it does not replace it.

## What to shoot

- **Priority classes** (no independent field source anywhere else): healthy leaves of `tomato`, `potato`, `corn`, `wheat` (`tomato__healthy`, `potato__healthy`, `corn__healthy`, `wheat__healthy`) and `tomato__early_blight`. Then any other class from `ml/classes.yaml` you can find.
- Per leaf: one close-up of the whole leaf plus two more angles; daylight, no flash, leaf in focus.
- Real conditions are the point: soil, other leaves, shade, a hand holding the leaf. Do not clean the background.
- The photo must be at least 224 px on the short side (the service refuses smaller ones). Phone photos are fine at full size.
- Write down who identified the disease (an agronomist, a label on the plant, a grower). If nobody is sure, do not include the photo.

## Folder layout

```
ml/datasets/own_raw/
  tomato__healthy/IMG_0412.jpg
  tomato__healthy/IMG_0413.jpg
  potato__healthy/IMG_0500.jpg
  meta.csv
```

- Folder names are class codes from `ml/classes.yaml`, exactly. The `unknown` class is not collected by hand.
- `meta.csv` is optional but recommended: `file,leaf,region,date,identified_by`. `file` is the path inside `own_raw/`; photos of one leaf get the same `leaf` value, so the statistics resample leaves and not near-identical photos.

```
file,leaf,region,date,identified_by
tomato__healthy/IMG_0412.jpg,leaf-1,Almaty,2026-10-20,agronomist
tomato__healthy/IMG_0413.jpg,leaf-1,Almaty,2026-10-20,agronomist
```

## Build and score

From `services/ai-service`:

```bash
python -m ml.own_set ml/datasets/own_raw --out ml/datasets/own \
    --exclude-train-of ml/datasets/v1 --exclude-train-of ml/datasets/v2
python -m ml.evaluate ml/runs/<RUN> --dataset-dir ml/datasets/own --split bench --bootstrap 1000
```

`ml.own_set` drops unreadable, too small and duplicate photos and photos that are also in a train split (same MD5), and prints how many it dropped and which priority classes are still missing. The copies are turned upright and **stripped of EXIF** because field photos carry the GPS position of a farm.

## Privacy and storage

- Keep the raw folder inside `services/ai-service/ml/datasets/` (`own_raw/`): everything there is ignored by git, like every dataset. Do not move it elsewhere in the repository, do not commit it and do not upload it anywhere public.
- Do not photograph people or documents.
- Keep the raw originals: the MD5 of the original file is what protects the set from leaking into training later.

## Limits to state in every report

- 50–100 photos over ~20 classes means a handful per class: report overall and per-crop numbers with intervals, per-class numbers only as counts.
- Photos of one person's phone in one season are one source; do not read the result as the accuracy in all of Kazakhstan.
