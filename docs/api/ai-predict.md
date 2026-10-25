# AI service API — `/predict` contract

Internal HTTP API of `services/ai-service`. The only client is the backend; the mobile app never calls the AI service directly.

- Base URL: `http://ai-service:8000` (Docker network), configured in the backend.
- All responses are JSON, UTF-8.
- Class codes come from the registry — see [`docs/ai/classes.md`](../ai/classes.md).
- Contract version: 1 (registry `classes v1`, model `effnet-b0-v1`).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/predict` | Diagnose a photo for the chosen crop |
| `GET` | `/classes` | Active class registry |
| `GET` | `/health` | Liveness and loaded model version |

## `POST /predict`

### Request

`multipart/form-data`:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `image` | file | yes | JPEG or PNG, up to 10 MB |
| `crop` | string | yes | Crop code from the registry: `tomato`, `potato`, `corn`, `wheat` |

```bash
curl -X POST http://localhost:8000/predict \
  -F "image=@leaf.jpg" \
  -F "crop=tomato"
```

### Processing order

1. Validate the request (`crop` is an active crop, `image` is a readable JPEG/PNG within the size limit).
2. Check photo quality: blur, darkness, minimum size. A bad photo stops here with `422 low_quality` — the model is not called.
3. Run the model over all active classes.
4. If the unmasked top prediction belongs to another crop with confidence ≥ 0.70 → `crop_mismatch`.
5. Otherwise mask to the classes of the requested crop (plus `unknown`), renormalize and apply thresholds.

### Status and thresholds

Confidence is the calibrated probability of the class, `0.0–1.0`.

| `status` | Condition | What the farmer sees |
| --- | --- | --- |
| `ok` | top1 ≥ 0.70 | One diagnosis |
| `low_confidence` | 0.40 ≤ top1 < 0.70 | Top-3 candidates and advice to ask an agrochemist |
| `unknown` | top1 < 0.40, or the top class is `unknown` | "Not recognized", suggestion to retake the photo |
| `crop_mismatch` | Photo looks like another crop | "This looks like another crop", suggestion to change the crop |

When `status` is `unknown` only because the best class is below 0.40, `top1.confidence` is the probability of the `unknown` class and can be very small. Clients must not read it as confidence that the photo is really unknown; this is revisited after calibration.

Thresholds are preliminary and will be finalized after calibration (`docs/ai/evaluation.md`). They are configured in the service, not in clients — clients rely on `status` only.

### Response `200 OK`

| Field | Type | Description |
| --- | --- | --- |
| `status` | string | `ok` \| `low_confidence` \| `unknown` \| `crop_mismatch` |
| `crop` | string | Crop from the request |
| `top1` | object | `{ code, confidence }` — best class within the requested crop; `code` is `unknown` when `status` is `unknown` |
| `top3` | array | Up to 3 `{ code, confidence }` within the requested crop, sorted by confidence, `unknown` excluded |
| `detected_crop` | string \| null | Crop the photo looks like; set only for `crop_mismatch` |
| `model_version` | string | For example `effnet-b0-v1` |
| `classes_version` | integer | Registry `version` |
| `inference_ms` | integer | Quality check + model time, ms |

`ok`:

```json
{
  "status": "ok",
  "crop": "tomato",
  "top1": { "code": "tomato__late_blight", "confidence": 0.91 },
  "top3": [
    { "code": "tomato__late_blight", "confidence": 0.91 },
    { "code": "tomato__early_blight", "confidence": 0.05 },
    { "code": "tomato__septoria_leaf_spot", "confidence": 0.02 }
  ],
  "detected_crop": null,
  "model_version": "effnet-b0-v1",
  "classes_version": 1,
  "inference_ms": 84
}
```

`low_confidence`:

```json
{
  "status": "low_confidence",
  "crop": "wheat",
  "top1": { "code": "wheat__leaf_rust", "confidence": 0.56 },
  "top3": [
    { "code": "wheat__leaf_rust", "confidence": 0.56 },
    { "code": "wheat__stripe_rust", "confidence": 0.31 },
    { "code": "wheat__septoria", "confidence": 0.08 }
  ],
  "detected_crop": null,
  "model_version": "effnet-b0-v1",
  "classes_version": 1,
  "inference_ms": 79
}
```

`unknown`:

```json
{
  "status": "unknown",
  "crop": "potato",
  "top1": { "code": "unknown", "confidence": 0.62 },
  "top3": [
    { "code": "potato__early_blight", "confidence": 0.21 },
    { "code": "potato__healthy", "confidence": 0.11 },
    { "code": "potato__late_blight", "confidence": 0.06 }
  ],
  "detected_crop": null,
  "model_version": "effnet-b0-v1",
  "classes_version": 1,
  "inference_ms": 81
}
```

`crop_mismatch`:

```json
{
  "status": "crop_mismatch",
  "crop": "potato",
  "top1": { "code": "potato__healthy", "confidence": 0.38 },
  "top3": [
    { "code": "potato__healthy", "confidence": 0.38 },
    { "code": "potato__early_blight", "confidence": 0.33 },
    { "code": "potato__late_blight", "confidence": 0.29 }
  ],
  "detected_crop": "tomato",
  "model_version": "effnet-b0-v1",
  "classes_version": 1,
  "inference_ms": 83
}
```

## Errors

Error body:

```json
{
  "error": "low_quality",
  "reason": "blurry",
  "message": "Photo is too blurry"
}
```

- `error` — machine-readable code, stable;
- `reason` — optional detail code;
- `message` — English text for logs, not shown to farmers. The backend maps `error` / `reason` to localized messages.

| HTTP | `error` | `reason` | When |
| --- | --- | --- | --- |
| 400 | `invalid_image` | `missing` \| `unsupported_format` \| `too_large` \| `corrupted` | No file, not JPEG/PNG, over 10 MB, cannot be decoded |
| 400 | `unknown_crop` | — | `crop` is missing or not an active crop in the registry |
| 422 | `low_quality` | `blurry` \| `dark` \| `too_small` | Photo failed the quality check; the model was not called |
| 503 | `model_not_loaded` | — | Weights are not loaded yet (startup) or failed to load |
| 500 | `internal_error` | — | The model returned probabilities that do not match the class registry; details are in the service log only |

Timeouts and retries on the backend side are defined in the backend integration (tasks B6, B9). `503` is the only error worth retrying; `500 internal_error` is a service fault and is not retried.

Other framework responses (`404`, `405`, a malformed multipart body) are outside this contract and use the FastAPI default body.

### Placeholder model

Until trained weights exist the service reports `model_version: "placeholder-v0"`. Its probabilities are artificial, so a response with this version must never be shown to farmers as a diagnosis. The backend must check `model_version` and block or clearly mark such results.

## `GET /classes`

Returns the registry with `active` classes only. The backend and the mobile app take the crop list from here.

```json
{
  "version": 1,
  "crops": [
    { "code": "tomato", "names": { "ru": "Томат", "kk": "Қызанақ", "en": "Tomato" } }
  ],
  "classes": [
    {
      "code": "tomato__late_blight",
      "crop": "tomato",
      "names": { "ru": "Фитофтороз", "kk": "Фитофтороз", "en": "Late blight" },
      "added_in": 1
    }
  ]
}
```

(Shortened: the real response lists all crops and active classes, including `unknown` with `"crop": null`.)

## `GET /health`

`200 OK` when the model is loaded:

```json
{ "status": "ok", "model_version": "effnet-b0-v1", "classes_version": 1 }
```

`503 Service Unavailable` while the model is loading or failed to load:

```json
{ "status": "model_not_loaded", "model_version": null, "classes_version": 1 }
```

## Compatibility rules

- New fields may be added to responses; clients must ignore unknown fields.
- New class codes may appear after a model update. The backend must save a diagnosis with an unknown code and show "description coming soon" instead of failing.
- Class codes are never renamed or reused; retired classes become `deprecated`.
- Removing or renaming a field, or changing the meaning of `status`, is a breaking change and requires a new contract version.
