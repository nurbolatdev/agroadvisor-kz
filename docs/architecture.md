# System architecture

Status column: **done** means it exists in the repository and runs; **planned** means it is designed but not built yet.

## Components

| Component | Responsibility | Technology | Status |
| --- | --- | --- | --- |
| Mobile app | Photo diagnosis, reference, registration and sign-in, agrochemist verification flow; community, disease map, agro-weather, farm calculator, agrochemist chat are planned | React Native (Expo), TypeScript | in progress |
| Admin web | Agrochemist verification and the disease reference on the real API; sign-in of administrators. Moderation, users, shops and analytics still show demo data | React, TypeScript, Vite | in progress |
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

1. The farmer selects a crop and takes a photo in the mobile app; the request carries an `Idempotency-Key`.
2. The backend validates the request and claims the key in the database (a repeated key returns the diagnosis made the first time; a request still in progress answers `409 request_in_progress`). Request rate is limited per user in Redis.
3. The backend sends the image to the AI service and waits within one overall deadline; the model's confidence decides between a diagnosis, "low confidence" and "unknown".
4. The photo is stored under a fresh object name; one short transaction saves the diagnosis (with the region of the profile at that moment) and releases the claim. Neither the model call nor the storage call happens inside a transaction.
5. A nightly job removes photos that no diagnosis refers to (see ADR 0002).

### Administration

Administrators sign in with a phone or e-mail and a password; the web keeps the access token in memory. Verification of agrochemists and the disease reference are read and changed through `/api/admin/**` and `/api/diseases`; every admin call is checked on the server.

## Backend modules

One package per module under `kz.agroadvisor`, each with `web`, `service`, `repository` and `model`; other modules use only the `service` package.

| Module | State |
| --- | --- |
| `auth`, `users` | done: registration, sign-in, refresh-token rotation with a reuse window (ADR 0003), roles, rate limits, first administrator from the environment |
| `catalog` | done: crops, diseases, treatments, regions; admin editing endpoints |
| `diagnosis` | done: see the flow above |
| `verification` | done: agrochemist documents and the admin decision |
| `access` | feature-access layer, minimal |
| `community`, `consultations`, `notifications`, `shops`, `analytics` | empty |

## File storage

Photos of plants and agrochemist documents (diplomas, certificates) are kept in an S3-compatible storage (SeaweedFS), in one bucket, under separate key prefixes (`diagnoses/` and `agrochemist-documents/`); the database stores only object keys. The bucket is private: it has no public read policy, and nothing hands out public or presigned links to its objects. Only the backend reads and writes it, and every read goes through a backend endpoint that checks who is asking (the owner of a diagnosis, or an admin for a document under review). A file is therefore never reachable by knowing or guessing its URL. If a separate bucket is needed later (for example for documents), it is configured with `app.documents.bucket`.

## Roles

- **Farmer** — diagnosis, community, map, weather, calculator.
- **Agrochemist** — registers with a diploma or certificate, visible after admin verification, answers consultations. A person is a farmer or an agrochemist, not both.
- **Admin** — moderation, verification, reference data, analytics. Cannot be chosen at registration; the first one is created at startup from the environment.

## Extensibility

Premium features may be introduced later, so access checks are implemented through a feature-access layer rather than hard-coded role checks.

## Decisions

Architecture decisions are recorded in [docs/adr/](adr/).
