# System architecture

## Components

| Component | Responsibility | Technology |
| --- | --- | --- |
| Mobile app | Photo diagnosis, community, disease map, agro-weather, reference, farm calculator, agrochemist chat | Mobile client |
| Admin web | Content moderation, agrochemist verification, disease reference management, analytics | React, TypeScript, Vite |
| Backend | Auth, users, community, consultations, notifications, analytics API | Spring Boot |
| AI service | Plant disease recognition from photo, photo quality check | Python, FastAPI |
| PostgreSQL | Primary data storage | PostgreSQL |
| Redis | Caching, sessions, rate limiting | Redis |
| Nginx | Reverse proxy, TLS termination | Nginx |

## Data flow

```
Mobile app ─┐
            ├──► Nginx ──► Backend ──► PostgreSQL
Admin web ──┘                 │  └───► Redis
                              └──────► AI service
```

1. The farmer selects a crop and takes a photo in the mobile app.
2. The backend validates the request and forwards the image to the AI service.
3. The AI service returns the disease, confidence and photo quality assessment.
4. The backend enriches the result with treatment data and stores the diagnosis.
5. Admins moderate community content and verify agrochemists through the admin web.

## Roles

- **Farmer** — diagnosis, community, map, weather, calculator.
- **Agrochemist** — registers with a diploma or certificate, visible after admin verification, answers consultations.
- **Admin** — moderation, verification, reference data, analytics.

## Extensibility

Premium features may be introduced later, so access checks are implemented through a feature-access layer rather than hard-coded role checks.
