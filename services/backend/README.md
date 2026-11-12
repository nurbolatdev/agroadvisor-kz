# AgroAdvisor KZ — Backend

Core REST API of the platform: used by the mobile app and the admin panel.

## Responsibilities

Done:

- Authentication and roles (farmer, agrochemist, admin), refresh with rotation, rate limits
- Diagnoses: forwarding images to the AI service, storing results, idempotent retries
- Agrochemist verification: documents and the admin decision
- Disease and crop reference, regions; admin editing of crops, diseases and treatments
- Caching with Redis

Planned (the package exists, there is no code yet):

- Community: posts, answers, votes, moderation
- Consultations and chat with agrochemists
- Regional statistics, the disease map and analytics for the admin panel
- Agro shop directory, push notifications and alerts

## Stack

Java 21, Spring Boot 4.1, Maven (wrapper included), PostgreSQL 16 + PostGIS, springdoc-openapi, Testcontainers.

## Run locally

1. Start the dependencies — see [`infra/README.md`](../../infra/README.md):
   ```bash
   cd infra && docker compose up -d
   ```
2. Start the API from `services/backend`:
   ```bash
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

Profiles:

- No profile: safe defaults (API docs off, placeholder model refused, health without details) and no datasource, so the application does not start by itself.
- `local`: development against `infra/`. Enable it explicitly; in an IDE set "Active profiles" to `local`. Do not export `SPRING_PROFILES_ACTIVE` in a shell where tests run.
- `test`: used by the tests.
- `prod`: the server, see [Production profile](#production-profile).

The `local` profile connects to PostgreSQL on `localhost:5433` and reads the database name, user and password from `infra/.env`, so passwords are kept in one place.

Diagnoses call the AI service at `AI_SERVICE_URL` (default `http://localhost:8000`; `cd infra && docker compose --profile ai up -d`). To work without it set `AI_CLIENT=stub` (a fake that always answers "healthy"; `allow-placeholder` is already `true` in the local profile).

| URL | What |
| --- | --- |
| http://localhost:8080/swagger-ui.html | Swagger UI |
| http://localhost:8080/v3/api-docs | OpenAPI JSON |
| http://localhost:8080/actuator/health | Health, including the database |

Settings can be overridden with environment variables: `SERVER_PORT`, `DB_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.

### Production profile

The `prod` profile takes every address and secret from the environment:

| Variable | Meaning |
| --- | --- |
| `DB_URL` | Full JDBC URL of PostgreSQL |
| `DB_USERNAME`, `DB_PASSWORD` | Database credentials |
| `REDIS_HOST`, `REDIS_PASSWORD` | Redis address and password (required); `REDIS_PORT` defaults to 6379 |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Photo storage; `S3_BUCKET` is optional |
| `JWT_SECRET` | Base64 signing key |
| `AI_SERVICE_URL` | Address of the AI service |
| `APP_CORS_ORIGINS` | Optional. Comma-separated browser origins of the admin web (`https://host[:port]`, no wildcard, no path); empty = no cross-origin access (the `local` profile allows `http://localhost:5173`, the Vite dev server, by default). Tokens travel in `Authorization`, so no credentials are allowed |

#### First administrator

No API call can create an administrator (`admin` cannot be chosen at registration). To create the first one, start the backend once with:

| Variable | Meaning |
| --- | --- |
| `APP_BOOTSTRAP_ADMIN_ENABLED` | `true` to turn the bootstrap on (default `false`) |
| `APP_BOOTSTRAP_ADMIN_LOGIN` | Phone (`+7...`) or e-mail; required when enabled |
| `APP_BOOTSTRAP_ADMIN_PASSWORD` | At least 12 characters, at most 72 bytes; required when enabled; never logged |
| `APP_BOOTSTRAP_ADMIN_FULL_NAME`, `APP_BOOTSTRAP_ADMIN_LANGUAGE` | Optional; default `Administrator` and `ru` (`ru`, `kk` or `en`) |

It runs at every start but only creates the account when no administrator exists (a blocked administrator counts as existing), so after the first start the variables can be removed. Two instances starting together with the same `APP_BOOTSTRAP_ADMIN_LOGIN` are safe: the loser of the race sees the administrator and skips (with different logins both would create an administrator). A login that already belongs to another account is never promoted: the start fails with an explanation. Invalid values stop the start.

The start is aborted with a list of the missing variable names. It is also refused with `app.ai.allow-placeholder=true` or springdoc enabled. `AI_CLIENT` has no effect in `prod`; any override of `app.ai.client` (such as `APP_AI_CLIENT`) to a value other than `http` aborts the start. Actuator exposes only `health`, without details.

### Container image

```bash
docker build -t agroadvisor-backend:local services/backend
```

The image is a multi-stage build (Temurin 21, layered jar, non-root user 10001). It starts in the `prod` profile by default (`SPRING_PROFILES_ACTIVE=prod`) and refuses to start without the variables from the table above. It listens on port 8080; do not change `SERVER_PORT`, the health check uses that port. Memory follows the container limit (`JAVA_TOOL_OPTIONS`, 75% of RAM, exit on out-of-memory); override the variable to tune it. The health check calls `/actuator/health/liveness`. Tests are not built or run in the image; the CI job `backend` runs them. The whole stack with the image runs from `infra/` under the `app` profile (see `infra/README.md`).

### Authentication

The API is protected by Bearer JWT (HS256) and denies everything that is not listed as public in `SecurityConfig`. Set `JWT_SECRET` (in `infra/.env` or the environment) to a Base64 string of at least 32 random bytes — `openssl rand -base64 48`. The application does not start without it. Never commit it. Swagger UI and `/v3/api-docs` are served only in the `local` and `test` profiles (`springdoc.*.enabled`); elsewhere they are off and not public, and never in `prod`.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Sign up as `farmer` (default) or `agrochemist`; `admin` is rejected |
| `POST /api/auth/login` | Phone or e-mail plus password |
| `POST /api/auth/refresh` | Rotate the refresh token (7 days); a token used again within the reuse window (10 s by default) gets a new pair (lost response), later reuse revokes the whole session family |
| `POST /api/auth/logout` | End this session |
| `POST /api/auth/logout-all` | End all sessions (needs an access token) |

Access tokens live 15 minutes and carry only the user id. Status and roles are read from the database on every request, so blocking a user or changing roles applies immediately.

#### Rate limits

Abuse is stopped before any password hashing or database work. A refused request gets `429` with `code: rate_limited` and a `Retry-After` header (seconds until the window ends).

| Endpoint | Bucket | Default | Environment variable |
| --- | --- | --- | --- |
| `POST /api/auth/login` | per client address | 30 per minute | `APP_RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE` |
| `POST /api/auth/login` | per account | 10 per minute | `APP_RATE_LIMIT_LOGIN_PER_ACCOUNT_PER_MINUTE` |
| `POST /api/auth/register` | per client address | 20 per hour | `APP_RATE_LIMIT_REGISTER_PER_IP_PER_HOUR` |
| `POST /api/auth/refresh` | per client address | 60 per minute | `APP_RATE_LIMIT_REFRESH_PER_IP_PER_MINUTE` |
| `POST /api/diagnoses` | per user, new diagnoses | 5 per minute | `app.rate-limit.diagnosis-per-minute` |
| `POST /api/diagnoses` | per user, attempts | 20 per minute | `app.rate-limit.diagnosis-attempts-per-minute` |

- Login checks the client address first, then the account. The account is the normalized login (`8 701…`, `+7 701…` and `7701…` are one account) stored as a SHA-256 hash, so phones and e-mails never appear in Redis keys. The answer is the same for any login string, so existence of an account is not revealed.
- Windows are fixed: around a window boundary a client can send up to twice the limit.
- Every attempt counts, successful or not. While an attack on one account lasts, its owner can be locked out for the rest of the window; this is the accepted trade-off.
- Many farmers can share one public address (mobile carrier NAT), so the per-address limits are generous and the per-account limit carries the brute-force protection. Raise them with the variables above without a release.
- Redis is an accelerator: if it is down, requests are allowed and a warning is logged.
- The client address is the TCP peer; `X-Forwarded-For` and `Forwarded` are ignored, so they cannot be used to dodge the limit. Behind a reverse proxy set `server.forward-headers-strategy=native` and narrow `server.tomcat.remoteip.internal-proxies` to the proxy network. Never enable this on a port that is reachable without the proxy.

#### Refresh token reuse window

On a bad network the response to a refresh can be lost while the server has already rotated the token. The client then retries with the old token. A used token presented again within a short window after its first use gets a new token pair in the same session family instead of revoking it. Revoked (logout, theft detection) and expired tokens are never revived. After the window, reuse revokes the whole family with `refresh_token_reused`, as before. See [ADR 0003](../../docs/adr/0003-refresh-token-reuse-window.md).

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `APP_SECURITY_REFRESH_REUSE_WINDOW` | `PT10S` | ISO-8601 duration measured in database time; `0` = strict rotation, at most `PT60S` |

#### Refresh token cleanup

A nightly job at 04:00 (`Asia/Almaty`) deletes refresh tokens that expired more than 7 days ago, in batches, so the `refresh_tokens` table does not grow without bound. Used and revoked rows are kept until they expire plus the retention period: reuse detection needs them, so a replayed old token still revokes its session family. Settings:

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `APP_SECURITY_REFRESH_CLEANUP_ENABLED` | `true` | `false` switches the job off |
| `APP_SECURITY_REFRESH_CLEANUP_CRON` | `0 0 4 * * *` | Schedule, evaluated in `Asia/Almaty` |
| `APP_SECURITY_REFRESH_CLEANUP_RETENTION` | `P7D` | How long after expiry a row is kept (ISO-8601 duration) |
| `APP_SECURITY_REFRESH_CLEANUP_BATCH_SIZE` | `1000` | Rows deleted per transaction (1 to 10000) |

## Test

```bash
./mvnw test
```

Tests need Docker running: the `test` profile starts its own PostgreSQL + PostGIS container through Testcontainers (the same image as `infra/`). The local stack is not used. Testcontainers removes its containers after the run.

## Modules

A modular monolith: one application, one package per business area. Each module has the same layout where it needs it — `web` (controllers, DTOs), `service`, `repository`, `model`; planned modules hold only `package-info.java` — and other modules call only its `service` package.

| Package `kz.agroadvisor.…` | Area | State |
| --- | --- | --- |
| `common` | API error format, shared configuration; depends on no other module | done |
| `auth` | Registration, login, tokens | done |
| `users` | Profiles and roles | done |
| `access` | Feature access checks — code asks "may this user use feature X", not "is this user an admin", so paid features can be added later | done (one `FREE` plan for everyone; per-user plans and daily limits planned) |
| `catalog` | Crops, diseases, treatments, regions; codes match the AI class registry | done |
| `diagnosis` | Photo storage, AI service call, diagnosis history | done |
| `verification` | Agrochemist document verification | done |
| `community` | Questions, answers, votes, complaints | planned |
| `consultations` | Farmer ↔ agrochemist consultations and chat | planned |
| `shops` | Agro shop directory and farmer requests | planned |
| `notifications` | Push notifications and alerts | planned |
| `analytics` | Admin statistics and the disease map | planned |

Database migrations live in `src/main/resources/db/migration`.

## API errors

Every error is returned as [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457) with `Content-Type: application/problem+json` and an extra `code` property — a stable machine-readable value that clients map to localized messages:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed",
  "instance": "/api/diagnoses",
  "code": "validation_failed",
  "errors": [{ "field": "crop", "message": "must not be blank" }]
}
```

- `errors` is present only for validation failures.
- General codes are in `common.web.ErrorCodes` (`validation_failed`, `not_found`, `unauthorized`, `internal_error`, …).
- Business errors: throw `new ApiException(HttpStatus.NOT_FOUND, "disease_not_found", "Disease not found")`. Module codes are snake_case and never change once released.
- Unexpected errors return `500 internal_error` without internal details; the cause is logged.
