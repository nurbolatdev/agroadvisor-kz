# Admin users API

The admin's view of farmers and agrochemists and the block of an account. Schemas and operation ids are in [`openapi.json`](openapi.json) (`AdminUserView`, `StatusRequest`).

Errors are RFC 9457 problem documents with a `code` field (see [error codes](#error-codes)). Both endpoints are under `/api/admin` and need the `ADMIN` role: no token is 401, a farmer or an agrochemist is 403.

## Endpoints

| Operation | Endpoint | Result |
| --- | --- | --- |
| `listUsers` | `GET /api/admin/users?role=&search=&page=0&size=20&lang=` | `200`, a bare array of users, newest first (`registeredAt` descending, then `id`). |
| `changeUserStatus` | `PATCH /api/admin/users/{id}/status?lang=` | `200`, the updated user. Body `{ "status": "active" \| "blocked" }`. |

### Parameters of the list

| Parameter | Rule |
| --- | --- |
| `role` | optional, `farmer` or `agrochemist`; without it both roles are listed. |
| `search` | optional, at most 100 characters. Trimmed; an empty value means no filter. |
| `page` | 0 to 10000, default 0. |
| `size` | 1 to 100, default 20. |
| `lang` | `ru`, `kk` or `en`; it wins over the `Accept-Language` header; the default is `ru`. |

A value out of range, or a `role` other than the two above (`admin` included), is 400 `validation_failed`. The list has no total: the client reads pages until one is shorter than `size`.

Administrators are never listed. A person has either the farmer or the agrochemist role, so `role` is a single string.

### Search

`search` matches any of:

- a part of the full name, without regard to case;
- a part of the login (e-mail), without regard to case;
- a part of the phone, by digits only: the digits of the query are taken (`+7 701 123` becomes `7701123`) and looked up in the phone without its `+`. It applies only when the query has digits.

`%`, `_` and `\` in the query are matched literally. There is no index for it; a sequential scan is enough for the expected number of users.

### User

```
{ "id", "fullName", "role", "region", "district", "status", "registeredAt", "diagnosesCount" }
```

| Field | Meaning |
| --- | --- |
| `id` | user id (uuid). |
| `fullName` | the name as the user gave it. |
| `role` | `farmer` or `agrochemist`. |
| `region`, `district` | names in the language of the request; null when not chosen. |
| `status` | `active` or `blocked`. |
| `registeredAt` | when the account was created (date-time). |
| `diagnosesCount` | how many diagnoses the user made. |

The phone and the e-mail are not returned, to keep personal data out of a list of all users.

Not returned, because the backend has no source for them yet:

- `crops`: a farmer has no crops in the profile (subscriptions to crops belong to the community work);
- `lastActiveAt`: activity is not recorded;
- `postsCount` and `warningsCount`: there are no tables of the community and moderation yet.

`district` is always null for now: no screen or request fills `users.district_id`; registration stores the region only.

## Block and unblock

- `blocked` takes effect at once. The access token is refused on the next request, because the status is read from the database on every request. Every refresh token of the user is revoked in the same transaction, so a refresh is 401 `invalid_refresh_token` and a sign-in is 403 `account_blocked`.
- Sockets of consultations that are already open stay up until the access token expires (15 minutes at most).
- `active` does not restore anything: revoked tokens stay revoked and the user signs in again.
- Repeating the current status is not an error: the answer is 200 with the same user, and a repeated `blocked` revokes the tokens again.
- The status of an administrator cannot be changed, the caller's own included.
- There is no audit of blocks (who, when, why): the only trace is `users.updated_at`.

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | a parameter out of range, an unknown `role`, a `status` other than `active` or `blocked`, an empty body, a malformed id. |
| 401 | general | no or invalid access token; the `code` is the one of the common error format. |
| 403 | general | the caller is not an admin; the `code` is the one of the common error format. |
| 403 | `admin_status_locked` | the target is an administrator or the caller themselves. |
| 404 | `user_not_found` | there is no such user. |
