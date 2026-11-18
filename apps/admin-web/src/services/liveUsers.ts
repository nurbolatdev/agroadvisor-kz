import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
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

/** The backend caps a page at 100; the table and the summary count what is loaded, at most MAX_PAGES pages. */
const PAGE_SIZE = 100
const MAX_PAGES = 10

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
      const users: User[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await client.request<BackendUser[]>('/api/admin/users', {
          query: { role: filters.role, search: filters.search, page, size: PAGE_SIZE },
        })
        users.push(...rows.map(toUser))
        if (rows.length < PAGE_SIZE) break
      }
      return users
    },
  }
}
