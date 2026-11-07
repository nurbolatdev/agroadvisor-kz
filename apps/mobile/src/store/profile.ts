import { create } from 'zustand'

import { NetworkError } from '@/api/errors'
import type { Me, UsersApi } from '@/api/users'
import type { RolesCache } from '@/lib/rolesCache'

// offline: no answer from the server; server: anything else, the person can try again. An ended session is
// not told here: the session store sends the person to the sign-in screen by itself (api/client.ts).
export type ProfileError = 'offline' | 'server'

export function toProfileError(error: unknown): ProfileError {
  return error instanceof NetworkError ? 'offline' : 'server'
}

// idle: never loaded; loading: the request is on its way; ready: `me` is shown; failed: `error` says why.
export type ProfilePhase = 'idle' | 'loading' | 'ready' | 'failed'

type Role = Me['roles'][number]

type ProfileState = {
  me: Me | null
  // The roles the interface goes by: the ones of the last answer of the server, or, until there is one
  // (or when the server cannot be reached), the ones saved on the phone for this user. Null when neither is
  // known; the screens that depend on the role wait then (see RoleGate). A hint for the interface only.
  roles: Role[] | null
  phase: ProfilePhase
  error: ProfileError | null
  // Asks for the profile; does nothing while a request is on its way or when the profile is there.
  // After a failure it asks again.
  load: () => Promise<void>
  // sign-out or another user: nothing of the previous user's profile stays
  reset: () => void
}

type Options = {
  api: UsersApi
  // where the last roles are kept between starts; without it the roles are known only after the answer
  rolesCache?: RolesCache
  // the id of the signed-in user (from the session); the cache is read for this user only
  currentUser?: () => string | null
}

export function createProfileStore({ api, rolesCache, currentUser }: Options) {
  // Bumped by a reset: an answer to an older request is dropped, so it cannot bring back the previous
  // user's profile after a sign-out.
  let epoch = 0

  return create<ProfileState>((set, get) => ({
    me: null,
    roles: rolesCache?.read(currentUser?.() ?? null) ?? null,
    phase: 'idle',
    error: null,

    async load() {
      const { phase } = get()
      if (phase === 'loading' || phase === 'ready') return
      const mine = epoch
      set({ phase: 'loading', error: null })
      try {
        const me = await api.me()
        if (mine !== epoch) return
        // The answer of the server replaces the saved roles; a change reaches every screen that reads them.
        rolesCache?.write(me.id, me.roles)
        set({ me, roles: me.roles, phase: 'ready' })
      } catch (error) {
        // the saved roles stay: a failed answer does not take them away
        if (mine === epoch) set({ phase: 'failed', error: toProfileError(error) })
      }
    },

    reset() {
      epoch += 1
      rolesCache?.clear()
      set({ me: null, roles: null, phase: 'idle', error: null })
    },
  }))
}
