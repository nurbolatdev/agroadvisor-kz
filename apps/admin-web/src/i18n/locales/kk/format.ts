import type ru from '@/i18n/locales/ru/format'
import type { Translation } from '@/i18n/types'

const format: Translation<typeof ru> = {
  justNow: 'жаңа ғана',
  minutesAgo: '{{count}} мин бұрын',
  hoursAgo: '{{count}} сағ бұрын',
  yesterday: 'кеше',
  todayAt: 'бүгін {{time}}',
  yesterdayAt: 'кеше {{time}}',
  since: '{{year}} ж. {{month}} айынан бастап',
  shortDate: '{{day}} {{month}}',
  monthsShort: 'қаң,ақп,нау,сәу,мам,мау,шіл,там,қыр,қаз,қар,жел',
  monthsSince: 'қаңтар,ақпан,наурыз,сәуір,мамыр,маусым,шілде,тамыз,қыркүйек,қазан,қараша,желтоқсан',
  minutes: '{{minutes}} мин',
  hours: '{{hours}} сағ',
  hoursMinutes: '{{hours}} сағ {{minutes}} мин',
}

export default format
