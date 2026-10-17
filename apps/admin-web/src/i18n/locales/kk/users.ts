import type ru from '@/i18n/locales/ru/users'
import type { Translation } from '@/i18n/types'

const users: Translation<typeof ru> = {
  title: 'Пайдаланушылар',
  subtitle: 'Платформаның фермерлері мен агрохимиктері',
  summary: '{{users}} · бұғатталған: {{blocked}}',
  count_one: '{{count}} пайдаланушы',
  count_other: '{{count}} пайдаланушы',
  search: 'Аты бойынша іздеу',
  roleFilter: 'Рөлі',
  filters: {
    all: 'Барлығы',
    farmer: 'Фермерлер',
    agrochemist: 'Агрохимиктер',
  },
  roles: {
    farmer: 'Фермер',
    agrochemist: 'Агрохимик',
  },
  columns: {
    user: 'Пайдаланушы',
    role: 'Рөлі',
    crops: 'Дақылдар',
    activity: 'Белсенділік',
    status: 'Мәртебе',
    registered: 'Тіркелген',
  },
  diagnoses_one: '{{count}} диагноз',
  diagnoses_other: '{{count}} диагноз',
  answers_one: '{{count}} жауап',
  answers_other: '{{count}} жауап',
  statuses: {
    active: 'Белсенді',
    blocked: 'Бұғатталған',
  },
  lastActive: 'желіде {{time}}',
  empty: 'Ешкім табылмады',
}

export default users
