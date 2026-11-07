# ADR 0001: Roles cache on the phone (stale while revalidate)

- Status: accepted (decision of the team lead)
- Scope: `apps/mobile`

## Context

The mobile app shows different screens to a farmer and to an agrochemist. The only source of roles is
`GET /api/users/me`; the session store does not keep them.

The first design opened the signed-in screens only after `/api/users/me` had answered, so that a router
could never show a farmer's screens to an agrochemist. That conflicts with M8: the offline queue of
diagnoses, the history, the language and sign-out must work when the profile cannot be loaded (a cold start
with no network in a field is the normal case for our users). With the global gate none of them opened.

## Decision

1. The last roles of the user are kept on the phone (MMKV, key `roles.cache`) as
   `{ "userId": "...", "roles": ["farmer"] }`. Nothing else is stored there: no token, no name, no phone.
2. The roles the interface goes by are in the profile store (`roles`). At start they come from the cache,
   when it holds roles of the signed-in user; every successful `/api/users/me` replaces them and rewrites
   the cache. A change reaches the screens that read them, which are drawn again.
3. The signed-in screens open at once. Only the screens whose content depends on the role are wrapped in
   `RoleGate`: while the roles are unknown it shows a wait screen, and after a failure "Try again" and
   "Sign out". The offline queue, the history, the language and sign-out are not behind it.
4. Sign-out and a change of the user reset the profile store and clear the cache, so the next person on the
   phone never starts with the previous roles. A cache entry of another user is ignored.
5. A failed `/api/users/me` never removes the cached roles.

## Why a cached role is safe

- A role on the phone is a hint for the interface, not an authorisation. Every call is authorised by the
  backend (roles in the token, `@PreAuthorize`, the check of the profile of an agrochemist). A stale or
  edited cache can at most show a screen whose calls then answer `403`, which the screens handle as any
  other error.
- The cache holds a list of role names and a user id, which is not secret: it is a subset of what the
  profile returns and of what the access token already carries.
- It is read only for the signed-in user (`userId` must match), unknown role names are dropped, damaged
  data is treated as no cache, and an unreadable storage means no cache, not a crash.
- Stale roles live until the next successful `/api/users/me` (every start of the signed-in app asks for it)
  or until sign-out.

## Consequences

- Role-dependent screens must use `RoleGate` (or read `roles` from the profile store) and must not check a
  role string themselves; `isAgrochemist` and `isFarmer` in `features/access/roles.ts` are the helpers.
- A person whose role was just changed by an admin sees the old interface until the next answer of the
  server; their calls are already authorised by the new role.
- A first start with no network and no cache shows the wait screen for role-dependent screens only.

## Alternatives considered

- Gate the whole signed-in group until the profile loads: rejected, it breaks the offline use of M8.
- Put the roles into the session store: rejected, two sources of truth; the profile store stays the one.
- Decode the roles from the access token: rejected, the token is renewed only online and the app does not
  parse it for anything else besides the user id.
