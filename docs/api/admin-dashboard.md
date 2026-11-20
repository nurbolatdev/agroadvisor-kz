# Admin dashboard API

Numbers for the admin's overview screen, counted from the database. Schemas and the operation id are in [`openapi.json`](openapi.json) (`OverviewView`).

The endpoint is under `/api/admin` and needs the `ADMIN` role: no token is 401, a farmer or an agrochemist is 403. Errors are RFC 9457 problem documents with a `code` field.

## Endpoint

| Operation | Endpoint | Result |
| --- | --- | --- |
| `getAdminDashboard` | `GET /api/admin/dashboard?period=30d&confidenceThreshold=70` | `200`, one `OverviewView`. |

| Parameter | Rule |
| --- | --- |
| `period` | `7d`, `30d` (default) or `season`; the same windows as [admin-ai-quality.md](admin-ai-quality.md). Any other value is 400 `validation_failed`. |
| `confidenceThreshold` | 0–100, default 70: a diagnosis below it counts as low-confidence. Outside the range is 400. |

## Result

| Field | Meaning |
| --- | --- |
| `activeUsers` | `value`: users who made at least one diagnosis in the window (there is no activity log, so "active" means "diagnosed"); `changePercent` against the previous window of the same length. 0 when the previous one had none. |
| `diagnoses` | diagnoses in the window, same change. |
| `avgConfidence` | `percent`: mean top confidence, whole number, 0 with no diagnoses; `changePoints` against the previous window. |
| `lowConfidenceShare` | `percent`: share of diagnoses below `confidenceThreshold`; `changePoints` against the previous window. |
| `pendingVerifications` | agrochemist applications in `pending` (all time, not the window). |
| `diagnosesByDay` | `date` (UTC) and `count`; days without diagnoses are left out. For `season` one point per 7 days from 1 March, `date` is the first day of the week. |
| `newUsers` | new accounts without the admin role, `farmers` and `agrochemists` (a user with both roles counts in both). `bucket` is a week from 1 (7-day weeks from the start of the window) for `7d` and `30d`, a calendar month (UTC, 0 = January) for `season`. Empty buckets are left out. |
| `updatedAt` | when the numbers were counted. |

All figures of one call read one database snapshot.

## Not returned, because the backend has no source yet

- open complaints (community moderation, B15);
- the funnel of steps and the time to first advice: there is no event log.

The admin page shows these from its mock until the sources appear.
