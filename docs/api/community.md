# Community API

Farmers ask questions about their crops; farmers and agrochemists answer, vote and follow crops. The author of a question picks the best answer. Schemas and operation ids are in [`openapi.json`](openapi.json); the tables are described in [`database-er.md`](../diagrams/database-er.md) (migration `V25`); the decisions are in [ADR 0012](../adr/0012-community-and-moderation.md).

In the API a post is called a question. Errors are RFC 9457 problem documents with a `code` field (see [error codes](#error-codes)).

## Not available yet

- Editing and deleting one's own question or answer, photos in answers, votes on questions.

## Access

All endpoints need an access token and the `community` feature of the user's plan.

| Who | Allowed |
| --- | --- |
| Farmer | every endpoint, including `POST /api/community/questions` |
| Agrochemist | every endpoint except `POST /api/community/questions` (403) |
| Admin (without the farmer or agrochemist role) | refused: 403 `forbidden` on every endpoint |
| No or bad token | 401 `unauthorized` |

The community is shared: every reader sees every visible question and answer. A hidden question answers 404 `question_not_found` to everyone, its author included; a hidden answer is not listed and cannot be voted on or picked. The `authorExpert` flag is `true` only for an agrochemist whose profile is verified.

## Rules

- Only a farmer asks. Farmers and agrochemists answer, vote and follow crops.
- The region (and district) of a question is copied from the author's profile when the question is created; the request has no region field. A farmer without a region in the profile gets 400 `region_required`.
- The status of a question is `open` until the author picks the best answer, then `solved`. The author may change the best answer or clear it (the question is `open` again). Hiding the best answer clears it too.
- The author of an answer cannot vote for it or pick it as the best one (409 `own_answer`). The author of a question may answer it.
- A vote is `1` or `-1`; one vote per user and answer, a repeat replaces it. `score` is the sum of the votes.
- A question holds at most 200 answers (409 `answer_limit`).
- A diagnosis can be attached only by the author and only the author's own one; its crop must be the crop of the question. Every reader sees it through the question, not through `/api/diagnoses`.

## Notifications

The community writes to the [notification feed](notifications.md#types) in the transaction of the event:

- a new answer: `community_answer` to the author of the question (not for an answer to one's own question);
- a picked best answer: `community_answer_accepted` to the author of the answer (clearing the choice, repeating the same pick and picking one's own answer, which is refused anyway, send nothing);
- a new question: `community_question` to every user with an active account who follows its crop, except the author. Unread rows collapse into one with a counter.

Known debt: the rows for subscribers are written inside the transaction of the question. With more than about 1000 subscribers of one crop this should move to a batch insert or an outbox.

Known debt: the push relay runs synchronously after the commit. With a real FCM provider, sending to N subscribers delays the request of the question, so it needs `@Async` or an outbox.

Known debt: a notification keeps the latest `questionId` and `answerId`. After moderation hides that question or answer, opening it leads to 404.

## Photos

A question has 0 to 3 photos (JPEG or PNG, up to 10 MB each). They travel in the same multipart request as the question, so the whole request is limited to 11 MB (the app already compresses photos). The type is read from the first bytes, the `Content-Type` of the part is not trusted. The metadata (GPS, camera data) is removed before the photo is stored; the orientation is kept. Photos are stored under the key prefix `community/<questionId>/`.

## Limits

| Limit | Value | Answer |
| --- | --- | --- |
| New questions per user per hour | 10 (`app.rate-limit.community-questions-per-hour`); a failed attempt counts too | 429 `rate_limited` |
| New answers per user per hour | 30 (`app.rate-limit.community-answers-per-hour`) | 429 `rate_limited` |
| Votes per user per minute | 60 (`app.rate-limit.community-votes-per-minute`) | 429 `rate_limited` |
| Reports per user per hour | 20 (`app.rate-limit.community-reports-per-hour`); every attempt counts | 429 `rate_limited` |
| Answers per question | 200 | 409 `answer_limit` |
| Question title | 3 to 120 characters after trimming | 400 `validation_failed` |
| Question or answer text | 1 to 2000 characters after trimming | 400 `validation_failed` |
| Photos per question | 3 | 400 `invalid_image` |
| Crops followed | 20 | 400 `validation_failed` |

The text of a question and of an answer may hold a line break and a tab, no other control characters. A title is one line: neither a line break nor a tab.

## Question object

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `authorId`, `authorName` | uuid, string | |
| `authorExpert` | boolean | a verified agrochemist |
| `mine` | boolean | the caller asked it |
| `cropCode` | string | |
| `regionId` | integer | the author's region at the time of asking |
| `districtId` | integer or null | |
| `title`, `text` | string | |
| `status` | string | `open` or `solved` |
| `answerCount` | integer | visible answers only |
| `photoUrls` | array of string | relative paths `/api/community/questions/{id}/photos/{photoId}`, in order; `GET` them with the same token |
| `diagnosisUrl` | string or null | `/api/community/questions/{id}/diagnosis` when a diagnosis is attached |
| `createdAt` | timestamp | |

## Answer object

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `questionId` | uuid | |
| `authorId`, `authorName` | uuid, string | |
| `authorExpert` | boolean | a verified agrochemist |
| `mine` | boolean | the caller wrote it |
| `text` | string | |
| `score` | integer | sum of the votes |
| `myVote` | integer | the caller's vote: `-1`, `0` or `1` |
| `accepted` | boolean | the best answer of the question |
| `createdAt` | timestamp | |

## Endpoints

### `POST /api/community/questions` (farmer)

Multipart form: `title`, `text`, `cropCode`, optional `diagnosisId`, and 0 to 3 parts `photos`. Response: 201 with the question and `Location: /api/community/questions/{id}`.

The checks run in this order: fields, crop, photos, diagnosis; then the rate limit; then the photos are stored and the question is saved in one transaction. If saving fails, the stored objects are deleted.

Errors: 400 `validation_failed` (title or text, unknown crop, a diagnosis of another crop); 400 `region_required`; 400 `invalid_image` (another type, broken file, more than 3 photos); 404 `diagnosis_not_found` (not the author's own diagnosis); 413 `payload_too_large` (over the upload limit, answered before the service); 429 `rate_limited`; 503 `storage_unavailable`.

### `GET /api/community/questions`

The feed, newest first (by creation time, then id), without hidden questions.

| Query | Meaning |
| --- | --- |
| `crop` | crop code; repeat the parameter for up to 4 crops |
| `regionId` | region of the question |
| `status` | `open`, `solved` or `unanswered` (no visible answer) |
| `mine` | `true` for the caller's own questions (default `false`) |
| `before` | id of the last (oldest) question of the previous page |
| `limit` | 1 to 50, default 20 |

Response: an array of questions. A page shorter than `limit` is the end of the feed. A `before` that is not a question: 404 `question_not_found`; a hidden question is a valid cursor. Unknown `status`, more than 4 crops or `limit` out of range: 400 `validation_failed`.

### `GET /api/community/questions/{id}`

Response: the question. 404 `question_not_found`.

### `GET /api/community/questions/{id}/photos/{photoId}`

The photo bytes. Cached for a year (`private, immutable`), with an `ETag`; `If-None-Match` gives 304. Errors: 404 `question_not_found`, `photo_not_found` (no such photo, or the object is missing from the storage); 503 `storage_unavailable`.

### `GET /api/community/questions/{id}/diagnosis`

The attached diagnosis in the shape of `GET /api/diagnoses/{id}`; its `photoUrl` is `/api/community/questions/{id}/diagnosis/photo`. Errors: 404 `question_not_found`; 404 `diagnosis_not_found` (none attached, or it was deleted since).

### `GET /api/community/questions/{id}/diagnosis/photo`

The photo of the attached diagnosis, with the same headers as a question photo. Same errors as above.

### `GET /api/community/questions/{id}/answers`

Visible answers: the best answer first, then by `score` (highest first), creation time and id. Response: an array of answers (no paging, at most 200). 404 `question_not_found`.

### `POST /api/community/questions/{id}/answers`

Request: `{ "text": string }`. Response: 201 with the answer, without a `Location` (an answer has no address of its own; read the list).
Errors: 400 `validation_failed`; 404 `question_not_found`; 409 `answer_limit`; 429 `rate_limited`.

### `PUT /api/community/questions/{id}/accepted-answer`

The author of the question only. Request: `{ "answerId": uuid }`. Replaces the previous best answer; repeating the call changes nothing. Response: 204.
Errors: 400 `validation_failed`; 403 `not_question_author`; 404 `question_not_found`; 404 `answer_not_found` (not a visible answer of this question); 409 `own_answer`.

### `DELETE /api/community/questions/{id}/accepted-answer`

The author of the question only; the question becomes `open`. Without a best answer it does nothing. Response: 204. Errors: 403 `not_question_author`; 404 `question_not_found`.

### `PUT /api/community/answers/{id}/vote`

Request: `{ "value": 1 | -1 }`. Response: `{ "score": integer, "myVote": integer }` after the change.
Errors: 400 `validation_failed`; 404 `answer_not_found` (missing, hidden, or its question is hidden); 409 `own_answer`; 429 `rate_limited`.

### `DELETE /api/community/answers/{id}/vote`

Takes the vote back; without one it does nothing. It counts toward the votes limit like a vote. Response: `{ "score", "myVote" }`. Errors: 404 `answer_not_found`; 409 `own_answer` (one's own answer); 429 `rate_limited`.

### `GET /api/community/subscriptions`

The crops the caller follows. Response: `{ "crops": [string] }`, alphabetical.

### `PUT /api/community/subscriptions`

Request and response: `{ "crops": [string] }`. Replaces the whole set in one transaction. Up to 20 different known crop codes; otherwise 400 `validation_failed` and the previous set stays.

### `POST /api/community/reports`

Reports a visible question or answer of someone else. Request: `{ "targetType": "question" | "answer", "targetId": uuid, "reason": "ads" | "misinformation" | "spam" | "abuse", "comment": string? }`; the comment is optional, up to 500 characters. Response: 204. All reports about one target hang under one open case that the admin decides once; one report per user per case, a repeat changes nothing (also 204). After the case is resolved, a new report opens a new case. Counts toward 20 reports per user per hour, every attempt included. Errors: 400 `validation_failed`; 404 `question_not_found` or `answer_not_found` (missing or hidden target); 409 `own_content` (one's own question or answer); 409 `complaint_resolved` (rare: the case was resolved again and again while the report was being added, after 3 attempts; send it once more); 429 `rate_limited`.

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `validation_failed` | empty, too short or too long text, control characters, unknown crop, a diagnosis of another crop, unknown `status`, `limit` out of range, more than 4 crops in the feed filter, a vote that is not 1 or -1, bad subscription set |
| 400 | `region_required` | the farmer has no region in the profile, so the question cannot be tied to a region |
| 400 | `invalid_image` | a photo is not a JPEG or PNG of up to 10 MB, cannot be read, or there are more than 3 |
| 400 | `bad_request` | malformed JSON body, an id that is not a UUID |
| 401 | `unauthorized` | no or invalid token |
| 403 | `forbidden` | the role or the plan does not allow the endpoint (an admin, an agrochemist asking) |
| 403 | `not_question_author` | only the author of the question may pick or clear the best answer |
| 404 | `question_not_found` | missing or hidden question, or a `before` that is not a question |
| 404 | `answer_not_found` | missing or hidden answer, or an answer of another question |
| 404 | `photo_not_found` | the question has no such photo, or its object is missing from the storage |
| 404 | `diagnosis_not_found` | no diagnosis is attached, it was deleted, or it is not the author's own |
| 409 | `own_answer` | voting for or picking one's own answer |
| 409 | `own_content` | reporting one's own question or answer |
| 409 | `complaint_resolved` | a report could not be added: its case was resolved during all 3 attempts (rare; repeat) |
| 409 | `answer_limit` | the question already has 200 answers |
| 413 | `payload_too_large` | the request is over the upload limit (11 MB) |
| 429 | `rate_limited` | too many questions or answers per hour, or votes per minute |
| 503 | `storage_unavailable` | the photo storage did not answer |

The admin moderation (`/api/admin/community`) has its own codes, `complaint_not_found` and `complaint_resolved` among them; see [`admin-community.md`](admin-community.md). The user's report endpoint returns only `complaint_resolved`, and only in the rare case in the table above.
