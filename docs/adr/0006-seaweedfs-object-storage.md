# ADR 0006: SeaweedFS as the S3-compatible object storage

- Status: accepted (decision made with the Docker Compose setup, 21 Oct 2026)
- Scope: `infra`, `services/backend`

## Context

The platform stores plant photos of diagnoses and agrochemist documents (diplomas, certificates). The project
documentation named MinIO for this. Official MinIO images are no longer published, so a stack that has to be
started from a clean checkout can not rely on it.

## Decision

- **SeaweedFS 4.48** (`chrislusf/seaweedfs`) runs in Docker Compose and serves the **S3 API** on port `8333`
  (path-style access, any region). A one-shot `seaweedfs-init` container creates the `diagnosis-photos` bucket
  and exits.
- The backend talks to it with a regular **AWS SDK v2 S3 client**. Only `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY` and `S3_SECRET_KEY` are configured, so another S3-compatible service can replace it without
  code changes.
- One private bucket, separate key prefixes: `diagnoses/` and `agrochemist-documents/`. Tables keep only object
  keys. Nothing hands out public or presigned links; every read goes through a backend endpoint that checks who
  is asking.
- The filer port (`8888`, no authentication) is not published; all published ports are bound to `127.0.0.1`.
- Data lives in the named volume `agroadvisor-seaweedfs-data`.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep MinIO | Images are no longer released (see Context) |
| Files in PostgreSQL (`bytea`, large objects) | Photos would grow the database and its backups; an S3 interface keeps the storage replaceable (a judgement, not measured) |
| A cloud S3 service from the first day | Needs an account and a card before anything runs locally, and the data leaves the country (a judgement) |
| Local disk behind the backend | Ties photos to one container's filesystem; no standard interface to move to a server later |

## Consequences

- The backend depends on the S3 API only, not on SeaweedFS. The orphan-photo cleanup also uses only that API
  ([ADR 0002](0002-orphan-photo-cleanup.md)); the bucket is not versioned, so a deletion is final.
- A staging deployment will need the storage with secrets kept outside the repository; `S3_ACCESS_KEY` and
  `S3_SECRET_KEY` must match the SeaweedFS credentials.
- Details of the local stack: [infra/README.md](../../infra/README.md); the storage rules:
  [architecture.md](../architecture.md).
