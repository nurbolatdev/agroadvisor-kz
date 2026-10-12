import type { StatsPeriod } from '@/shared/types'

/** Options of the "7 дней · 30 дней · Сезон" switcher on analytics pages. */
export const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: 'season', label: 'Сезон' },
]

/** "за 30 дней", "за сезон" — used in subtitles. */
export const PERIOD_SUFFIX: Record<StatsPeriod, string> = {
  '7d': 'за 7 дней',
  '30d': 'за 30 дней',
  season: 'за сезон',
}
