# Admin AI quality API

How the model performs, for the admin's "AI quality" page: what the model answered (`diagnoses`) against what experts decided (`diagnosis_reviews`, see [diagnosis-reviews.md](diagnosis-reviews.md)). Schemas and the operation id are in [`openapi.json`](openapi.json) (`AiQualityView`).

The endpoint is under `/api/admin` and needs the `ADMIN` role: no token is 401, a farmer or an agrochemist is 403. Errors are RFC 9457 problem documents with a `code` field.

## Endpoint

| Operation | Endpoint | Result |
| --- | --- | --- |
| `getAdminAiQuality` | `GET /api/admin/ai-quality?period=30d&lang=` | `200`, one `AiQualityView`. |

| Parameter | Rule |
| --- | --- |
| `period` | `7d`, `30d` (default) or `season`. `7d` and `30d` count back from now; `season` starts on 1 March (UTC), the previous year's when today is before it. The boundary is 00:00 UTC, which is 05:00 in Kazakhstan. Any other value is 400 `validation_failed`. |
| `lang` | `ru`, `kk` or `en`; it wins over the `Accept-Language` header; the default is `ru`. |

## Result

```
{ "period", "total", "confidenceHistogram", "topDiseases", "trainingData", "mismatches" }
```

| Field | Meaning |
| --- | --- |
| `total` | diagnoses made in the period. |
| `confidenceHistogram` | always 10 numbers: diagnoses per bucket of the model's top confidence, 0–10 %, 10–20 %, … 90–100 %. A confidence of exactly 100 % is in the last bucket. The client turns counts into shares and marks the buckets below its threshold. |
| `topDiseases` | at most 6 classes, most frequent first: `code`, `name`, `count`. Only answers the model stood behind (`ok`, `low_confidence`) are counted; the `unknown` class and the healthy classes (`kind` healthy) are not diseases and are left out. The four queries of one call read one snapshot of the database. `name` is in the asked language, the class code when the catalog has no such class. |
| `trainingData` | `labeled`: photos with an expert decision (all time, not only the period); `addedThisWeek`: of them, decided in the last 7 days; `classes`: classes these decisions cover. |
| `mismatches` | at most 5 pairs, most frequent first: the model said `aiCode`, the experts decided `confirmedCode`, `cases` times (for diagnoses made in the period). Names are in the asked language. |

### What counts as an expert decision

The same rule as the combined verdict of a diagnosis: only `confirmed` and `corrected` reviews decide. A diagnosis is decided when all of them name the same class; when they disagree it is disputed and counts as neither, and a diagnosis with only `unclear` reviews is not decided. A mismatch is a decided diagnosis whose model answer was `ok` or `low_confidence` and whose decided class differs from it.

## Not returned, because the backend has no source yet

- the geography of diseases by district (outbreaks, growth): it comes with the disease map (B17);
- the dataset export (the list of labeled photos): not built; `confirmed_by` of the mock (agrochemist or community) has no source for the community;
- the confidence threshold: the page keeps its own.

## Cost

Every call runs four aggregate queries over `diagnoses` and `diagnosis_reviews`. `diagnoses` has no index on `created_at` alone, so each query scans the table. Nothing is cached: the admin opens the page rarely. Add an index or a cache when the table grows large.
