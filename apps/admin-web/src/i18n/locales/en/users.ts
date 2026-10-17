import type ru from '@/i18n/locales/ru/users'
import type { Translation } from '@/i18n/types'

const users: Translation<typeof ru> = {
  title: 'Users',
  subtitle: 'Farmers and agrochemists on the platform',
  summary: '{{users}} · blocked: {{blocked}}',
  count_one: '{{count}} user',
  count_other: '{{count}} users',
  search: 'Search by name',
  roleFilter: 'Role',
  filters: {
    all: 'All',
    farmer: 'Farmers',
    agrochemist: 'Agrochemists',
  },
  roles: {
    farmer: 'Farmer',
    agrochemist: 'Agrochemist',
  },
  columns: {
    user: 'User',
    role: 'Role',
    crops: 'Crops',
    activity: 'Activity',
    status: 'Status',
    registered: 'Registered',
  },
  diagnoses_one: '{{count}} diagnosis',
  diagnoses_other: '{{count}} diagnoses',
  answers_one: '{{count}} answer',
  answers_other: '{{count}} answers',
  statuses: {
    active: 'Active',
    blocked: 'Blocked',
  },
  lastActive: 'online {{time}}',
  empty: 'No one found',
}

export default users
