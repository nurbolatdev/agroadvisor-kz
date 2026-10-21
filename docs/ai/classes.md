# Disease classes

The AI service recognizes plant diseases from a fixed set of classes.
The registry lives in [`services/ai-service/ml/classes.yaml`](../../services/ai-service/ml/classes.yaml) — it is the single source of truth for the model, the dataset, the API and the tests.

## Registry v1

One model covers four MVP crops: 19 disease/healthy classes plus `unknown`.

| Crop (`crop`) | Code | Disease |
| --- | --- | --- |
| `tomato` | `tomato__late_blight` | Late blight |
| | `tomato__early_blight` | Early blight |
| | `tomato__septoria_leaf_spot` | Septoria leaf spot |
| | `tomato__bacterial_spot` | Bacterial spot |
| | `tomato__leaf_mold` | Leaf mold |
| | `tomato__mosaic_virus` | Mosaic virus |
| | `tomato__healthy` | Healthy |
| `potato` | `potato__late_blight` | Late blight |
| | `potato__early_blight` | Early blight |
| | `potato__healthy` | Healthy |
| `corn` | `corn__common_rust` | Common rust |
| | `corn__northern_leaf_blight` | Northern leaf blight |
| | `corn__gray_leaf_spot` | Gray leaf spot |
| | `corn__healthy` | Healthy |
| `wheat` | `wheat__leaf_rust` | Leaf rust |
| | `wheat__stripe_rust` | Stripe rust |
| | `wheat__septoria` | Septoria |
| | `wheat__powdery_mildew` | Powdery mildew |
| | `wheat__healthy` | Healthy |
| — | `unknown` | Not a plant, wrong crop or not recognized |

Wheat fallback: if dataset collection yields fewer than ~300 photos for a wheat class, `wheat__septoria` and `wheat__powdery_mildew` are switched to `planned` and the model ships with three wheat classes.

Candidates for the next versions: pests (spider mite, Colorado potato beetle), corn common smut, tomato target spot, tomato yellow leaf curl virus.

## Registry format

```yaml
version: 1                 # registry version, returned as classes_version
crops:
  - code: tomato
    names: { ru: Томат, kk: Қызанақ, en: Tomato }
classes:
  - code: tomato__late_blight
    crop: tomato           # null only for unknown
    names: { ru: Фитофтороз, kk: Фитофтороз, en: Late blight }
    status: active         # active | planned | deprecated
    added_in: 1            # registry version that introduced the class
```

- **Code** — `<crop>__<disease>`, lowercase snake_case, English. The code is permanent: it is stored in diagnoses and used as the key of the disease reference in the backend.
- **Status**
  - `active` — predicted by the current model and returned by `GET /classes`;
  - `planned` — code is reserved, the model does not predict it yet;
  - `deprecated` — no longer predicted, kept because stored diagnoses reference it.
- **Names** — short display names for tooling and the admin panel. Full descriptions and treatment come from the backend disease reference, keyed by the same code.

## How the model uses the registry

- One EfficientNet-B0 (224×224, ImageNet weights) for all crops. The head has one output per class.
- The request carries the crop chosen by the user. Predictions are masked to the classes of that crop (plus `unknown`). If the unmasked prediction confidently points to another crop, the service returns `crop_mismatch`.
- Photo quality (blur, darkness, size) is checked before the model runs.
- The service returns only codes; names and treatment are resolved by the backend.

API details: [`docs/api/ai-predict.md`](../api/ai-predict.md).

## Extension rules

1. **One source of truth.** The model head, crop masks, dataset folders and tests are built from `classes.yaml`. The list of crops is read from it as well.
2. **No hardcoded indices or class lists.** The index order is saved next to the weights in `class_index.json`; the service reads that file, not the YAML order.
3. **A new class is a new version.** Add the class to the YAML with the next `added_in` → collect data (dataset folder = class code) → fine-tune with an extended head, keeping the backbone weights → release a new `model_version` (for example `effnet-b0-v2`) and bump `version` of the registry.
4. **Never delete a class.** Mark it `deprecated` — old diagnoses still reference the code.
5. **Every `/predict` response carries `model_version` and `classes_version`.** `GET /classes` returns the active registry; the backend and the mobile app take the crop list from there instead of their own code.
6. **The backend tolerates unknown codes.** If a code is not in the disease reference yet, the diagnosis is saved and shown as "description coming soon" — no errors.
7. **A new crop** = new classes with a new `crop` + entries in the backend reference. No changes to the mobile app or backend code.
8. **Training data accumulates by itself.** Diagnoses corrected by an agrochemist or admin are exported from the admin panel (AI quality → dataset export) and go into the next dataset version.
