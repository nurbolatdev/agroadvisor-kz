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

## Supported crops (MVP)

Potato, tomato, corn, wheat.

## Languages

Russian, Kazakh, English.

## Team

- Nurbolat Djumadilov
- Miras Amalbek
- Beksultan Meylibay
- Bagdaulet Askar

International University of Information Technologies (IITU), Almaty.

## Documentation

- [System architecture](docs/architecture.md)
- [Git workflow](docs/git-workflow.md)
- [Contributing](CONTRIBUTING.md)
- [Brand kit](docs/brand/README.md)
