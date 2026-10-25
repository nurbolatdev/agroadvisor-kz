# Dataset

Training data for the disease classifier. Classes come from the registry ([`classes.md`](classes.md)); images are never committed — the dataset is rebuilt locally by a script.

## Build

From `services/ai-service` (with the environment from its README):

```bash
python -m ml.build_dataset                  # download all sources and build v2
python -m ml.build_dataset --skip-download  # rebuild from downloaded sources
python -m ml.splits                         # train / val / test / bench split of v2
```

- Sources are downloaded to `ml/datasets/raw/` (~25 GB for v2). Interrupted downloads continue on the next run. Sources with `download: type: local` are fetched with `python -m ml.fetch_sources <name>` (see "Fetching the local sources" below); the build only checks and unpacks them, and **stops with the command to run if a source has no images**, so a rebuild never silently lacks a source.
- The dataset is built in `ml/datasets/v2/<class code>/`. Files are hard links to `raw/`, so the build takes almost no extra space. **`v1` is frozen**: the first training runs (A5) were trained on it, so the build refuses to rewrite it and `--sources` needs an explicit `--out-dir`. `classes_version` stays 1: the class registry did not change, only the data did.
- `ml/datasets/v2/manifest.csv` has one row per image: `file, class, crop, source, kind, role, original, md5` (v1 has no `role`). `original` is the path inside the source (for boxes cut from photos, the photo) — the data pipeline uses it to keep related photos in the same split.
- `ml/datasets/v2/report.md` is the class table; it also lists exact duplicates removed in the build and train photos dropped because of bench matches.

Which source folder becomes which class is configured in [`services/ai-service/ml/data_sources.yaml`](../../services/ai-service/ml/data_sources.yaml); class codes are checked against the registry. The script skips unreadable or truncated files and exact duplicates (by MD5). When the same photo has different classes in two places, its label cannot be trusted and **every copy is dropped** (bench sources are read first for plain duplicates); `report.md` lists every such conflict by source and class, so a systematic labeling difference between two sources is visible.

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

### Fetching the local sources

Run from `services/ai-service`; each command writes to `ml/datasets/raw/<source>/`, continues after an interruption (HTTP Range) and checks the checksums listed in `data_sources.yaml` where the publisher gives them.

| Command | What it downloads | Folder layout the build expects |
| --- | --- | --- |
| `python -m ml.fetch_sources pldd-up` | `EB.zip`, `LB.zip`, `Healthy.zip` (8.8 GB, Mendeley Data, SHA-256) | the zips; the build unpacks them into `pldd-up/EB/`, `LB/`, `Healthy/` |
| `python -m ml.fetch_sources plantseg` | `plantseg.zip` (1.1 GB, Zenodo, MD5) | the zip; unpacked into `plantseg/plantseg/images/...` and `Metadata.csv` |
| `python -m ml.fetch_sources plantwild` | `plantwild.zip` (2.7 GB, Hugging Face, no published checksum) | the zip; unpacked into `plantwild/plantwild/images/<class>/` |
| `python -m ml.fetch_sources johninnes-wheat` | the 999 wheat photos (1.0 GB, Zenodo, MD5) | the zip; unpacked into flat files such as `BrownRust107.png` |
| `python -m ml.fetch_sources ccmt` | **only the raw photos of maize and tomato** (11 163 photos, 0.55 GB) read out of the 8.4 GB Mendeley zip with range requests | `ccmt/Maize/<class>/`, `ccmt/Tomato/<class>/` |
| `python -m ml.fetch_sources tom2024` | **only** `CATEGORY A / CATA-English` maize and tomato photos (7 669 photos) out of the 1.5 GB zip | `tom2024/maize_diseases/<class>/`, `tom2024/tomato_diseases/<class>/` |
| `ROBOFLOW_API_KEY=... python -m ml.fetch_sources fieldplant` | the COCO export of the Roboflow copy `plant-disease-detection/fieldplant` (5.9 GB; a free Roboflow account and its API key are needed; the key is read from the environment and never printed or saved) | `fieldplant/coco/train/_annotations.coco.json` and the photos next to it |

The augmented copies of CCMT and TOM2024 are never downloaded. If someone unpacks the official zips by hand instead, the two-level class names in `data_sources.yaml` (`Maize/healthy`, `maize_diseases/Healthy_leaf`) still match only the raw and the labeled folders, not the augmented trees.

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

v2 adds field photos (the weak point of v1, see Known gaps) and an external benchmark. Class codes and the registry are unchanged. Counts per class are in the table at the end of this section (`report.md` has the same numbers and the removal tables).

**Roles.** A source has `role: train` (default) or `role: bench`. Bench photos go to the split `bench` and are only used to evaluate: parameters are never tuned on them. A train photo that is the same leaf as a bench photo, or a near-identical copy (the same group rule as for the other splits: close dHash and similar thumbnails, see "Groups" below), is dropped from train, and an exact copy is kept only in the bench. How many photos were dropped, by pair of sources, is in `report.md` (this matters most for PlantDoc and PlantWild, which both come from the internet).

| Source | Role | Kind | Used for | License | Notes |
| --- | --- | --- | --- | --- | --- |
| [PLDD-UP](https://data.mendeley.com/datasets/3j4nfkvp2n/1) (Mendeley Data, Uttar Pradesh, India, 15 519 photos) | train | field | potato: EB → `potato__early_blight`, LB → `potato__late_blight`, Healthy → `potato__healthy` | CC BY 4.0 | **Limited to 1 500 photos per class** (`limit_per_class`, seeded) so that one region does not dominate the potato classes |
| [CCMT](https://data.mendeley.com/datasets/bwh3zbpkpv/1) (Mendeley Data, Ghana) | train | field | corn and tomato healthy, tomato septoria | CC BY 4.0 | raw photos only, never the augmented copies; **limited to 1 500 photos per class**: the 2 743 raw septoria photos from Ghana would be more than half of `tomato__septoria_leaf_spot` |
| [TOM2024](https://data.mendeley.com/datasets/3d4yg89rtr/1) (Mendeley Data, Burkina Faso) | train | field | corn and tomato healthy, tomato late blight | CC BY 4.0 | labeled photos of category A (English folder) only, not the augmented category B |
| [FieldPlant](https://universe.roboflow.com/plant-disease-detection/fieldplant) (Moupojou et al., IEEE Access 2023, Roboflow copy) | train | field | leaves cut out of the photos by their boxes | CC BY 4.0 (stated in the export's README; export v11 of 5 July 2023, 5 156 photos, 27 classes, no augmentation) | crops of one photo stay in one part of the split |
| [PlantWild](https://huggingface.co/datasets/uqtwei2/PlantWild) (Wei et al., ACM MM 2024) | bench | field | evaluation of tomato, potato and corn classes | CC BY-NC-ND 4.0 | not used for training, never copied into the repository |
| [PlantSeg](https://zenodo.org/records/17719108) (Wei et al., 2024, web photos with masks) | bench | field | evaluation of tomato, potato, corn **and wheat** classes (labels from `Metadata.csv`) | CC BY-NC 4.0 (per photo CC-BY-NC or CC0) | the masks are not used; from the same research group as PlantWild, so exact and near copies are removed by the build and the split |
| [John Innes wheat](https://zenodo.org/records/7573133) (Long et al., Plant Pathology 2023, 999 photos) | train | field | wheat: brown rust, yellow rust, mildew, septoria, healthy (class = start of the file name) | CC BY 4.0 | field and glasshouse photos. **Not an independent bench:** 1 504 photos of the Kaggle wheat dataset are exact copies of these photos, so the Kaggle set is mostly the same data. It trains, and the wheat bench is PlantSeg only |

`limit_per_class` is a property of the source in `data_sources.yaml`, not of training: `--lab-cap` limits laboratory photos only. The general rule is that **one field source gives at most 1 500 photos per class**, so that no region or photographer dominates a class (PLDD-UP and CCMT are the sources that reach it). The photos that stay are chosen with seed 42 per source and class, so a rebuild gives the same set. `unknown` keeps its own limits (`unknown_limit`, 800 for PlantDoc); whether that is right for field photos is checked in the first A10 run with the field confusion matrix.

**The PlantWild bench was cleaned by hand.** PlantWild has fruit, stems, other crops and other diseases in classes of leaf diseases, but the model reads leaves. All photos of five classes (`tomato__early_blight`, `tomato__late_blight`, `tomato__bacterial_spot`, `tomato__mosaic_virus`, `corn__gray_leaf_spot`; 1 224 photos) were checked one by one on numbered sheets of 50, and only the clear cases were removed: 278 photos (196 fruit, 42 stem, 13 other crop, 9 wrong disease, 18 unclear), listed in [`ml/bench_exclude.csv`](../../services/ai-service/ml/bench_exclude.csv) (`file, class, reason`). The doubtful photos stayed. The build drops them in every source (a photo is identified by its content) and `report.md` counts them by class and reason. `tomato__septoria_leaf_spot` and `tomato__leaf_mold` were not touched. Share removed: `tomato__late_blight` 48 % (fruit 42 %), `tomato__early_blight` 21 %, `tomato__bacterial_spot` 18 %, `tomato__mosaic_virus` 9 %, `corn__gray_leaf_spot` 9 %. These classes stay in the bench because the weak tomato classes would otherwise have no independent evaluation.

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
| PlantWild and PlantSeg: gray leaf spot, northern leaf blight, corn rust, potato early/late blight, tomato bacterial leaf spot, early/late blight, leaf mold, mosaic virus, septoria; PlantSeg: the four wheat diseases | the matching class (bench only) |
| John Innes `BrownRust`, `YellowRust`, `Mildew`, `Septoria`, `Healthy` | `wheat__leaf_rust`, `wheat__stripe_rust`, `wheat__powdery_mildew`, `wheat__septoria`, `wheat__healthy` (train) |

Decided from contact sheets and **not used**: CCMT maize `leaf blight` and `leaf spot`, tomato `leaf blight` (each is a mix of diseases); TOM2024 tomato `alternaria_d` (half of the photos show fruit) and `virosis_d` (a mix of viruses); FieldPlant `Corn leaf blight` (noisy); PlantWild `corn leaf`, `potato leaf`, `tomato leaf` (the photos are mixed, not clearly healthy). Pests, abiotic damage and diseases that are not in the registry are never used, and photos of the four crops never go to `unknown`.

Citations for the CC BY sources: Singh P.K. et al., *PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India*, Mendeley Data, V1, doi:10.17632/3j4nfkvp2n.1; Mensah P.K. et al., *CCMT: Dataset for crop pest and disease detection*, Data in Brief 49 (2023), doi:10.17632/bwh3zbpkpv.1; *TOM2024: datasets of tomato, onion and maize images*, Data in Brief (2025), doi:10.17632/3d4yg89rtr.1; Moupojou E. et al., *FieldPlant: A Dataset of Field Plant Images for Plant Disease Detection and Classification With Deep Learning*, IEEE Access 11 (2023), doi:10.1109/ACCESS.2023.3263042.

### Classes — v2

Built on 26 Oct 2026: 37 450 images built, **37 245 after the split** (`python -m ml.splits`, seed 42): train 24 095, val 5 170, test 5 157 and bench 2 823 (PlantWild 2 240, PlantSeg 583). Removed on the way: 2 698 exact duplicates, 109 photos with conflicting labels (297 files, every copy dropped), 205 train-pool photos that match a bench photo (PlantSeg ∩ Kaggle wheat 109, PlantWild ∩ PlantDoc 87, PlantWild ∩ PlantVillage 9) and 278 bench photos removed by hand. No group of photos is split across parts, and the largest group has 22 photos (`report.md` lists the five largest).

**Groups.** Near-identical photos (same leaf or a recompressed copy) must stay in one part. The 64-bit dHash alone is too coarse: PLDD-UP leaves photographed the same way on a pale background share it, and joining pairs one after another chained hundreds of different leaves into groups of 321, 278 and 202 photos, so 278 of the 351 field photos of `potato__late_blight` in validation were one blob. A pair is now joined only if its hash is close **and** the 32×32 thumbnails differ by at most 6 grey levels on average (a real copy; different leaves differ by 8–30). This is not a leakage-safe guarantee against reshot photos of one leaf, only against copies.

Each cell is the number of photos (lab / field; `unknown` also has other):

| Class | train | val | test | bench |
| --- | --- | --- | --- | --- |
| `tomato__late_blight` | 1 730 (1 330/400) | 366 (286/80) | 378 (285/93) | 142 (0/142) |
| `tomato__early_blight` | 748 (700/48) | 161 (150/11) | 160 (150/10) | 244 (0/244) |
| `tomato__septoria_leaf_spot` | 2 291 (1 239/1 052) | 491 (266/225) | 490 (265/225) | 198 (0/198) |
| `tomato__bacterial_spot` | 1 561 (1 488/73) | 335 (319/16) | 334 (319/15) | 212 (0/212) |
| `tomato__leaf_mold` | 724 (666/58) | 155 (143/12) | 154 (142/12) | 233 (0/233) |
| `tomato__mosaic_virus` | 312 (261/51) | 67 (56/11) | 67 (56/11) | 171 (0/171) |
| `tomato__healthy` | 2 209 (1 109/1 100) | 480 (238/242) | 466 (238/228) | 0 |
| `potato__late_blight` | 1 810 (700/1 110) | 388 (150/238) | 388 (150/238) | 223 (0/223) |
| `potato__early_blight` | 1 808 (700/1 108) | 387 (150/237) | 387 (150/237) | 199 (0/199) |
| `potato__healthy` | 1 141 (106/1 035) | 245 (23/222) | 245 (23/222) | 0 |
| `corn__common_rust` | 1 000 (834/166) | 215 (179/36) | 214 (179/35) | 235 (0/235) |
| `corn__northern_leaf_blight` | 914 (688/226) | 197 (149/48) | 195 (147/48) | 206 (0/206) |
| `corn__gray_leaf_spot` | 432 (356/76) | 94 (76/18) | 92 (76/16) | 178 (0/178) |
| `corn__healthy` | 1 455 (814/641) | 311 (174/137) | 311 (174/137) | 0 |
| `wheat__leaf_rust` | 916 (0/916) | 197 (0/197) | 196 (0/196) | 70 (0/70) |
| `wheat__stripe_rust` | 1 113 (0/1 113) | 239 (0/239) | 238 (0/238) | 211 (0/211) |
| `wheat__septoria` | 312 (0/312) | 67 (0/67) | 67 (0/67) | 126 (0/126) |
| `wheat__powdery_mildew` | 724 (0/724) | 154 (0/154) | 155 (0/155) | 175 (0/175) |
| `wheat__healthy` | 726 (0/726) | 156 (0/156) | 155 (0/155) | 0 |
| `unknown` | 2 169 (560/559/1 050) | 465 (120/120/225) | 465 (120/120/225) | 0 |
| **total** | **24 095** (11 551/11 494/1 050) | **5 170** (2 479/2 466/225) | **5 157** (2 474/2 458/225) | **2 823** |

**The goal of at least 300 field photos per class in train is met only in part.** It is met for `tomato__late_blight` (400), `tomato__septoria_leaf_spot`, `tomato__healthy`, all potato classes, `corn__healthy` and wheat. It is not met where there is no clean source: `tomato__early_blight` 48, `tomato__mosaic_virus` 51, `tomato__leaf_mold` 58, `tomato__bacterial_spot` 73, `corn__gray_leaf_spot` 76, `corn__common_rust` 166, `corn__northern_leaf_blight` 226. **The field validation of these rare tomato and corn classes (10–18 photos) is not informative**: they are evaluated on the bench (171–244 photos per class), not on the validation split. Field photos of crops (15 619 in train, val and test) clearly outnumber the 799 field `unknown` photos.

## Known gaps

- **v2: `tomato__early_blight` got no new field photos** — no source has a clean class for it (CCMT and FieldPlant blight classes are mixes, TOM2024 `alternaria_d` is half fruit). It is a candidate for our own photos. It only has field photos from PlantDoc and the bench from PlantWild and PlantSeg.
- **Wheat is practically one source.** The Kaggle wheat dataset used in v1 is mostly made of copies of the John Innes photos (Long et al., Plant Pathology 2023): 1 504 of its photos are exact copies. So the very good wheat field results of v1 (F1 0.94–0.98) do not show that the model transfers to other wheat fields. The wheat bench is PlantSeg only (web photos from other places) and has no healthy class, so **`wheat__healthy` has no bench**.
- **No bench for the healthy classes of tomato, potato and corn.** No independent bench source has healthy leaves of these crops, and healthy photos must not be cut out of the training sources (they would not be independent). Our own set `own` (task A6) must contain healthy tomato, potato and corn leaves.

- **v1: few field photos for tomato, potato and corn** — 54–190 per class against ~1 000 lab photos. Accuracy on lab images overstates real-world accuracy: evaluation must report field photos separately and include our own photos (task A6). v2 adds field photos for most of these classes (see the table above) but not for the rare tomato and corn classes.
- **v1: `potato__healthy` and `corn__healthy` had no field photos**, and `potato__healthy` was the smallest class (152). v2 has 1 022 and 641 field photos of them in train (PLDD-UP, CCMT, TOM2024, FieldPlant). The model can still learn "plain background → healthy" from the laboratory photos: `--lab-cap`, strong background augmentation and own field photos remain the mitigation.
- **Class imbalance** — v1: 152 to 2 237 images per class, v2: 308 to 2 286 in train; the train loader samples classes equally (see Data loading).
- **Kazakhstan conditions** — no source is from Kazakhstan. Photos confirmed by agrochemists in the app go into the next dataset version (see extension rules in [`classes.md`](classes.md)).
