import type { IsoDateTime } from '@/shared/types'

const LOCALE = 'ru-RU'
const MINUTE = 60_000

const numberFormat = new Intl.NumberFormat(LOCALE)
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

/** 3860 → "3 860". */
export const formatNumber = (value: number) => numberFormat.format(value)

/** "24 сент" — without the trailing dot Intl adds to abbreviated months. */
export const formatShortDate = (date: IsoDateTime | Date) =>
  shortDateFormat.format(new Date(date)).replace('.', '')

/** "14:02". */
export const formatTime = (date: IsoDateTime | Date) => timeFormat.format(new Date(date))

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/**
 * Relative time as in the mockups: "только что", "20 мин назад", "3 ч назад",
 * "вчера", then a short date.
 */
export function formatRelativeTime(date: IsoDateTime | Date, now: Date = new Date()) {
  const value = new Date(date)
  const minutes = Math.floor((now.getTime() - value.getTime()) / MINUTE)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  if (isSameDay(value, now)) return `${Math.floor(minutes / 60)} ч назад`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(value, yesterday)) return 'вчера'

  return formatShortDate(value)
}

/** 220 → "3 ч 40 мин", 45 → "45 мин", 120 → "2 ч". */
export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  if (hours === 0) return `${minutes} мин`
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

/** Signed change: 12 → "+12", -3 → "−3" (typographic minus, as in the mockups). */
export const formatSigned = (value: number) =>
  value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0'

/** Russian plural form: pluralize(3, ['жалоба', 'жалобы', 'жалоб']) → "3 жалобы". */
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
