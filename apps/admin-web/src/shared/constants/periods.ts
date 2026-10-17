import type { StatsPeriod } from '@/shared/types'

/** Periods of the switcher on analytics pages; labels come from `usePeriodOptions`. */
export const PERIODS: StatsPeriod[] = ['7d', '30d', 'season']

/** "за 30 дней", "за сезон" — used in subtitles. */
export const PERIOD_SUFFIX: Record<StatsPeriod, string> = {
  '7d': 'за 7 дней',
  '30d': 'за 30 дней',
  season: 'за сезон',
}
