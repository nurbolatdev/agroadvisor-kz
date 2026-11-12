<p align="center">
  <img src="docs/brand/svg/logo-horizontal.svg" alt="AgroAdvisor KZ" width="420" />
</p>

# AgroAdvisor KZ

AI-powered plant disease diagnosis and agronomic advisory platform for farmers in Kazakhstan.

Farmers take a photo of a plant, get a diagnosis with confidence score and treatment options (chemical and biological), discuss problems with the farmer community, consult verified agrochemists, track regional disease outbreaks and plan field work with agro-weather hints.

## Repository structure

| Path | Description |
| --- | --- |
| `apps/admin-web` | Web admin panel: moderation, agrochemist verification, analytics |
| `apps/mobile` | Mobile application for farmers and agrochemists |
| `services/backend` | Core REST API |
| `services/ai-service` | Plant disease recognition service |
| `infra` | Docker, reverse proxy, database and cache configuration |
| `docs` | Architecture, API and workflow documentation |

## Quick start

The whole backend stack (PostgreSQL with PostGIS, Redis, SeaweedFS and the API running with the `prod` Spring profile) starts with one command.

Requirements: Docker Desktop or Docker Engine with Compose v2.23 or newer, and free ports 5433, 6379, 8333 and 8080 (and 8000 with the `ai` profile).

```bash
cd infra
cp .env.example .env   # first time: fill in POSTGRES_PASSWORD, REDIS_PASSWORD, S3_ACCESS_KEY, S3_SECRET_KEY, JWT_SECRET
docker compose --profile app up -d --build
```

`JWT_SECRET` and the other secrets go into `infra/.env` (not committed); generate a signing secret with `openssl rand -base64 48`. Without `JWT_SECRET` the backend refuses to start.

Check that the API is up:

```bash
curl http://127.0.0.1:8080/actuator/health/liveness
```

Photo diagnosis needs the AI service. Download the model weights once (this needs the service's Python environment, see [its README](services/ai-service/README.md#setup)), then add the `ai` profile:

```bash
cd services/ai-service
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m ml.fetch_weights effnet-b0-v1
cd ../../infra && docker compose --profile app --profile ai up -d --build
```

Without it the API starts and answers diagnosis requests with `503 ai_unavailable`.

Stop the stack with `docker compose --profile app --profile ai down` (data is kept); `down -v` also deletes the data.

The mobile app and the admin panel run separately, see [apps/mobile](apps/mobile/README.md) and [apps/admin-web](apps/admin-web/README.md). More details: [infra](infra/README.md), [backend](services/backend/README.md).

## Supported crops (MVP)

Potato, tomato, corn, wheat.

## Languages

Russian, Kazakh, English.

## Team

- Nurbolat Djumadilov: AI, team lead
- Miras Amalbek: AI
- Beksultan Meylibay: backend core, authentication, diagnosis, AI integration
- Bagdaulet Askar: backend infrastructure, database, reference data, Redis, CI

International University of Information Technologies (IITU), Almaty.

## License

The source code is licensed under the [Apache License 2.0](LICENSE). The trained model weights and the
datasets used for training are not part of this repository and are not covered by that license; they keep the
licenses of their sources (see `docs/ai/dataset.md`).

## Documentation

- [System architecture](docs/architecture.md)
- [Git workflow](docs/git-workflow.md)
- [Contributing](CONTRIBUTING.md)
- [Brand kit](docs/brand/README.md)
