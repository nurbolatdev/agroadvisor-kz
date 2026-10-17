import type ru from '@/i18n/locales/ru/format'
import type { Translation } from '@/i18n/types'

const format: Translation<typeof ru> = {
  justNow: 'just now',
  minutesAgo: '{{count}} min ago',
  hoursAgo: '{{count}} h ago',
  yesterday: 'yesterday',
  todayAt: 'today {{time}}',
  yesterdayAt: 'yesterday {{time}}',
  since: 'since {{month}} {{year}}',
  shortDate: '{{month}} {{day}}',
  monthsShort: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  monthsSince:
    'January,February,March,April,May,June,July,August,September,October,November,December',
  monthsAxis: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  weekdaysShort: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
  weekShort: 'Wk {{week}}',
  minutes: '{{minutes}} min',
  hours: '{{hours}} h',
  hoursMinutes: '{{hours}} h {{minutes}} min',
}

export default format
