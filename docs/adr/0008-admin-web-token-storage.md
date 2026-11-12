# ADR 0008: Where the admin web keeps its tokens

- Status: accepted (decision of the team lead, 12 Nov 2026); the cookie variant is planned before staging
- Scope: `apps/admin-web`, later `services/backend`

## Context

The admin web signs in through the same `/api/auth/*` endpoints as the mobile app and receives two tokens in
the response body: an access token (15 minutes) and a refresh token (7 days, rotated on every use, with a
10-second reuse window, [ADR 0003](0003-refresh-token-reuse-window.md)). A page in a browser, unlike a mobile
app, can be attacked by injected script (XSS), so where the tokens live matters. The team had to decide this
before the first screens went live on the real API.

## Decision

- The **access token lives in memory** only (a variable in the session module). A reload loses it.
- The **refresh token lives in `sessionStorage`** of the tab (key `agroadvisor.admin.refresh`). After a
  reload the web restores the session with it; closing the tab ends the session. If the storage is blocked, a
  copy in memory keeps the session until a reload.
- Nothing is kept in `localStorage`.
- The web never renders untrusted HTML (`dangerouslySetInnerHTML` is not used); text from the backend is
  shown as text.
- **Planned before a staging deployment:** the refresh token moves to an `httpOnly; Secure; SameSite` cookie
  set by the backend for the admin web only, with CSRF protection, a Content-Security-Policy on the web server
  and CORS with credentials. Until then this decision stands.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Both tokens in memory | A reload or a new tab would sign the administrator out every time; the refresh token is the only thing that survives a reload |
| Both tokens in `localStorage` | Survives restarts but is readable by any script on the page for as long as the refresh token lives, and shared by all tabs; the worst of the options for XSS |
| `httpOnly` cookie for the refresh token from the start | The best against XSS, but needs a separate cookie-based flow in the backend, which is shared with the mobile app (tokens in the body), CSRF protection and credentialed CORS. Too much for the December defence; kept as the planned next step |

## Consequences

- An XSS bug on the admin pages could read the refresh token from `sessionStorage` for the lifetime of the
  tab. The risk is reduced by the short access token, the rotation with reuse detection, the absence of
  `dangerouslySetInnerHTML` and the fact that only administrators use the web. It is not removed.
- "Duplicate tab" copies `sessionStorage`, so two tabs share one refresh token; the first to rotate it makes the
  other's next refresh a reuse, and after the short window the session ends. Known and accepted.
- Moving to the cookie touches the backend (new endpoints or a flag on the existing ones), the web client and
  the CORS and CSP settings; it needs its own decision and PR.
