# Diagnosis reviews API

An expert checks a diagnosis of the model: the verdict, the right class and a note. The checks feed the outbreak map (only confirmed diagnoses count), the quality report of the model and, later, training data. The table is `diagnosis_reviews` (`V18`).

Errors are RFC 9457 problem documents with a `code` field.

## Who may review

| Reviewer | Endpoint | Notes |
| --- | --- | --- |
| Agrochemist | `PUT`, `GET /api/consultations/{id}/diagnosis/review` | Only in a consultation of theirs that has an attached diagnosis and has been accepted (`active` or `closed`). A request that is still waiting or was declined is 409 `invalid_consultation_state`. Needs the feature `consultations`. |
| Administrator | `PUT`, `GET /api/admin/diagnoses/{id}/review` | Any diagnosis. |

The farmer is **not** a reviewer of their own diagnosis (a conflict of interest; the model is checked by someone else). Another agrochemist, a missing consultation and a consultation without a diagnosis are 404 (`consultation_not_found`, `diagnosis_not_found`).

## Request

`PUT` with `{ "verdict": "confirmed" | "corrected" | "unclear", "correctCode": string | null, "comment": string | null }`. One review per person and diagnosis: a second `PUT` replaces the first (`updatedAt` moves).

| `verdict` | `correctCode` | Rule |
| --- | --- | --- |
| `confirmed` | omitted (or the model's class) | Possible only when the model gave an answer (`status` `ok` or `low_confidence`); the model's first class is stored. |
| `corrected` | required | A class of the catalog (`unknown_class` otherwise) other than the model's first class (`invalid_verdict` otherwise). |
| `unclear` | not allowed | The reviewer cannot tell from the photo. |

`comment` has at most 2000 characters; a line break and a tab are allowed, other control characters are not.

## Response

```
{ "mine": { "verdict", "correctCode", "comment", "createdAt", "updatedAt" } | null,
  "combined": { "status", "correctCode", "reviews" } }
```

`mine` is the caller's own review (null before they give one). `combined` is what all reviews of the diagnosis add up to; who reviewed is never shown.

| `combined.status` | When |
| --- | --- |
| `none` | no reviews |
| `confirmed`, `corrected` | every deciding review says the same (same verdict and class); `correctCode` is the class |
| `disputed` | deciding reviews differ (another verdict or another class): counts as neither confirmed nor corrected |
| `unclear` | there are reviews, but all are `unclear` |

Only `confirmed` and `corrected` decide; an `unclear` mark does not contradict a decisive verdict. Administrators and agrochemists weigh the same.

## Errors

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `validation_failed` | unknown verdict, comment too long or with control characters |
| 400 | `invalid_verdict` | `confirmed` for an answer the model did not give or for another class, `corrected` without a class or with the model's own class, a class with `unclear` |
| 400 | `unknown_class` | the corrected class is not in the catalog |
| 401, 403 | `unauthorized`, `forbidden` | no token; another role |
| 404 | `consultation_not_found`, `diagnosis_not_found` | not the agrochemist of the consultation, no such consultation, no attached diagnosis, no such diagnosis |
| 409 | `invalid_consultation_state` | the consultation is not accepted yet or was declined |

## Not available yet

- A list of reviews for the admin web and the quality report; the map and the report read the table directly when they arrive.
