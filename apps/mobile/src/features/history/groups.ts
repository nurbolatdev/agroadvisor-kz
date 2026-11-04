import type { DiagnosisResult } from '@/api/diagnosis'
import type { Language } from '@/i18n'

const LOCALES: Record<Language, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }

export type MonthGroup = {
  // "2026-09", unique and stable: the key of the group in the list
  key: string
  // "Сентябрь", with the year when it is not this one ("Сентябрь 2025"); empty for an unreadable date
  label: string
  items: DiagnosisResult[]
}

// "September" in the language of the app, capitalized as the group titles of screen 19.
function monthLabel(date: Date, language: Language, now: Date): string {
  const locale = LOCALES[language]
  try {
    const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date)
    const title = month.charAt(0).toLocaleUpperCase(locale) + month.slice(1)
    return date.getFullYear() === now.getFullYear() ? title : `${title} ${date.getFullYear()}`
  } catch {
    // a runtime without data for the locale
    return date.toISOString().slice(0, 7)
  }
}

// The history in groups by month (screen 19), in the order it came: newest first. A month is one group
// however the pages were loaded, so a month that continues on the next page stays one card. Months are
// the farmer's own (the phone's time zone), as the dates of the lines are.
export function groupByMonth(
  items: DiagnosisResult[],
  language: Language,
  now: Date = new Date(),
): MonthGroup[] {
  const groups: MonthGroup[] = []
  const byKey = new Map<string, MonthGroup>()
  for (const item of items) {
    const date = new Date(item.createdAt)
    const valid = !Number.isNaN(date.getTime())
    const key = valid
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : 'unknown'
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: valid ? monthLabel(date, language, now) : '', items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}
