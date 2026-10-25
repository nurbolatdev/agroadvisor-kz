# Dataset

Training data for the disease classifier. Classes come from the registry ([`classes.md`](classes.md)); images are never committed — the dataset is rebuilt locally by a script.

## Build

From `services/ai-service` (with the environment from its README):

```bash
python -m ml.build_dataset                  # download all sources and build v2
python -m ml.build_dataset --skip-download  # rebuild from downloaded sources
python -m ml.splits                         # train / val / test / bench split of v2
```

- Sources are downloaded to `ml/datasets/raw/` (~25 GB for v2). Interrupted downloads continue on the next run. Sources with `download: type: local` are fetched by hand (large archives, a login, or a tool that picks single folders out of a zip); the build only unpacks them.
- The dataset is built in `ml/datasets/v2/<class code>/`. Files are hard links to `raw/`, so the build takes almost no extra space. **`v1` is frozen**: the first training runs (A5) were trained on it, so the build refuses to rewrite it and `--sources` needs an explicit `--out-dir`. `classes_version` stays 1: the class registry did not change, only the data did.
- `ml/datasets/v2/manifest.csv` has one row per image: `file, class, crop, source, kind, role, original, md5` (v1 has no `role`). `original` is the path inside the source (for boxes cut from photos, the photo) — the data pipeline uses it to keep related photos in the same split.
- `ml/datasets/v2/report.md` is the class table; it also lists exact duplicates removed in the build and train photos dropped because of bench matches.

Which source folder becomes which class is configured in [`services/ai-service/ml/data_sources.yaml`](../../services/ai-service/ml/data_sources.yaml); class codes are checked against the registry. The script skips unreadable files and exact duplicates (by MD5), and drops images that two sources label differently.

Kaggle downloads work without an account for public datasets. If Kaggle starts requiring authentication, put an API token in `~/.kaggle/access_token` or the `KAGGLE_API_TOKEN` variable.

## Split

```bash
python -m ml.splits   # after build_dataset; about a minute
```

Writes two files next to the manifest:

- `splits.csv` — `file, class, group, split` with `train` / `val` / `test` = 70 / 15 / 15 %;
- `class_index.json` — class order of the model head (active classes of the registry). After training it is saved next to the weights and the service reads it from there.

**No leakage between parts.** Several photos of one leaf would make test accuracy look better than it is, so images are grouped and every group goes to one part as a whole:

1. by file name — PlantVillage names repeated shots of one leaf alike: `GHLB Leaf 1 Day 6` and `GHLB Leaf 1.1 Day 12`, `R.S_HL 8315 copy 2`;
2. by content — a 64-bit perceptual hash (dHash); photos of the same class that differ in at most 4 bits are near-identical copies (resized or recompressed).

On v1 this gives 23 666 groups from 25 352 images; the largest group has 16 photos, so groups do not chain into large clusters.

**Stratified.** Groups are split separately for every class and photo kind (lab / field), so each part keeps the class balance and its share of field photos: test has 1 095 field photos. The split is reproducible (seed 42).

## Data loading

`ml/data.py` provides `PlantDataset(dataset_dir, split, transform)` and `make_loaders(dataset_dir, batch_size, num_workers)`.

- **Train augmentations** imitate field conditions: random crop of 60–100 % of the image, horizontal and vertical flips, rotation up to 30°, brightness / contrast / saturation jitter, occasional blur. Input is 224 × 224, normalized with ImageNet statistics.
- **Val / test**: resize to 256 and center crop 224, no augmentation.
- **Class balance**: the train loader draws every class equally often (`WeightedRandomSampler`), so small classes such as `potato__healthy` are not ignored.

On macOS the loader workers are started with `spawn`: scripts that use `num_workers > 0` must have an `if __name__ == "__main__":` guard.

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

## Dataset v2

v2 adds field photos (the weak point of v1, see Known gaps) and an external benchmark. Class codes and the registry are unchanged. Numbers per class are filled in after the build (`report.md`).

**Roles.** A source has `role: train` (default) or `role: bench`. Bench photos go to the split `bench` and are only used to evaluate: parameters are never tuned on them. A train photo that is the same leaf as a bench photo, or a near-identical copy (dHash within a class, the same rule as for the other splits), is dropped from train, and an exact copy is kept only in the bench. How many photos were dropped, by pair of sources, is in `report.md` (this matters most for PlantDoc and PlantWild, which both come from the internet).

| Source | Role | Kind | Used for | License | Notes |
| --- | --- | --- | --- | --- | --- |
| [PLDD-UP](https://data.mendeley.com/datasets/3j4nfkvp2n/1) (Mendeley Data, Uttar Pradesh, India, 15 519 photos) | train | field | potato: EB → `potato__early_blight`, LB → `potato__late_blight`, Healthy → `potato__healthy` | CC BY 4.0 | **Limited to 1 500 photos per class** (`limit_per_class`, seeded) so that one region does not dominate the potato classes |
| [CCMT](https://data.mendeley.com/datasets/bwh3zbpkpv/1) (Mendeley Data, Ghana) | train | field | corn and tomato healthy, tomato septoria | CC BY 4.0 | raw photos only, never the augmented copies; undecided classes below |
| [TOM2024](https://data.mendeley.com/datasets/3d4yg89rtr/1) (Mendeley Data, Burkina Faso) | train | field | corn and tomato healthy, tomato late blight | CC BY 4.0 | labeled photos of category A (English folder) only, not the augmented category B |
| [FieldPlant](https://universe.roboflow.com/plant-disease-detection/fieldplant) (Moupojou et al., IEEE Access 2023, Roboflow copy) | train | field | leaves cut out of the photos by their boxes | CC BY 4.0 (stated in the export's README; export v11 of 5 July 2023, 5 156 photos, 27 classes, no augmentation) | crops of one photo stay in one part of the split |
| [PlantWild](https://huggingface.co/datasets/uqtwei2/PlantWild) (Wei et al., ACM MM 2024) | bench | field | evaluation of tomato, potato and corn classes | CC BY-NC-ND 4.0 | not used for training, never copied into the repository |
| [PlantSeg](https://zenodo.org/records/17719108) (Wei et al., 2024, web photos with masks) | bench | field | evaluation of tomato, potato, corn **and wheat** classes (labels from `Metadata.csv`) | CC BY-NC 4.0 (per photo CC-BY-NC or CC0) | the masks are not used; from the same research group as PlantWild, so exact and near copies are removed by the build and the split |
| [John Innes wheat](https://zenodo.org/records/7573133) (Long et al., Plant Pathology 2023, 999 photos) | bench | field | second source of wheat: brown rust, yellow rust, mildew, septoria, healthy (class = start of the file name) | CC BY 4.0 | field and glasshouse photos; the wheat training photos all come from one Kaggle dataset |

`limit_per_class` is a property of the source in `data_sources.yaml`, not of training: `--lab-cap` limits laboratory photos only. The photos that stay are chosen with seed 42 per source and class, so a rebuild gives the same set.

**Class mapping.** Matched by the folder or category name; classes whose name is not clear are decided by looking at photos (listed below the table).

| Source folder | Class |
| --- | --- |
| CCMT Maize/healthy, TOM2024 maize `Healthy_leaf`, FieldPlant `Corn Healthy` | `corn__healthy` |
| CCMT Tomato/healthy, TOM2024 tomato `healthy_leaf`, FieldPlant `Tomato healthy` | `tomato__healthy` |
| CCMT Tomato/septoria leaf spot | `tomato__septoria_leaf_spot` |
| TOM2024 `tomato_late_blight_d`, FieldPlant `Tomato blight leaf` | `tomato__late_blight` |
| TOM2024 maize `Helminthosporiosis-D` | `corn__northern_leaf_blight` |
| TOM2024 maize `Rust-D`, FieldPlant `Corn rust leaf` | `corn__common_rust` (some photos may be southern rust; the treatment is the same) |
| FieldPlant `Corn Gray leaf spot` (Cercosporiose) | `corn__gray_leaf_spot` |
| FieldPlant `Tomato leaf mosaic virus` | `tomato__mosaic_virus` |
| PlantWild and PlantSeg: gray leaf spot, northern leaf blight, corn rust, potato early/late blight, tomato bacterial leaf spot, early/late blight, leaf mold, mosaic virus, septoria; PlantSeg and John Innes: the four wheat diseases | the matching class (bench only) |

Decided from contact sheets and **not used**: CCMT maize `leaf blight` and `leaf spot`, tomato `leaf blight` (each is a mix of diseases); TOM2024 tomato `alternaria_d` (half of the photos show fruit) and `virosis_d` (a mix of viruses); FieldPlant `Corn leaf blight` (noisy); PlantWild `corn leaf`, `potato leaf`, `tomato leaf` (the photos are mixed, not clearly healthy). Pests, abiotic damage and diseases that are not in the registry are never used, and photos of the four crops never go to `unknown`.

Citations for the CC BY sources: Singh P.K. et al., *PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India*, Mendeley Data, V1, doi:10.17632/3j4nfkvp2n.1; Mensah P.K. et al., *CCMT: Dataset for crop pest and disease detection*, Data in Brief 49 (2023), doi:10.17632/bwh3zbpkpv.1; *TOM2024: datasets of tomato, onion and maize images*, Data in Brief (2025), doi:10.17632/3d4yg89rtr.1; Moupojou E. et al., *FieldPlant: A Dataset of Field Plant Images for Plant Disease Detection and Classification With Deep Learning*, IEEE Access 11 (2023), doi:10.1109/ACCESS.2023.3263042.

## Known gaps

- **v2: `tomato__early_blight` got no new field photos** — no source has a clean class for it (CCMT and FieldPlant blight classes are mixes, TOM2024 `alternaria_d` is half fruit). It is a candidate for our own photos. It only has field photos from PlantDoc and the bench from PlantWild and PlantSeg.
- **v2: wheat training photos come from one source** (Kaggle). The wheat bench (PlantSeg, John Innes) shows whether the high wheat accuracy holds on photos from other places.

- **Few field photos for tomato, potato and corn** — 54–190 per class against ~1 000 lab photos. Accuracy on lab images will overstate real-world accuracy: evaluation must report field photos separately and include our own photos (task A6).
- **`potato__healthy` and `corn__healthy` have no field photos**, and `potato__healthy` is the smallest class (152). The model may learn "plain background → healthy". Mitigation: class weights or oversampling, strong background augmentation, and own field photos as soon as possible.
- **Class imbalance** — 152 to 2 237 images per class; the train loader samples classes equally (see Data loading).
- **Kazakhstan conditions** — no source is from Kazakhstan. Photos confirmed by agrochemists in the app go into the next dataset version (see extension rules in [`classes.md`](classes.md)).
