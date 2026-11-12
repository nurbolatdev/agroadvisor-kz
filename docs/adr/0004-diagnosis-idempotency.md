# ADR 0004: Idempotent diagnosis requests

- Status: accepted (decision of the team lead, confirmed 12 Nov 2026)
- Scope: `services/backend`, `apps/mobile`

## Context

`POST /api/diagnoses` uploads a photo and waits for the model, which takes seconds. On a farmer's mobile network
the answer is often lost after the server has done the work. A plain retry would store a second diagnosis, call
the model a second time and spend the user's rate limit again.

## Decision

- The client sends an `Idempotency-Key` header (one key per diagnosis the user asks for, a UUID fits; every retry of it reuses the key). A repeat with the same key
  returns the first diagnosis with `Idempotent-Replayed: true`; the model is not called again and the diagnosis
  rate limit is not spent.
- The key is tied to the crop and to the SHA-256 of the photo bytes (`request_fingerprint`). Another crop or
  another photo under the same key is `422 idempotency_key_reused` (reason `crop` or `photo`). A malformed key
  is `400 invalid_idempotency_key`.
- The result is protected by a partial unique index on `diagnoses (user_id, idempotency_key)` (`V11`); rows
  without a key do not collide. A check constraint requires the fingerprint whenever there is a key (`V12`).
- While the first request is still running, a second one with the same key gets `409 request_in_progress` with
  `Retry-After: 2`. This is a **claim**: a row in `diagnosis_requests` with primary key `(user_id,
  idempotency_key)`, taken with `INSERT … ON CONFLICT DO NOTHING` (`V14`). No database lock is held while the
  model runs.
- `claim_id` is a fencing token. A claim older than `app.diagnosis.claim-timeout` (90 s) is taken over by
  writing a new `claim_id`, only for the same fingerprint and crop. A request releases or finishes only the
  claim whose `claim_id` it holds. `started_at` is the database clock.
- The claim row is deleted in the same transaction that inserts the diagnosis; abandoned rows are removed after
  an hour.
- Every attempt stores its photo under a new random name, so no attempt overwrites the object of another.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| No idempotency, the client just retries | Duplicate diagnoses, a second model call and a spent limit for one user action |
| Deduplicate by photo hash alone | A farmer may legitimately re-diagnose the same photo; the key says "this is a retry", the hash does not |
| Advisory or row lock held for the whole request | A lock would be held for the duration of the model call and would block a connection |
| Cache the response in Redis | A second store of truth that can disagree with the database; the unique index already gives a durable answer |

## Consequences

- A retry needs the same file bytes as the first attempt; the client must keep the photo until the answer
  arrives.
- A slow original request whose claim was taken over can still finish; the unique index of `V11` guarantees
  that only one diagnosis per key is stored.
- The orphan-photo cleanup minimum age (24 h) must stay above the claim timeout and the one-hour claim cleanup
  ([ADR 0002](0002-orphan-photo-cleanup.md)).
- Schema details: [database-er.md](../diagrams/database-er.md), notes on `V11`, `V12` and `V14`.
