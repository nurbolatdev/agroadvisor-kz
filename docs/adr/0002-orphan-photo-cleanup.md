# ADR 0002: Cleanup of orphaned diagnosis photos (storage compared with the database)

- Status: proposed (to be accepted by the team lead with the pull request)
- Scope: `services/backend`
- Issue: #69

## Context

A diagnosis photo is uploaded to the bucket before the row of the diagnosis is inserted (the model is asked
first, then the photo is stored, then one short transaction inserts the row and releases the claim). A photo
can therefore stay in the bucket without a row:

- the process stops between the upload and the commit;
- the outcome of the commit is unknown (a connection breaks while committing), so the attempt cannot tell
  whether the row exists and must not delete the photo.

Until now a request with an `Idempotency-Key` named its object `SHA-256(key + fingerprint)`, so every attempt of
the same request wrote the same object and a failed keyed request could not delete it (another attempt might be
using it). Objects were never removed.

The bucket is **not versioned**: a deleted object is gone. Wrongly deleting a live photo means a diagnosis whose
photo answers `404` for ever.

## Decision

### 1. One object per attempt

Every attempt, with or without a key, stores its photo under a new random name
(`diagnoses/<userId>/<uuid>.<ext>`). Nothing is ever overwritten. This removes the race the cleanup would
otherwise have: list an old object, a retry overwrites it and becomes live, the database check finds no row yet,
the cleanup deletes a photo that just became live.

A failed attempt removes its own object only when it knows no row exists: the failure came from the body of the
transaction (it is rolled back), or it lost the unique-index race and the winner's row points to another object.
When the outcome of the commit is unknown, the object stays and the cleanup decides.

Objects named with the old scheme stay valid: rows refer to them by `photo_key`, and nothing reconstructs a
name.

### 2. A nightly job compares the bucket with the database

`OrphanPhotoCleanup` (03:30, Asia/Almaty) lists `diagnoses/`, skips objects younger than `min-age`, asks the
database in batches which of the remaining keys some diagnosis points to (`diagnoses.photo_key`, index
`diagnoses_photo_key_idx`, V15) and deletes the ones nobody points to. The comparison is by exact key:
`photo_key` holds the same full key the storage lists.

Safety layers, because the deletion is final:

| Layer | Purpose |
| --- | --- |
| `min-age` = 24 h (the application does not start unless it exceeds both the claim timeout and the 1 h cleanup of claims) | an object of a request that is still working is never looked at |
| second database look right before `DeleteObjects` | a candidate that became live meanwhile is kept |
| `max-deletes-per-run` = 500 | a bug costs at most this many photos per run; the limit is per run, so with several instances whose clocks differ a little, each of them can run once after the other and delete up to the limit |
| `max-orphan-ratio` = 0.2 | if more than a fifth of the old objects look orphaned, the comparison itself is broken (wrong key format, wrong database, wrong prefix): the run aborts and deletes nothing |
| `dry-run` = on by default | the first nights only count |
| PostgreSQL advisory lock | one instance works at a time; deletes are idempotent anyway |
| prefix `diagnoses/` only | the documents of agrochemists (`agrochemist-documents/`) are not touched; they have their own lifecycle (#66) |

### 3. Why 24 hours

An attempt lives at most `claim-timeout` (90 s); its claim row is removed after an hour at the latest. 24 h is
more than an order of magnitude above both, so no live attempt can be affected, and a night's delay in freeing a
few kilobytes costs nothing.

## Why not the alternatives

- **A journal of uploads (table `photo_uploads`, written before the upload, marked when the row exists).**
  Exact, and cheap to query, but it adds a write to every request, a table to keep consistent with the bucket,
  and its own failure modes (a crash between the journal and the upload). At today's volume the walk over the
  bucket is simpler and cannot disagree with the truth: the database row decides.
- **A lifecycle rule of the bucket (expire objects after N days).** It would also delete live photos: the bucket
  knows nothing about rows. Not an option for data the application keeps.
- **Deleting in the request path only.** Cannot cover a crash or an unknown commit outcome, which is exactly
  what is left.

## When to move to a journal

When the bucket has about one million objects, or when a walk takes more than a few minutes (the listing is
sequential and the lock connection is held for its whole duration). Then the cleanup should read the objects
that the journal marks as unconfirmed instead of listing everything.

## Consequences and residual risks

- The deletion is irreversible. The mitigations above limit the damage; the roll-out plan (dry run, then a
  small `max-deletes-per-run`, then the normal limit) is in the pull request.
- On a small bucket the ratio guard can abort legitimately: 1 orphan among 4 old objects is 25 %. The run then
  needs a person to look and, if the objects are really orphans, to raise `max-orphan-ratio` once. This is the
  intended direction of error.
- A run holds one database connection for its whole duration (the advisory lock is per session). The pool is
  large enough for one.
- If releasing the lock fails, the connection is discarded instead of going back to the pool with the lock held.
- **Alive means `diagnoses.photo_key`.** Anything else that refers to an object under `diagnoses/` (for example a
  community post made from a diagnosis result) must be added to `DiagnosisRepository.findExistingPhotoKeys`
  before it is released, or the cleanup deletes that photo once its diagnosis row is gone or the key is
  referenced only there. The invariant is written next to the query and next to the migration.
- **Roll-out order.** Switch `dry-run` off only when every instance runs the code with random object names. An
  instance of the old code overwrites an old object on a keyed retry (the hash name); if that happened between
  the second database look and `DeleteObjects` of an instance running the cleanup, a live photo would go.
- Monitoring: `agroadvisor.photos.orphans{outcome=found|removed|failed|aborted|skipped_young}`,
  `agroadvisor.photos.orphan_cleanup.duration` and `agroadvisor.photos.orphan_cleanup.last_success` (epoch
  seconds of the last run of that instance that walked the whole bucket without aborting; a dry run counts,
  deletions that failed are counted as `failed`). The gauge is in memory and starts at 0, and an instance that
  never gets the lock keeps 0: alert on `max()` over the instances when `last_success` is older than 48 h, with
  a grace period after a deploy, and on any `aborted`.
- Rollback: `APP_PHOTOS_ORPHAN_CLEANUP_ENABLED=false` and a restart.
