import type ru from '@/i18n/locales/ru/format'
import type { Translation } from '@/i18n/types'

const format: Translation<typeof ru> = {
  justNow: 'just now',
  minutesAgo: '{{count}} min ago',
  hoursAgo: '{{count}} h ago',
  yesterday: 'yesterday',
  todayAt: 'today {{time}}',
  yesterdayAt: 'yesterday {{time}}',
  since: 'since {{date}}',
  minutes: '{{minutes}} min',
  hours: '{{hours}} h',
  hoursMinutes: '{{hours}} h {{minutes}} min',
}

export default format
