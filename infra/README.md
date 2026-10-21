# AgroAdvisor KZ — Infrastructure

Local development dependencies, run with Docker Compose.

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | PostgreSQL + PostGIS, Redis, SeaweedFS (S3) |
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
cp .env.example .env   # first time only, then set passwords
docker compose up -d
docker compose ps
```

All three services should show `healthy`. `agroadvisor-seaweedfs-init` shows `Exited (0)` — it only creates the photo bucket and stops.

## Services

| Service | Container | Host port | Connection |
| --- | --- | --- | --- |
| PostgreSQL 16 + PostGIS 3.5 | `agroadvisor-postgres` | `5433` | `jdbc:postgresql://localhost:5433/agroadvisor` |
| Redis 7.4 | `agroadvisor-redis` | `6379` | `redis://:<REDIS_PASSWORD>@localhost:6379` |
| SeaweedFS 4.48 — S3 API | `agroadvisor-seaweedfs` | `8333` | endpoint `http://localhost:8333`, path-style access, any region |
| SeaweedFS — file browser | `agroadvisor-seaweedfs` | `8888` | http://localhost:8888/buckets/ |

- Credentials come from `.env`; ports can be changed there too.
- PostgreSQL uses host port 5433 because 5432 is often taken by a locally installed PostgreSQL.
- The `postgis` extension is enabled on first start (`postgres/init/01-extensions.sql`).
- Photos go to the `diagnosis-photos` bucket. SeaweedFS speaks the S3 API, so the backend uses a regular S3 client.

## No clutter by design

- Only prebuilt images with pinned versions — nothing is built locally, no build cache.
- The project name (`agroadvisor`), container names and volume names are fixed: `docker compose up -d` starts the same containers again instead of creating new ones.
- Data lives in named volumes `agroadvisor-postgres-data`, `agroadvisor-redis-data`, `agroadvisor-seaweedfs-data` and survives restarts.

## Everyday commands

| Task | Command |
| --- | --- |
| Start (or start again) | `docker compose up -d` |
| Status | `docker compose ps -a` |
| Logs of one service | `docker compose logs -f postgres` |
| Stop, keep data | `docker compose down` |
| Stop and delete all data | `docker compose down -v` |
| Disk usage of Docker | `docker system df` |

`docker compose down -v` wipes the database, cache and photos — the next `up` starts from an empty state and runs `postgres/init/` again.
