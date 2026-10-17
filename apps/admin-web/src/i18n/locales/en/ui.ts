import type ru from '@/i18n/locales/ru/ui'
import type { Translation } from '@/i18n/types'

const ui: Translation<typeof ru> = {
  search: 'Search',
  pagination: {
    label: 'Pagination',
    shown: 'Showing {{from}}–{{to}} of {{total}}',
    compact: 'Page {{page}} of {{pages}}',
    page: 'Page {{page}}',
    previous: 'Previous page',
    next: 'Next page',
    pageSize: 'Rows per page',
    perPage: '{{count}} per page',
  },
}

export default ui
