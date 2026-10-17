import type ru from '@/i18n/locales/ru/ui'
import type { Translation } from '@/i18n/types'

const ui: Translation<typeof ru> = {
  search: 'Іздеу',
  pagination: {
    label: 'Беттерге бөлу',
    shown: '{{total}} ішінен {{from}}–{{to}} көрсетілді',
    compact: '{{pages}} беттің {{page}}-беті',
    page: '{{page}}-бет',
    previous: 'Алдыңғы бет',
    next: 'Келесі бет',
    pageSize: 'Беттегі жазбалар саны',
    perPage: 'Бетте {{count}}',
  },
}

export default ui
