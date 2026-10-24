# AgroAdvisor KZ — Backend

Core REST API of the platform: used by the mobile app and the admin panel.

## Responsibilities

- Authentication and roles (farmer, agrochemist, admin)
- Diagnoses: forwarding images to the AI service, storing results
- Community: posts, answers, votes, moderation
- Agrochemist verification and consultations
- Disease reference, regional statistics, analytics for the admin panel
- Caching with Redis

## Stack

Java 21, Spring Boot 4.1, Maven (wrapper included), PostgreSQL 16 + PostGIS, springdoc-openapi, Testcontainers.

## Run locally

1. Start the dependencies — see [`infra/README.md`](../../infra/README.md):
   ```bash
   cd infra && docker compose up -d
   ```
2. Start the API from `services/backend`:
   ```bash
   ./mvnw spring-boot:run
   ```

The default profile is `local`: it connects to PostgreSQL on `localhost:5433` and reads the database name, user and password from `infra/.env`, so passwords are kept in one place.

| URL | What |
| --- | --- |
| http://localhost:8080/swagger-ui.html | Swagger UI |
| http://localhost:8080/v3/api-docs | OpenAPI JSON |
| http://localhost:8080/actuator/health | Health, including the database |

Settings can be overridden with environment variables: `SERVER_PORT`, `DB_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.

### Authentication

The API is protected by Bearer JWT (HS256) and denies everything that is not listed as public in `SecurityConfig`. Set `JWT_SECRET` (in `infra/.env` or the environment) to a Base64 string of at least 32 random bytes — `openssl rand -base64 48`. The application does not start without it. Never commit it. Swagger UI and `/v3/api-docs` are served only in the `local` and `test` profiles (`springdoc.*.enabled`); elsewhere they are off and not public.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Sign up as `farmer` (default) or `agrochemist`; `admin` is rejected |
| `POST /api/auth/login` | Phone or e-mail plus password |
| `POST /api/auth/refresh` | Rotate the refresh token (7 days); reusing a used token revokes the whole session family |
| `POST /api/auth/logout` | End this session |
| `POST /api/auth/logout-all` | End all sessions (needs an access token) |

Access tokens live 15 minutes and carry only the user id. Status and roles are read from the database on every request, so blocking a user or changing roles applies immediately.

## Test

```bash
./mvnw test
```

Tests need Docker running: the `test` profile starts its own PostgreSQL + PostGIS container through Testcontainers (the same image as `infra/`). The local stack is not used. Testcontainers removes its containers after the run.

## Modules

A modular monolith: one application, one package per business area. Each module has the same layout — `web` (controllers, DTOs), `service`, `repository`, `model` — and other modules call only its `service` package.

| Package `kz.agroadvisor.…` | Area |
| --- | --- |
| `common` | API error format, shared configuration; depends on no other module |
| `auth` | Registration, login, tokens |
| `users` | Profiles and roles |
| `access` | Feature access checks — code asks "may this user use feature X", not "is this user an admin", so paid features can be added later |
| `catalog` | Crops, diseases, treatments; codes match the AI class registry |
| `diagnosis` | Photo storage, AI service call, diagnosis history |
| `community` | Questions, answers, votes, complaints |
| `consultations` | Farmer ↔ agrochemist consultations and chat |
| `verification` | Agrochemist document verification |
| `shops` | Agro shop directory and farmer requests |
| `notifications` | Push notifications and alerts |
| `analytics` | Admin statistics and the disease map |

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
