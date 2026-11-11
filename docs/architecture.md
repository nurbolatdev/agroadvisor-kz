# System architecture

Status column: **done** — exists in the repository and runs; **in progress** — partly built (the text says which part); **planned** — designed but not built yet.

## Components

| Component | Responsibility | Technology | Status |
| --- | --- | --- | --- |
| Mobile app | Photo diagnosis, reference, registration and sign-in, agrochemist verification flow; community, disease map, agro-weather, farm calculator, agrochemist chat are planned | React Native (Expo), TypeScript | in progress |
| Admin web | Sign-in of administrators, agrochemist verification and the disease reference (read-only) on the real API. Dashboard, AI quality, community, moderation, users, shops, settings and the sidebar counters still show demo data | React, TypeScript, Vite | in progress |
| Backend | Auth and users, regions and disease reference, photo diagnosis, agrochemist verification. Community, consultations, notifications, shops and analytics are empty modules | Spring Boot, Maven | in progress |
| AI service | Plant disease recognition from photo, photo quality check | Python, FastAPI, PyTorch | done |
| PostgreSQL | Primary data storage (PostGIS image), schema in Flyway migrations | PostgreSQL | done |
| Redis | Cache of reference data (regions, diseases) and request rate limits. Not used for sessions: the API is stateless (JWT) | Redis | done |
| Object storage | Diagnosis photos and agrochemist documents | SeaweedFS (S3 API) | done |
| Nginx | Reverse proxy, TLS termination | Nginx | planned (staging) |

## Data flow

Today clients call the backend directly; the proxy in front of it is planned.

```
Mobile app ─┐
            ├──► (Nginx, planned) ──► Backend ──► PostgreSQL
Admin web ──┘                          │  ├────► Redis
                                       │  ├────► Object storage
                                       │  └────► AI service
```

### Photo diagnosis

1. The farmer selects a crop and takes a photo in the mobile app; the request may carry an `Idempotency-Key`.
2. The backend validates the request. With a key it claims the key in the database: a repeated key with the same crop and the same photo returns the diagnosis made the first time, a different crop or photo under the same key answers `422 idempotency_key_reused`, and a request still in progress answers `409 request_in_progress`. Without a key there is no claim and no replay. Request rate is limited per user in Redis.
3. The backend sends the image to the AI service with connect and read timeouts and one retry. The worst-case length of a request is computed, and the application refuses to start if it exceeds the claim timeout. The AI service decides the outcome from the model's confidence: a diagnosis, low confidence, unknown, or a crop mismatch.
4. The photo is stored under a fresh object name; one short transaction saves the diagnosis (with the region of the profile at that moment) and releases the claim. Neither the model call nor the storage call happens inside a transaction.
5. A nightly job (03:30, Asia/Almaty) finds photos that no diagnosis refers to. It runs in dry-run mode (it only counts) until it is switched on after a manual check (see ADR 0002).

### Administration

Administrators sign in with a phone or e-mail and a password. The web keeps the access token in memory and the refresh token in the tab's `sessionStorage`. Applications of agrochemists are read and decided through `/api/admin/agrochemists/**`; the disease reference is read through `/api/diseases`. The backend also has endpoints to edit crops, diseases and treatments (`/api/admin/**`), which the web does not use yet. Every admin call is checked on the server.

## Backend modules

One package per module under `kz.agroadvisor`. The intended layout, written in each `package-info.java`, is `web`, `service`, `repository` and `model` (plus `config` where needed), and a module uses another module only through its `service` package; today a few modules still reach into another one's `model` or `repository` (for example `diagnosis` uses the catalog, `auth` uses the user model).

| Module | State |
| --- | --- |
| `auth`, `users` | done: registration, sign-in, refresh-token rotation with a reuse window (ADR 0003), roles, rate limits, first administrator from the environment |
| `catalog` | done: crops, diseases, treatments, regions; admin editing endpoints |
| `diagnosis` | done: see the flow above |
| `verification` | done: agrochemist documents and the admin decision |
| `access` | feature-access layer, minimal |
| `common` | shared pieces: errors, cache, rate limiting, configuration checks, image handling |
| `community`, `consultations`, `notifications`, `shops`, `analytics` | empty |

## File storage

Photos of plants and agrochemist documents (diplomas, certificates) are kept in an S3-compatible storage (SeaweedFS), in one bucket, under separate key prefixes (`diagnoses/` and `agrochemist-documents/`); the database stores only object keys. The bucket is private: it has no public read policy, and nothing hands out public or presigned links to its objects. Only the backend reads and writes it, and every read goes through a backend endpoint that checks who is asking (the owner of a diagnosis, or an admin for a document under review). A file is therefore never reachable by knowing or guessing its URL. If a separate bucket is needed later (for example for documents), it is configured with `app.documents.bucket`.

## Roles

- **Farmer** — diagnosis, community, map, weather, calculator.
- **Agrochemist** — registers with a diploma or certificate, visible after admin verification, answers consultations. Registration gives a person exactly one of farmer or agrochemist; a database-level rule that keeps them exclusive is pending (issue #99).
- **Admin** — moderation, verification, reference data, analytics. Cannot be chosen at registration; the first one is created at startup from the environment.

## Extensibility

Premium features may be introduced later, so access checks are implemented through a feature-access layer rather than hard-coded role checks.

## Decisions

Architecture decisions are recorded in [docs/adr/](adr/).
