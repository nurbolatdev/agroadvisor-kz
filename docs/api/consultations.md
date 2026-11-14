# Consultations API

A farmer asks a verified agrochemist for advice; once the agrochemist accepts, the two chat. The text of the request is the first message of the chat. Schemas and operation ids are in [`openapi.json`](openapi.json); the tables are described in [`database-er.md`](../diagrams/database-er.md) (migration `V20`).

Errors are RFC 9457 problem documents with a `code` field (see [error codes](#error-codes)).

## Not available yet

- **Photos in messages.** The `photoUrl` field of a message is always `null`; a message has only text. Sending a photo and the photo endpoint come in a follow-up change.
- **The attached diagnosis for the agrochemist.** A farmer may attach one of their own diagnoses to a request (`diagnosisId`), and the id is returned in the consultation. The agrochemist cannot open that diagnosis yet; `GET /api/diagnoses/{id}` still answers 404 to them.
- Realtime delivery: the chat is read by polling with the `after` cursor.

## Access

All endpoints need an access token and the `consultations` feature of the user's plan.

| Who | Allowed |
| --- | --- |
| Farmer | every endpoint except `accept` and `decline`; `POST /api/consultations` only for farmers |
| Agrochemist | every endpoint except `POST /api/consultations`; `accept` and `decline` only for agrochemists |
| Admin (without the farmer or agrochemist role) | refused: 403 `forbidden` on every endpoint |
| No or bad token | 401 `unauthorized` |

A user sees only consultations they take part in. Another user's consultation and a missing id give the same answer, 404 `consultation_not_found`. An agrochemist can create a consultation nowhere, and a farmer who calls `accept` or `decline` gets 403 (role check) before anything else.

## Status machine

```
requested --accept (agrochemist)--> active --close (farmer or agrochemist)--> closed
requested --decline (agrochemist)--> declined
requested --close (farmer, withdrawal)--> closed
```

- `requested`: waits for the agrochemist. `acceptedAt` and `closedAt` are empty.
- `active`: the chat is open. `acceptedAt` is set.
- `declined`, `closed`: final. `closedAt` is set; `closedBy` is the user who declined or closed. A request withdrawn by the farmer is `closed` with `closedBy` = the farmer.
- Any action that does not fit the current status is 409 `invalid_consultation_state`; the problem's `reason` holds the current status.
- Only one open (`requested` or `active`) consultation can exist per farmer and agrochemist pair.
- History (`GET .../messages`) and `read` work in every status; sending works only in `active`.

## Limits

| Limit | Value | Answer |
| --- | --- | --- |
| Requests waiting for an answer per farmer | 5 | 409 `consultation_request_limit` |
| New requests per farmer per hour | 10 (`app.rate-limit.consultation-requests-per-hour`); a failed attempt counts too | 429 `rate_limited` |
| Messages per user per minute | 30 (`app.rate-limit.consultation-messages-per-minute`) | 429 `rate_limited` |
| Text length | 1 to 2000 characters after trimming | 400 `validation_failed` |

## Consultation object

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `status` | string | `requested`, `active`, `declined`, `closed` |
| `farmer` | object | `id`, `fullName`, `regionId` (nullable) |
| `agrochemist` | object | `id`, `fullName` |
| `diagnosisId` | uuid or null | the diagnosis the farmer attached |
| `createdAt`, `acceptedAt`, `closedAt` | timestamp | the last two are nullable |
| `closedBy` | uuid or null | who declined or closed |
| `lastMessage` | object or null | `id`, `senderId`, `text` (first 140 characters, null for a photo without text), `hasPhoto`, `createdAt` |
| `unreadCount` | integer | incoming messages the caller has not read; always 0 for `declined` and `closed` consultations |

## Message object

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `senderId` | uuid | |
| `text` | string or null | |
| `photoUrl` | null | always `null` for now |
| `createdAt` | timestamp | |
| `readAt` | timestamp or null | when the other side read it |

## Endpoints

### `POST /api/consultations` (farmer)

Request: `{ "agrochemistId": uuid, "text": string, "diagnosisId": uuid | null }`.
Response: 201 with the consultation (status `requested`) and `Location: /api/consultations/{id}`.

Errors: 400 `validation_failed`; 404 `agrochemist_not_found` (not a verified, listed agrochemist); 404 `diagnosis_not_found` (not the farmer's own diagnosis); 409 `consultation_already_open` (the `Location` header, present when the open one is known, points to it); 409 `consultation_request_limit`; 429 `rate_limited`.

### `GET /api/consultations`

Query: `status` (repeatable: `requested`, `active`, `declined`, `closed`; none means all), `page` (from 0, default 0, up to 10000), `size` (1 to 50, default 20).
Response: an array of consultation objects, the latest activity (last message) first. Unknown status or out-of-range number: 400 `validation_failed`.

### `GET /api/consultations/{id}`

Response: the consultation. 404 `consultation_not_found`.

### `POST /api/consultations/{id}/accept` (agrochemist)

Only from `requested`. Response: the consultation, now `active`.
Errors: 404 `consultation_not_found`; 409 `invalid_consultation_state`; 409 `agrochemist_not_listed` (the agrochemist is no longer in the directory).

### `POST /api/consultations/{id}/decline` (agrochemist)

Only from `requested`. Response: the consultation, now `declined`.
Errors: 404 `consultation_not_found`; 409 `invalid_consultation_state`.

### `POST /api/consultations/{id}/close`

Either side from `active`; the farmer also from `requested` (withdrawal). Response: the consultation, now `closed`.
Errors: 404 `consultation_not_found`; 409 `invalid_consultation_state`.

### `POST /api/consultations/{id}/messages`

Request: `{ "text": string }` (trimmed, 1 to 2000 characters). Only in an `active` consultation.
Response: 201 with the message and `Location: /api/consultations/{id}/messages`.
Errors: 400 `validation_failed`; 404 `consultation_not_found`; 409 `invalid_consultation_state`; 429 `rate_limited`.

### `GET /api/consultations/{id}/messages`

Query: `before` (message id), `after` (message id), `limit` (1 to 100, default 30). Response: an array of messages.

Pagination uses message ids as cursors, not page numbers:

- No cursor, or `before`: the newest messages first, only those older than `before`. To load older history, pass the id of the last (oldest) message of the previous page. A page shorter than `limit` is the end of the history.
- `after`: the oldest first, only those newer than `after`. To get new messages while the chat is open, pass the id of the newest message you hold.
- `before` and `after` together: 400 `validation_failed`.
- A cursor that is not a message of this consultation: 404 `message_not_found`.

Order is by creation time, then id. Works in every status.

### `POST /api/consultations/{id}/read`

Request: `{ "upTo": uuid }`. Marks incoming messages (sent by the other side) up to and including `upTo` as read, which sets their `readAt` (the sender sees it as a read receipt). Repeating the call changes nothing.
Response: `{ "unreadCount": integer }`, the incoming messages that are still unread in this consultation.
Errors: 404 `consultation_not_found`; 404 `message_not_found` (`upTo` is not a message of this consultation).

### `GET /api/consultations/unread-count`

Response: `{ "count": integer }`, the incoming unread messages in the `requested` and `active` consultations of the caller; declined and closed ones are not counted, so the number matches the sum of `unreadCount` in the list.

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `validation_failed` | empty or too long text, text with control characters (a line break and a tab are allowed), unknown status, `limit`, `size` or `page` out of range, `before` with `after`, malformed body |
| 401 | `unauthorized` | no or invalid token |
| 403 | `forbidden` | the role or the plan does not allow the endpoint (an admin, an agrochemist creating a request, a farmer accepting) |
| 404 | `consultation_not_found` | missing id or another user's consultation |
| 404 | `agrochemist_not_found` | the agrochemist does not exist or is not verified |
| 404 | `diagnosis_not_found` | the attached diagnosis is not the farmer's own or does not exist |
| 404 | `message_not_found` | a `before`, `after` or `upTo` id is not a message of this consultation |
| 409 | `consultation_already_open` | an open consultation with this agrochemist exists; `Location` points to it when known |
| 409 | `consultation_request_limit` | 5 requests are already waiting for an answer |
| 409 | `invalid_consultation_state` | the action does not fit the status; `reason` = current status |
| 409 | `agrochemist_not_listed` | the agrochemist left the directory, so the request cannot be accepted |
| 429 | `rate_limited` | too many requests per hour or messages per minute |
