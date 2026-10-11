import type { IsoDateTime } from '@/shared/types'

const MINUTE = 60_000

/** Mock timestamps are relative to page load, so "20 минут назад" stays true in demos. */
export const minutesAgo = (minutes: number): IsoDateTime =>
  new Date(Date.now() - minutes * MINUTE).toISOString()

export const hoursAgo = (hours: number): IsoDateTime => minutesAgo(hours * 60)

export const daysAgo = (days: number): IsoDateTime => minutesAgo(days * 24 * 60)
