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
  backend: the access token carries only the user id, the roles are read from the database on every
  request (`UserJwtAuthenticationConverter`), and `@PreAuthorize` and the check of the profile of an
  agrochemist decide. A stale or edited cache can at most show a screen whose calls then answer `403`,
  which the screens handle as any other error.
- The cache holds a list of role names and a user id, which is not secret: it is a subset of what
  `GET /api/users/me` returns to that same user.
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
- **`farmer` and `agrochemist` are mutually exclusive.** An agrochemist sees only the consultant's cabinet;
  holding both roles is not supported by the product (an administrator may hold another role next to either).
  The server gives one role at registration and has no way to add another, but the database does not forbid
  a second row (issue #99). Should an account hold both all the same, the app shows the agrochemist's tabs and
  no camera: the screens ask `isAgrochemist` (`hasAgrochemistRole` for a bare list) first.
- **The tabs are role-dependent** (M9 part 2b): a farmer has Home, the camera and Profile, an agrochemist has
  Requests and Profile. They are wrapped in `RoleGate`, so the wait screen of the case above also stands
  where the farmer's home would be: a first start with no network and no cache (a new install, or the cache
  cleared) shows "Try again" and "Sign out" instead of the home. The offline queue of diagnoses, the history
  and the language are screens above the tabs: they do not wait for the roles themselves, but on that wait
  screen the app has no button that leads to them (it offers only "Try again" and "Sign out"), so they cannot
  be reached from there until the roles are known. There is no third source of the role to fall back on:
  the access token has no roles (the backend reads them from the database on every request, `JwtService`),
  and the app does not guess a role. The wait screen is therefore reached only when the phone holds no
  roles for this user: after an update from a version that did not save them, with a damaged or cleared
  cache, or when the answer of `/api/users/me` right after the sign-in did not come (the connection was lost
  or the server failed) and the next start is offline. It is not a state of a normal start, because **the roles are saved right after a sign-in and after a
  registration**: both end in a new user id in the session, which asks for `/api/users/me` at once
  (`onUserChange`), and the answer is written to the cache. The product owner accepted this cost for the
  offline start of a farmer (8 Nov 2026).

## Alternatives considered

- Gate the whole signed-in group until the profile loads: rejected, it breaks the offline use of M8.
- Put the roles into the session store: rejected, two sources of truth; the profile store stays the one.
- Decode the roles from the access token: not possible, the token carries only the user id (the backend
  reads the roles fresh so that a role change or a block takes effect at once).
