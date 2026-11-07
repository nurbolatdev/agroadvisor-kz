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
5. Otherwise mask to the classes of the requested crop (plus `unknown`), renormalize and apply thresholds. The answer is the best class of the crop; the photo is "not recognized" (`unknown`) when the probability of `unknown` after masking is ≥ 0.5, or when that best class is below 0.25.

### Status and thresholds

Confidence is the probability of the class, `0.0–1.0`, after the model's temperature `T` (`model_card.json`, `temperature`) has been applied to the logits before the softmax. A model without `T` is uncalibrated: the service never answers `ok` or `crop_mismatch` for it (`low_confidence` instead).

| `status` | Condition | What the farmer sees |
| --- | --- | --- |
| `ok` | top1 ≥ 0.70 | One diagnosis |
| `low_confidence` | 0.25 ≤ top1 < 0.70 (and `unknown` < 0.5) | Top-3 candidates and advice to ask an agrochemist |
| `unknown` | `unknown` probability ≥ 0.5, or top1 < 0.25 | "Not recognized", suggestion to retake the photo |
| `crop_mismatch` | Photo looks like another crop (calibrated model only) | "This looks like another crop", suggestion to change the crop |

`top1` and `top3` for each status (probabilities are those after masking to the requested crop plus `unknown` and renormalizing):

| `status` | Why | `top1` | `top3` |
| --- | --- | --- | --- |
| `ok` | best class ≥ 0.70 | The best class of the crop and its probability | The crop's three best classes, without `unknown` |
| `low_confidence` | 0.25 ≤ best class < 0.70, `unknown` < 0.5 | The best class and its probability | Same |
| `unknown`, case (a) | p(`unknown`) ≥ 0.5 | `code: "unknown"`, `confidence` = p(`unknown`), so always ≥ 0.5 | Same |
| `unknown`, case (b) | p(`unknown`) < 0.5 and best class < 0.25 | The crop's best class and its probability (< 0.25), equal to `top3[0]` | Same |
| `crop_mismatch` | Unmasked top class belongs to another crop, probability ≥ 0.70 | `top3[0]`, within the requested crop | Same, from the requested crop |

`top3` always holds the three best classes of the requested crop, sorted by probability, and never contains `unknown`. When `status` is `unknown`, the case is told by `top1.code`: `unknown` is case (a), a disease or `healthy` code is case (b). In both cases the client shows "not recognized" and `top3` as candidates, not as a diagnosis; in case (b) `top1` is the model's weak guess, not an answer. The probability of `unknown` is never reported as `confidence` when it is below 0.5.

When both conditions hold, (a) wins. `crop_mismatch` is checked first and takes priority over `unknown`.

Thresholds were chosen on A5-E001 with `T = 3.79` (`docs/ai/evaluation.md`, A7). They are configured in the service (`AI_OK_THRESHOLD`, `AI_LOW_THRESHOLD`, `AI_CROP_MISMATCH_THRESHOLD`, `AI_UNKNOWN_THRESHOLD`), not in clients — clients rely on `status` only.

### Response `200 OK`

| Field | Type | Description |
| --- | --- | --- |
| `status` | string | `ok` \| `low_confidence` \| `unknown` \| `crop_mismatch` |
| `crop` | string | Crop from the request |
| `top1` | object | `{ code, confidence }` — best class within the requested crop; `code` is `unknown` only when `status` is `unknown` and p(`unknown`) ≥ 0.5 (see the table above) |
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

`unknown`, case (b) (the model is unsure; `top1` is the weak guess):

```json
{
  "status": "unknown",
  "crop": "wheat",
  "top1": { "code": "wheat__leaf_rust", "confidence": 0.21 },
  "top3": [
    { "code": "wheat__leaf_rust", "confidence": 0.21 },
    { "code": "wheat__septoria", "confidence": 0.19 },
    { "code": "wheat__stripe_rust", "confidence": 0.17 }
  ],
  "detected_crop": null,
  "model_version": "effnet-b0-v1",
  "classes_version": 1,
  "inference_ms": 83
}
```

`unknown`, case (a) (probably not a plant of this crop):

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

`503` is the only error worth retrying; `500 internal_error` is a service fault and is not retried.

### How the backend calls the service (B9)

Connect timeout 2 s, read timeout 10 s (inference takes about 100 ms on a CPU, p95 172 ms). One extra try, after a pause of 0.4 s, only when the service cannot be connected to or answers `503 model_not_loaded`; never after a read timeout or a `500`, because the model may already have run. Settings: `app.ai.*` (`AI_SERVICE_URL`, `AI_CLIENT`). What the farmer's app gets from `POST /api/diagnoses`:

| The service answers | The backend answers | `code` | `reason` |
| --- | --- | --- | --- |
| `200` | `201` with the diagnosis | — | — |
| `200` with a placeholder `model_version` (`placeholder…`), unless `app.ai.allow-placeholder` | `503` | `ai_unavailable` | — |
| `422 low_quality` | `422`, `detail` is a human text | `low_quality` | `blurry` \| `dark` \| `too_small` |
| `400 invalid_image` | `400` | `invalid_image` | — |
| `503` (after the retry), no connection, read timeout | `503` | `ai_unavailable` | — |
| `500`, `400 unknown_crop`, any other answer, a body that breaks this contract | `502` | `ai_error` | — |

`code` and `reason` are separate properties of the Problem Details body; `reason` is present only when it narrows the code. `detail` is English text for logs, the app shows its own localized message for `code` and `reason`.

In every failure the stored photo is deleted and no diagnosis is saved. For a saved diagnosis `status` is the source of truth: with `status=unknown` `top1` may be a class of the crop with a low probability and must not be shown as a diagnosis.

The placeholder guard applies to every answer, not only at startup: `app.ai.allow-placeholder` is `false` by default and `true` only in the local and test profiles; with `true` the diagnosis is saved and flagged `placeholder: true`.

#### Time budget and the app's timeout

Worst case spent on the AI service in one `POST /api/diagnoses` with the defaults: two tries × (2 s connect + 10 s read) + 0.4 s pause = **24.4 s**. Normally it is about 100 ms; the worst case needs a service that is slow to connect or slow to answer twice. Before the AI call the photo is stored in S3 (bounded by `app.photos`: 10 s per try, 25 s in total), so with a slow storage the whole request can take longer.

The mobile app must use a request timeout of **at least 30 s** for `POST /api/diagnoses`. If it still gives up, it resends the same request with the **same `Idempotency-Key`**: the backend may have finished the diagnosis (it shows in the history).

#### `Idempotency-Key`

The app generates one key per diagnosis attempt (a UUID fits; 8-80 characters of letters, digits, `-`, `_`, `.`, `:`) and sends it as the `Idempotency-Key` header of `POST /api/diagnoses`. The header is optional; without it every request is a new diagnosis.

| Case | Answer |
| --- | --- |
| First request with the key | The normal `201`; the key is saved with the diagnosis. |
| Repeat with the same key (same user, same crop, same photo bytes) | `201` with the diagnosis made the first time and the header `Idempotent-Replayed: true`. The photo is not stored again and the model is not called. |
| Same key, another crop | `422`, `code: idempotency_key_reused`, `reason: crop`. |
| Same key, other photo bytes | `422`, `code: idempotency_key_reused`, `reason: photo`. |
| A repeat while the first request is still being processed | `409`, `code: request_in_progress`, header `Retry-After: 2`. The model is not called, nothing is stored and the rate limit is not spent. The app repeats the same request after the pause and then gets the replay (or, if the first one failed, a fresh attempt). |
| Malformed key | `400`, `code: invalid_idempotency_key`. |

The key is unique per user (unique index on `(user_id, idempotency_key)`), so two users may use the same value. A key is kept as long as its diagnosis.

**One model call per key.** A request with a key first *claims* it in the table `diagnosis_requests` (the primary key lets exactly one request in), then strips the metadata, calls the model, stores the photo and, in one short transaction, inserts the diagnosis and deletes its claim. No database lock is held while the model runs. A claim that has not been finished within `app.diagnosis.claim-timeout` (90 s; it must be longer than the longest a request can take, see `application.yml`; the application does not start otherwise) is considered abandoned: the next request with the same key, the **same photo and the same crop**, takes it over under a new fencing token (`claim_id`). A request whose claim was taken over can neither release nor overwrite the new owner's claim; if it still finishes, the unique index lets one diagnosis win and the other request returns it. A claim for other bytes is never inherited, even an expired one: that is `422 idempotency_key_reused` (`reason: photo`). Claim rows nobody released (a crashed instance) are removed after an hour.

**The photo object cannot be replaced.** The object name of a photo made under a key is `SHA-256(key + "\n" + fingerprint)`, so a name always means the same key *and* the same bytes. A later request with the same key and other bytes can therefore never write over the photo of an existing diagnosis, even after its claim row has been cleaned up; this is why `GET /api/diagnoses/{id}/photo` can be cached as immutable. The model is asked before the photo is stored, so a model failure writes nothing. A request that fails after the upload (the diagnosis cannot be saved) does not delete the object (another attempt may be using the same name); the retry writes the same bytes again. An object left by an attempt that never finished stays in the bucket until the cleanup of orphaned photos exists (issue #69). A request without a key uses a random name and removes its object when it fails.

Rate limit: a repeat is answered from the saved diagnosis before the limit (5 photos per minute per user) is checked, so it never spends a token and is not refused with `429` even when the limit is used up. Only a request that makes a new diagnosis spends one; it is still counted when its photo or crop is then rejected, and given back when the request fails for a reason of ours (see "Order of checks"). A key must be 8-80 characters long; a row with a key always has the photo fingerprint (a database constraint). The photo is compared by the SHA-256 of its bytes (stored in `diagnoses.request_fingerprint`). A retry must therefore send the **same file**: the app compresses the photo once, keeps the key and the compressed file together and resends that file; compressing the original again gives other bytes and a `422`. A new photo always needs a new key.

#### Order of checks and errors

`POST /api/diagnoses` checks a request in this order and answers with the first error it finds:

1. Access token and feature access: `401` / `403`.
2. `Idempotency-Key` format (only if the header is present): `400 invalid_idempotency_key`.
3. The key is looked up (only if present). A saved diagnosis for the key and the same crop and photo: `201` replay (`Idempotent-Replayed: true`). The same key with another crop or other photo bytes: `422 idempotency_key_reused` (`reason: crop` | `photo`). This step comes before the crop and photo checks, so an existing key with an unsupported crop or a file that is not an image is a `422`, not a `400`.
   If a request with this key is still being processed: `409 request_in_progress` (`Retry-After: 2`), or `422 idempotency_key_reused` if that request has other bytes or another crop.
4. Rate limits, two of them, both per user and both answered with `429 rate_limited` and a `Retry-After` header (seconds until the window ends): first the **attempts**, 20 a minute, then the **diagnoses**, 5 a minute. Steps 2 and 3 (replay, `409`, `422`) spend neither. From here on every request counts as an attempt, and the attempt is **never given back**, whatever the outcome. A request also spends a diagnosis token at the door (so a burst of parallel requests is cut there). The principle for the token: *the token is charged when the client caused the outcome: a successful diagnosis or a 4xx input error. It is refunded only when the server failed (5xx, storage, timeout) or the request was a duplicate (replay, request in progress).* So it is **kept** for a diagnosis and for every refusal of the client's input (`400 unknown_crop`, `400 invalid_image`, `422 low_quality`, `422 idempotency_key_reused`), and **given back** for a rare race where the request finds no claim in step 3 and then loses it (`409` in step 6), a replay found after the token was spent, and any failure of ours (`502`/`503` from the model, a storage failure, an unexpected error). A refund goes back to the window the token was spent in; if that window is over it gives nothing back, and a ticket is refunded at most once. A diagnosis that was saved keeps its token even if building the answer fails afterwards. Both limits are in `application.yml` (`app.rate-limit.diagnosis-per-minute`, `diagnosis-attempts-per-minute`).

   *Why two limits.* The diagnosis limit is about fairness to the farmer: a farmer is not charged for our failures, so a down model or storage does not use up their five photos. Taken alone it would leave the AI service open to a retry storm exactly when it is struggling: every failed call is refunded, so a client (or the app's own retries) could hammer it without end. The attempts limit is the guard of the AI against that: a flat 20 a minute that nothing gives back.
5. Crop: `400 unknown_crop`. Photo: `400 invalid_image` (not a JPEG/PNG, over 10 MB, or a broken container: a segment or chunk that runs past the end of the file; the container is checked in full in step 6 while the metadata is stripped).
6. With a key, the claim (step 3 repeated atomically: a request that loses the race gets the same `409` / `422` / replay; once the claim is won, a finished diagnosis is looked for once more, so a diagnosis committed a moment ago is replayed and the model is not called). Then the model call and the storage: `422 low_quality`, `503 ai_unavailable`, `502 ai_error` (see above), `503 storage_unavailable`. A failure releases the claim.

#### Reading a diagnosis and its photo

| Request | Answer |
| --- | --- |
| `GET /api/diagnoses/{id}` | `200` with the same body as the `201` of `POST` (`DiagnosisView`). Another user's and a missing id give the same `404 diagnosis_not_found`. |
| `GET /api/diagnoses/{id}/photo` | `200` with the JPEG or PNG bytes, for the owner only. The type follows the extension of the object key, which the server sets from the file's first bytes, never from the client's header. Headers: `Cache-Control: max-age=31536000, private, immutable`, `ETag` (SHA-256 of the object key, so the key and the user id are not exposed), `X-Content-Type-Options: nosniff`. A request with a matching `If-None-Match` is answered `304` from the database row alone, without downloading the object. Another user's and a missing diagnosis: `404 diagnosis_not_found`. The object is gone from the storage: `404 photo_not_found` (logged as an error on the server). Storage unreachable: `503 storage_unavailable`. |

`DiagnosisView.photoUrl` is the relative path `/api/diagnoses/{id}/photo`, always present. The bucket is private; there are no public or presigned links, the app fetches the photo with its access token.

The limit is not a flood protection for uploads: the multipart body is read before the application code runs, and a replay or a `422` costs one SHA-256 of the photo and one indexed read. Floods are cut at the entrance (nginx body-size and request-rate limits, see the staging task).

#### Photo metadata is removed on the server

The backend, not the app, guarantees that a stored or analysed photo carries no personal metadata (GPS position, camera, time, author). The app also cleans the photo before sending it (first line, saves traffic), but a request from another client or an older app version is cleaned the same way. After the checks above and before `photos.store` and the call to the AI service, `DiagnosisService.create` cuts the metadata out of the file's bytes. The cleaning is an allow-list: only what is needed to show the picture is kept. The colour profile (ICC) is kept because the picture's colours depend on it; it may name the device maker.

| Format | Kept | Removed |
| --- | --- | --- |
| JPEG | the coding markers (frames, tables, scans), `APP0` as JFIF **without a thumbnail**, `APP2` only with the `ICC_PROFILE\0` prefix, `APP14` only as Adobe (12 bytes); a minimal Exif with the `Orientation` tag only, if the original had one (values 1-8) | all other `APPn` (Exif, XMP, IPTC, MPF, JFXX and other `APP0`, ...), comments, JFIF thumbnails, and **everything after the first EOI** (Multi-Picture, Samsung SEFT, Motion Photo video) |
| PNG | critical chunks (`IHDR`, `PLTE`, `IDAT`, `IEND`) and `iCCP`, `sRGB`, `gAMA`, `cHRM`, `pHYs`, `tRNS`, `bKGD`, `sBIT`; a minimal `eXIf` with the `Orientation` tag only, if the original had one (values 1-8) | text chunks (`tEXt`, `zTXt`, `iTXt`), the rest of `eXIf`, `tIME` and every other chunk, and everything after `IEND` |

Orientation is kept (in JPEG and PNG) so that a phone photo taken in portrait still shows upright: the AI service turns the picture upright by this tag (`exif_transpose`) before the model sees it. The replacement Exif has one entry and no GPS, camera or time. The image is not decoded or re-encoded: pixel data stays identical, and a file that has nothing to remove is stored byte for byte. Only JPEG and PNG are accepted (by the file's first bytes, not the `Content-Type`); WebP and HEIC are not, the app converts HEIC to JPEG before sending.

A file whose container is broken (a segment or chunk longer than the file, a JPEG without EOI, a PNG without `IEND`, a reserved or extension JPEG marker) is refused with the same `400 invalid_image` (no `reason`) the AI service's answer is mapped to. The stored photo and the bytes sent to the AI service are the cleaned ones. The `Idempotency-Key` fingerprint (`request_fingerprint`) is still the SHA-256 of the bytes **the client sent**, so a retry with the same file is a replay, not a `422`.

#### Metrics

The model call is timed as `agroadvisor.ai.predict` (Micrometer timer; its count is the number of calls) with the tags `outcome` (`ok` or `error`) and `code` (the answer's `status` for `ok`, the farmer-facing error code for `error`: `low_quality`, `invalid_image`, `ai_unavailable`, `ai_error`, `internal_error`). `agroadvisor.diagnosis.replays` counts repeated requests answered from a saved diagnosis. The metrics are not exposed over HTTP yet: only `health` and `info` actuator endpoints are enabled.

Other framework responses (`404`, `405`, a malformed multipart body) are outside this contract and use the FastAPI default body.

### Placeholder model

When run with `AI_MODEL_KIND=placeholder` (tests, a clone without weights; the Docker image refuses it) the service reports `model_version: "placeholder-v0"`. Its probabilities are artificial, so a response with this version must never be shown to farmers as a diagnosis. The backend checks `model_version` of every answer and refuses such results unless `app.ai.allow-placeholder` is set (see above).

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
{ "status": "ok", "model_version": "effnet-b0-v1", "classes_version": 1, "calibrated": true }
```

`calibrated` is `false` when the model has no temperature in its card (and for the placeholder): the service then never answers `ok` or `crop_mismatch`. The backend should treat `calibrated: false` as a deployment fault.

`503 Service Unavailable` while the model is loading or failed to load:

```json
{ "status": "model_not_loaded", "model_version": null, "classes_version": 1, "calibrated": null }
```

### The backend's `GET /api/meta`

The app shows the version of the model in the profile. The backend passes it on from this `/health` (there is no other source and no stub in the app): any signed-in user, `200`:

```json
{ "modelVersion": "effnet-b0-v1", "classesVersion": 1 }
```

The answer of the AI service is kept for `app.meta.cache-ttl` (60 s), so many phones do not each call it and a new model shows up soon after a deploy. When `/health` cannot be read (not reachable, not `200`, no model version or classes version) or the model is a placeholder (unless `app.ai.allow-placeholder` is on), the answer is `503 ai_unavailable` and the app shows no model line. A failure is never kept and an old answer is never served after its time is over. The path has no version, like every other path of the backend (`/api/...`).

## Compatibility rules

- New fields may be added to responses; clients must ignore unknown fields.
- New class codes may appear after a model update. The backend must save a diagnosis with an unknown code and show "description coming soon" instead of failing.
- Class codes are never renamed or reused; retired classes become `deprecated`.
- Removing or renaming a field, or changing the meaning of `status`, is a breaking change and requires a new contract version.
