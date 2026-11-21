# API contracts

- [ai-predict.md](ai-predict.md) — contract of the ai-service `/predict` endpoint.
- [agrochemist-verification.md](agrochemist-verification.md) — sending documents, the states of the check and the admin's decision.
- [consultations.md](consultations.md) — consultation requests, the status machine, chat messages, read receipts, limits and error codes.
- [community.md](community.md) — farmer questions with photos, the feed, answers, votes, the best answer, crop subscriptions, limits and error codes.
- [admin-community.md](admin-community.md) — the admin's moderation of community reports: cases, keep, hide and block decisions, hiding posts, figures, the community statistics (`GET /api/admin/community/stats`), inviting an agrochemist to a question (`POST /api/admin/community/questions/{id}/invitations`) and error codes.
- [diagnosis-reviews.md](diagnosis-reviews.md) — expert checks of diagnoses by an agrochemist or an admin and the combined verdict.
- [notifications.md](notifications.md) — the notification inbox, push token registration, notification types and limits.
- [admin-users.md](admin-users.md) — the admin's list of farmers and agrochemists, blocking and unblocking, fields, search and error codes.
- [admin-shops.md](admin-shops.md) — the admin's shop directory (add, change, hide) and the reports farmers send about it.
- [admin-ai-quality.md](admin-ai-quality.md) — the admin's AI quality statistics: confidence, top classes, expert-decided photos and mismatches.
- [admin-dashboard.md](admin-dashboard.md) — the admin's overview: diagnoses, active users, confidence, applications waiting, diagnoses per day and new accounts.
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
