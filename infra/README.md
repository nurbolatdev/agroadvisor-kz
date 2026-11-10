# AgroAdvisor KZ — Infrastructure

Local development dependencies, run with Docker Compose.

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | PostgreSQL + PostGIS, Redis, SeaweedFS (S3); profiles `app` (backend) and `ai` (AI service) |
| `.env.example` | Settings template — copy to `.env` |
| `postgres/init/` | SQL run once when the database volume is created |
| `nginx/` | Reverse proxy configuration |
| `redis/` | Cache configuration |
| `scripts/` | Helper scripts for setup and deployment |

## Requirements

Docker Desktop (or Docker Engine) with Docker Compose v2.

## Start

From `infra/`:

```bash
cp .env.example .env   # first time only, then set passwords and JWT_SECRET
```

Dependencies only, for running the backend from the IDE or `./mvnw spring-boot:run -Dspring-boot.run.profiles=local`:

```bash
docker compose up -d
docker compose ps
```

The whole backend stack, with the API in a container (Spring profile `prod`):

```bash
docker compose --profile app up -d --build
docker compose ps
curl http://127.0.0.1:8080/actuator/health/liveness   # {"status":"UP"}
```

All services should show `healthy`, including `agroadvisor-backend` with the `app` profile. `agroadvisor-seaweedfs-init` shows `Exited (0)` — it only creates the photo bucket and stops. `--build` rebuilds the image after a `git pull`.

Diagnosis needs the AI service and its weights, which are not in git. Fetch them once: in `services/ai-service` create the environment (`python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"`, see its [README](../services/ai-service/README.md#setup)) and run `.venv/bin/python -m ml.fetch_weights effnet-b0-v1`. Then start both profiles: `docker compose --profile app --profile ai up -d --build` (or set `COMPOSE_PROFILES=app,ai` in `.env`). Without the `ai` profile the API starts and diagnosis answers `503 ai_unavailable`.

### Secrets and an older `.env`

`.env` is never committed, so it does not follow `.env.example`: after a `git pull`, compare the two and copy any new keys. The backend refuses to start when a required value is missing or empty, for example:

- `JWT_SECRET` — required by the `app` profile; generate with `openssl rand -base64 48`;
- `BACKEND_PORT` — optional host port of the container API (default `8080`; set it if a local `spring-boot:run` already uses 8080);
- `S3_ACCESS_KEY` and `S3_SECRET_KEY` — must match the SeaweedFS credentials above.

Quick check for keys missing from `.env` (prints names only, never values). Ports and the database name have defaults and may be absent; secrets may not:

```bash
comm -23 <(grep -oE '^[A-Z_]+=' .env.example | sort) <(grep -oE '^[A-Z_]+=' .env | sort)
```

## Services

| Service | Container | Host port | Connection |
| --- | --- | --- | --- |
| PostgreSQL 16 + PostGIS 3.5 | `agroadvisor-postgres` | `5433` | `jdbc:postgresql://localhost:5433/agroadvisor` |
| Redis 7.4 | `agroadvisor-redis` | `6379` | `redis://:<REDIS_PASSWORD>@localhost:6379` |
| SeaweedFS 4.48 — S3 API | `agroadvisor-seaweedfs` | `8333` | endpoint `http://localhost:8333`, path-style access, any region |
| SeaweedFS — file browser | `agroadvisor-seaweedfs` | `8888` | http://localhost:8888/buckets/ |
| Backend API (profile `app`, Spring profile `prod`) | `agroadvisor-backend` | `127.0.0.1:8080` | http://127.0.0.1:8080/actuator/health/liveness |

- Credentials come from `.env`; ports can be changed there too.
- The backend container gets its internal addresses (database, Redis, S3, AI) from the compose file; `.env` only supplies secrets and ports.
- PostgreSQL uses host port 5433 because 5432 is often taken by a locally installed PostgreSQL.
- The `postgis` extension is enabled on first start (`postgres/init/01-extensions.sql`).
- Photos go to the `diagnosis-photos` bucket. SeaweedFS speaks the S3 API, so the backend uses a regular S3 client.

## No clutter by design

- Dependencies are prebuilt images with pinned versions. Only the profiles `app` and `ai` build the project's own images (`agroadvisor-backend:local`, the AI service); remove them with `docker image rm`.
- The project name (`agroadvisor`), container names and volume names are fixed: `docker compose up -d` starts the same containers again instead of creating new ones.
- Data lives in named volumes `agroadvisor-postgres-data`, `agroadvisor-redis-data`, `agroadvisor-seaweedfs-data` and survives restarts.

## Everyday commands

| Task | Command |
| --- | --- |
| Start dependencies (or start again) | `docker compose up -d` |
| Start the whole stack | `docker compose --profile app up -d --build` |
| Status | `docker compose ps -a` |
| Logs of one service | `docker compose logs -f postgres` |
| Backend logs | `docker compose logs -f backend` |
| Rebuild the backend after a code change | `docker compose --profile app up -d --build backend` |
| Stop, keep data | `docker compose --profile app --profile ai down` |
| Stop and delete all data | `docker compose --profile app --profile ai down -v` |
| Disk usage of Docker | `docker system df` |

Pass both profiles to `down` so older Compose versions also remove the profile containers (`agroadvisor-backend`, AI service); current versions remove them even without the flags. `down -v` wipes the database, cache and photos — the next `up` starts from an empty state and runs `postgres/init/` again.
