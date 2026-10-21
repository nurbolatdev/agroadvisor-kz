# Dataset

Training data for the disease classifier. Classes come from the registry ([`classes.md`](classes.md)); images are never committed — the dataset is rebuilt locally by a script.

## Build

From `services/ai-service` (with the environment from its README):

```bash
python -m ml.build_dataset                  # download all sources and build
python -m ml.build_dataset --skip-download  # rebuild from downloaded sources
```

- Sources are downloaded to `ml/datasets/raw/` (~10 GB). Interrupted downloads continue on the next run.
- The dataset is built in `ml/datasets/v1/<class code>/` — `v1` follows the registry version. Files are hard links to `raw/`, so the build takes almost no extra space.
- `ml/datasets/v1/manifest.csv` has one row per image: `file, class, crop, source, kind, original, md5`. `original` is the path inside the source — the data pipeline uses it to keep related photos in the same split.
- `ml/datasets/v1/report.md` is the class table below.

Which source folder becomes which class is configured in [`services/ai-service/ml/data_sources.yaml`](../../services/ai-service/ml/data_sources.yaml); class codes are checked against the registry. The script skips unreadable files and exact duplicates (by MD5), and drops images that two sources label differently.

Kaggle downloads work without an account for public datasets. If Kaggle starts requiring authentication, put an API token in `~/.kaggle/access_token` or the `KAGGLE_API_TOKEN` variable.

## Sources

| Source | Kind | Images used | License | Used for |
| --- | --- | ---: | --- | --- |
| [PlantVillage](https://github.com/spMohanty/PlantVillage-Dataset) | lab — single leaf, plain background | 16 513 | CC0 1.0 ¹ | tomato, potato, corn; other plants → `unknown` |
| [PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset) | field — real backgrounds and light | 2 054 | CC BY 4.0 | tomato, potato, corn; other plants → `unknown` |
| [Wheat Plant Diseases](https://www.kaggle.com/datasets/kushagra3204/wheat-plant-diseases) (Kaggle) | field | 5 285 | CC0 1.0 | wheat |
| [Caltech-101](https://data.caltech.edu/records/mzrjq-6wc02) | other — everyday objects | 1 500 | CC BY 4.0 | `unknown` (non-plant photos) |

¹ The PlantVillage repository has no license file; CC0 1.0 is the license listed for the original release by Meta-Album (OpenML) and TensorFlow Datasets.

Citations for CC BY sources:

- Singh D., Jain N., Jain P., Kayal P., Kumawat S., Batra N. *PlantDoc: A Dataset for Visual Plant Disease Detection.* CoDS-COMAD 2020.
- Li F.-F., Andreeto M., Ranzato M., Perona P. *Caltech 101.* CaltechDATA, 2022. doi:10.22002/D1.20086

Lab images alone make a model that fails on field photos, so tomato, potato and corn mix PlantVillage with PlantDoc. Folders not used: tomato target spot, yellow leaf curl virus and spider mites (candidates for the next registry version); wheat diseases and pests outside the registry — a wheat photo must never be labeled `unknown`. Caltech-101 plant-like categories (bonsai, lotus, sunflower, strawberry, water lily, Joshua tree) and the random-background category are excluded. `unknown` takes at most 800 images per plant source and 1 500 from Caltech-101.

## Classes — v1

Built on 21 Oct 2026: **25 352 images**, 777 exact duplicates skipped, 9 images dropped for conflicting labels.

| Class | Lab | Field | Other | Total | Note |
| --- | ---: | ---: | ---: | ---: | --- |
| `tomato__late_blight` | 1 901 | 111 | 0 | 2 012 | |
| `tomato__early_blight` | 1 000 | 88 | 0 | 1 088 | |
| `tomato__septoria_leaf_spot` | 1 771 | 149 | 0 | 1 920 | |
| `tomato__bacterial_spot` | 2 127 | 110 | 0 | 2 237 | |
| `tomato__leaf_mold` | 952 | 91 | 0 | 1 043 | |
| `tomato__mosaic_virus` | 373 | 54 | 0 | 427 | |
| `tomato__healthy` | 1 585 | 63 | 0 | 1 648 | |
| `potato__late_blight` | 1 000 | 103 | 0 | 1 103 | |
| `potato__early_blight` | 1 000 | 113 | 0 | 1 113 | |
| `potato__healthy` | 152 | 0 | 0 | 152 | lab only, smallest class |
| `corn__common_rust` | 1 192 | 116 | 0 | 1 308 | |
| `corn__northern_leaf_blight` | 985 | 190 | 0 | 1 175 | |
| `corn__gray_leaf_spot` | 513 | 66 | 0 | 579 | |
| `corn__healthy` | 1 162 | 0 | 0 | 1 162 | lab only |
| `wheat__leaf_rust` | 0 | 1 320 | 0 | 1 320 | |
| `wheat__stripe_rust` | 0 | 1 351 | 0 | 1 351 | |
| `wheat__septoria` | 0 | 446 | 0 | 446 | 768 duplicates removed from the source |
| `wheat__powdery_mildew` | 0 | 1 131 | 0 | 1 131 | |
| `wheat__healthy` | 0 | 1 037 | 0 | 1 037 | |
| `unknown` | 800 | 800 | 1 500 | 3 100 | other plants + non-plant objects |

Every class has at least 100 images; every wheat class has more than 300, so all five wheat classes stay `active`.

## Known gaps

- **Few field photos for tomato, potato and corn** — 54–190 per class against ~1 000 lab photos. Accuracy on lab images will overstate real-world accuracy: evaluation must report field photos separately and include our own photos (task A6).
- **`potato__healthy` and `corn__healthy` have no field photos**, and `potato__healthy` is the smallest class (152). The model may learn "plain background → healthy". Mitigation: class weights or oversampling, strong background augmentation, and own field photos as soon as possible.
- **Class imbalance** — 152 to 2 237 images per class; the data pipeline (A4) should use weighted sampling or class weights.
- **Kazakhstan conditions** — no source is from Kazakhstan. Photos confirmed by agrochemists in the app go into the next dataset version (see extension rules in [`classes.md`](classes.md)).
