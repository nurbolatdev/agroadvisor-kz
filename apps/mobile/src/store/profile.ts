import { create } from 'zustand'

import { NetworkError } from '@/api/errors'
import type { Me, UsersApi } from '@/api/users'

// offline: no answer from the server; server: anything else, the person can try again. An ended session is
// not told here: the session store sends the person to the sign-in screen by itself (api/client.ts).
export type ProfileError = 'offline' | 'server'

export function toProfileError(error: unknown): ProfileError {
  return error instanceof NetworkError ? 'offline' : 'server'
}

// idle: never loaded; loading: the request is on its way; ready: `me` is shown; failed: `error` says why.
export type ProfilePhase = 'idle' | 'loading' | 'ready' | 'failed'

type ProfileState = {
  me: Me | null
  phase: ProfilePhase
  error: ProfileError | null
  // Asks for the profile; does nothing while a request is on its way or when the profile is there.
  // After a failure it asks again.
  load: () => Promise<void>
  // sign-out or another user: nothing of the previous user's profile stays
  reset: () => void
}

export function createProfileStore({ api }: { api: UsersApi }) {
  // Bumped by a reset: an answer to an older request is dropped, so it cannot bring back the previous
  // user's profile after a sign-out.
  let epoch = 0

  return create<ProfileState>((set, get) => ({
    me: null,
    phase: 'idle',
    error: null,

    async load() {
      const { phase } = get()
      if (phase === 'loading' || phase === 'ready') return
      const mine = epoch
      set({ phase: 'loading', error: null })
      try {
        const me = await api.me()
        if (mine === epoch) set({ me, phase: 'ready' })
      } catch (error) {
        if (mine === epoch) set({ phase: 'failed', error: toProfileError(error) })
      }
    },

    reset() {
      epoch += 1
      set({ me: null, phase: 'idle', error: null })
    },
  }))
}
