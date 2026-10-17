import type { IsoDateTime } from '@/shared/types'
import i18n from '@/i18n'
import type ruFormat from '@/i18n/locales/ru/format'
import { INTL_LOCALES } from '@/i18n/resources'

const MINUTE = 60_000

type Language = keyof typeof INTL_LOCALES
const language = (): Language => (i18n.language in INTL_LOCALES ? i18n.language : 'ru') as Language
type FormatKey = keyof typeof ruFormat
const t = (key: FormatKey, options?: Record<string, unknown>): string =>
  String(i18n.getFixedT(null, 'format')(key, options as never))

// Intl formatters are costly to create, so one per language and option set is kept.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()
function intl<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  kind: 'number' | 'date',
  options: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions = {},
): T {
  const locale = INTL_LOCALES[language()]
  const key = `${kind}|${locale}|${JSON.stringify(options)}`
  if (!cache.has(key)) {
    cache.set(
      key,
      kind === 'number'
        ? new Intl.NumberFormat(locale, options)
        : new Intl.DateTimeFormat(locale, options),
    )
  }
  return cache.get(key) as T
}

/** 3860 → "3 860" (ru, kk) or "3,860" (en). */
export const formatNumber = (value: number) => intl<Intl.NumberFormat>('number').format(value)

const month = (list: 'monthsShort' | 'monthsSince', date: Date) =>
  t(list).split(',')[date.getMonth()]

/** "24 сент", "24 қыр", "Sep 24". */
export const formatShortDate = (date: IsoDateTime | Date) => {
  const value = new Date(date)
  return t('shortDate', { day: value.getDate(), month: month('monthsShort', value) })
}

/** "14:02" (en: "02:02 PM"). */
export const formatTime = (date: IsoDateTime | Date) =>
  intl<Intl.DateTimeFormat>('date', { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

/** "с мая 2026", "2026 ж. мамыр айынан бастап", "since May 2026". */
export function formatSince(date: IsoDateTime | Date) {
  const value = new Date(date)
  return t('since', { month: month('monthsSince', value), year: value.getFullYear() })
}

/** "сегодня 14:02", "вчера 09:15" or a short date. */
export function formatDayAndTime(date: IsoDateTime | Date, now: Date = new Date()) {
  const value = new Date(date)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (value.toDateString() === now.toDateString()) return t('todayAt', { time: formatTime(value) })
  if (value.toDateString() === yesterday.toDateString())
    return t('yesterdayAt', { time: formatTime(value) })
  return formatShortDate(value)
}

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "только что", "20 мин назад", "3 ч назад", "вчера", then a short date. */
export function formatRelativeTime(date: IsoDateTime | Date, now: Date = new Date()) {
  const value = new Date(date)
  const minutes = Math.floor((now.getTime() - value.getTime()) / MINUTE)

  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  if (isSameDay(value, now)) return t('hoursAgo', { count: Math.floor(minutes / 60) })

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(value, yesterday)) return t('yesterday')

  return formatShortDate(value)
}

/** 220 → "3 ч 40 мин", 45 → "45 мин", 120 → "2 ч". */
export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  if (hours === 0) return t('minutes', { minutes })
  return minutes === 0 ? t('hours', { hours }) : t('hoursMinutes', { hours, minutes })
}

/** Signed change: 12 → "+12", -3 → "−3" (typographic minus, as in the mockups). */
export const formatSigned = (value: number) =>
  value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0'

/**
 * Russian plural form: pluralize(3, ['жалоба', 'жалобы', 'жалоб']) → "3 жалобы".
 * Being replaced by i18next plurals (`t(key, { count })`) section by section.
 */
export function pluralize(count: number, [one, few, many]: [string, string, string]) {
  const mod10 = count % 10
  const mod100 = count % 100
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many
  return `${formatNumber(count)} ${word}`
}
