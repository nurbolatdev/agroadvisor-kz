# ADR 0003: Refresh token reuse window

- Status: accepted (decision of the team lead)
- Scope: `services/backend`

## Context

Refresh tokens rotate: every use marks the token as used and issues a new one. Presenting a used token again
was treated as theft and revoked the whole session family.

On a farmer's mobile network the response to a refresh can be lost after the server has already rotated the
token. The client still holds the old token, retries with it, and the server sees a "reuse" and signs the user
out everywhere. A flaky connection thus looks exactly like an attack.

Only SHA-256 hashes of tokens are stored, so the server cannot hand out "the same new token" again.

## Decision

- A used token presented again within a **reuse window** after its first use gets a **new token pair in the
  same family**. The window is measured from `used_at` in database time (`now()` in SQL), so clock skew between
  the application and the database does not matter.
- Setting `app.security.refresh-reuse-window` (`APP_SECURITY_REFRESH_REUSE_WINDOW`): default `PT10S`, allowed
  `0..PT60S`. `0` restores strict rotation. Anything else makes the application fail at startup.
- Revoked rows (logout, logout-all, earlier theft detection) and expired rows are never revived by the window.
- After the window the behaviour is unchanged: the whole family is revoked, the answer is `401
  refresh_token_reused`.
- A blocked user replaying inside the window gets `403 account_blocked` and all tokens are revoked, as on any
  refresh.
- Parallel requests with one token: the single conditional `UPDATE` rotates exactly once; the others arrive
  inside the window and are replays. All get `200`, each with its own token, and the family stays alive.
- No migration. The normal rotation query is untouched; only when it matches no row does one `SELECT` decide
  between replay, invalid and reuse.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Return the same new token again | Only hashes are stored; keeping the raw or encrypted successor is a secret at rest and needs a migration |
| Longer window | Beyond a minute it stops being "the same request retried" and becomes a standing allowance for a stolen token; hence the 60 s cap |
| Cache the whole refresh response (Redis/DB) | Stores raw tokens, and needs a request key the client does not send |
| Allow only one replay per token | Several lost responses in a row within seconds would still sign the user out; the cap needs a marker column (migration) or would overload `revoked_at`, blurring "revoked is never revived"; it also gives an attacker who replays first the win |
| A replay revokes the previous successor | No parent link in the schema; in the parallel case the client may keep a response whose token was just revoked, which is a logout |
| Document the strict behaviour only | Leaves the bad-network logout in place |
| Row locks (`FOR SHARE` / `FOR UPDATE`) in the replay path | Deadlock between parallel after-window replays; does not close the logout race either |

## Consequences

- **Threat model.** An attacker holding a token that was just used can also replay it inside the window and
  gets a live branch of the family. This is bounded by the window (10 s by default), and any later reuse of any
  token of the family revokes the family with all branches.
- **Row growth.** Replays of one token happen only within the window; the refresh limit is 60 per minute per
  IP (fixed windows, so up to about twice that around a boundary). Replay rows are ordinary rows with the
  7-day lifetime and go with the nightly cleanup.
- **Retention is unaffected.** The cleanup deletes rows expired more than 7 days ago; the window is seconds.
- **Known gap (existing, not introduced here).** A token inserted by a rotation at the same moment as a logout
  of its family can outlive that logout, because the logout `UPDATE` does not see a row committed after it
  started. A per-user `pg_advisory_xact_lock` in rotation and revocation would close it; suggested as a
  separate issue.
- **Client coverage.** The mobile client retries a refresh once, immediately, when no answer arrives (a
  network error, not a server answer). The first attempt gives up after 4 s, so the retry starts inside the
  10 s window; the retry itself waits as long as the client allows (slow networks). No retry is sent after a
  logout. If the network stays down, the saved token is kept
  and the next refresh comes with the user's next action; if that is later than the window, the strict rule
  applies and the user signs in again.
- **Rollback.** Set `APP_SECURITY_REFRESH_REUSE_WINDOW=0`.

## Answer for the defence: what happens if the connection drops during a token refresh?

The server rotates the token first and then sends the answer. If the answer is lost, the phone still has the
old token. When it asks again within 10 seconds, the server recognises the retry and gives out a fresh pair in
the same session, instead of treating it as theft. Later reuse of an old token still ends the whole session,
because that is how a stolen token is caught. A logged-out or expired token is never accepted.
