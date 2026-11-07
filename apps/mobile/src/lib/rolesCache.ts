import type { Me } from '@/api/users'

type Role = Me['roles'][number]

// Where the roles are kept: the MMKV storage of the app (non-sensitive local data), a fake in the tests.
export type RolesStorage = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove: (key: string) => unknown
}

// The last roles of a user, kept on the phone so that the app knows what to show before (or without) an
// answer of GET /api/users/me. Only the user id and the list of roles are written: no token, no name, no
// phone. A role on the phone is a hint for the interface; the backend decides what is allowed (403).
export type RolesCache = {
  // the roles saved for this user; null when none are saved or they belong to another user
  read: (userId: string | null) => Role[] | null
  write: (userId: string, roles: readonly Role[]) => void
  clear: () => void
}

const KEY = 'roles.cache'
const KNOWN: readonly Role[] = ['farmer', 'agrochemist', 'admin']

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (KNOWN as readonly string[]).includes(value)
}

export function createRolesCache(storage: RolesStorage): RolesCache {
  return {
    read(userId) {
      if (userId === null) return null
      try {
        const raw = storage.getString(KEY)
        if (!raw) return null
        const saved = JSON.parse(raw) as { userId?: unknown; roles?: unknown }
        if (saved.userId !== userId || !Array.isArray(saved.roles)) return null
        // an unknown value (written by a newer version of the app) is dropped, never trusted
        const roles = saved.roles.filter(isRole)
        return roles.length > 0 ? roles : null
      } catch {
        return null
      }
    },
    write(userId, roles) {
      try {
        storage.set(KEY, JSON.stringify({ userId, roles }))
      } catch {
        // an unwritable storage means no cache, not a failure of the app
      }
    },
    clear() {
      try {
        storage.remove(KEY)
      } catch {
        // nothing to clear
      }
    },
  }
}
