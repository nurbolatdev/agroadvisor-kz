import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
import { readPages } from '@/services/readPages'
import type { User, UserRole, UserStatus } from '@/shared/types'

/** Answer of `GET /api/admin/users` (docs/api/admin-users.md). */
interface BackendUser {
  id: string
  fullName: string
  role: UserRole
  region: string | null
  district: string | null
  status: UserStatus
  registeredAt: string
  diagnosesCount: number
}

function toUser(row: BackendUser): User {
  return {
    id: row.id,
    name: row.fullName,
    role: row.role,
    region: row.region ?? '—',
    district: row.district ?? '—',
    crops: [], // a farmer has no crops in the profile on the backend yet
    status: row.status,
    registeredAt: row.registeredAt,
    diagnosesCount: row.diagnosesCount,
    warningsCount: 0, // moderation is not on the backend yet
    // lastActiveAt and postsCount are left out: the backend has no source, the screen hides them
  }
}

export function createLiveUsers(client: HttpClient): Pick<AdminApi, 'getUsers'> {
  return {
    getUsers: async (filters = {}) => {
      const rows = await readPages<BackendUser>(client, '/api/admin/users', {
        role: filters.role,
        search: filters.search,
      })
      return rows.map(toUser)
    },
  }
}
