# API contracts

- [ai-predict.md](ai-predict.md) — contract of the ai-service `/predict` endpoint.
- [agrochemist-verification.md](agrochemist-verification.md) — sending documents, the states of the check and the admin's decision.
- `openapi.json` — snapshot of the backend OpenAPI schema. It is the single source of truth for the generated mobile types (`apps/mobile/src/api/schema.d.ts`).

## Updating the snapshot

After any change to backend controllers or DTOs, regenerate the snapshot (Docker must be running):

```bash
cd services/backend && ./mvnw test -Dtest=OpenApiExportTest
```

Then regenerate the mobile types:

```bash
cd apps/mobile && npm run gen:api
```

Commit `openapi.json` and `schema.d.ts` together with the change that caused them.
