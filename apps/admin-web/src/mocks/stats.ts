import { daysAgo } from '@/mocks/time'
import type { ModerationStats, OverviewStats, StatsPeriod, VerificationStats } from '@/shared/types'

/** Diagnoses per day for the last 30 days: 3 860 in total, ~129 per day (admin-01). */
const DAILY_DIAGNOSES = [
  70, 79, 73, 85, 93, 88, 97, 103, 97, 111, 109, 120, 116, 129, 125, 135, 129, 140, 146, 139, 152,
  158, 149, 163, 169, 173, 164, 178, 183, 187,
]

/** Diagnoses per week since the start of the season (April). */
const WEEKLY_DIAGNOSES_SEASON = [
  180, 260, 340, 420, 510, 590, 640, 700, 760, 780, 810, 790, 770, 740, 720, 700, 680, 690, 720,
  760, 800, 840, 870, 900, 920, 980,
]

const toSeries = (counts: number[], stepDays: number) =>
  counts.map((count, index) => ({
    date: daysAgo((counts.length - index) * stepDays).slice(0, 10),
    count,
  }))

const WEEKS = [
  { week: '1 нед', farmers: 98, agrochemists: 4 },
  { week: '2 нед', farmers: 112, agrochemists: 6 },
  { week: '3 нед', farmers: 128, agrochemists: 3 },
  { week: '4 нед', farmers: 146, agrochemists: 7 },
  { week: '5 нед', farmers: 160, agrochemists: 5 },
]

const MONTHS = [
  { week: 'Апр', farmers: 210, agrochemists: 9 },
  { week: 'Май', farmers: 380, agrochemists: 14 },
  { week: 'Июн', farmers: 450, agrochemists: 12 },
  { week: 'Июл', farmers: 410, agrochemists: 10 },
  { week: 'Авг', farmers: 470, agrochemists: 15 },
  { week: 'Сен', farmers: 560, agrochemists: 21 },
]

/** Funnel shares from admin-01: 100 / 96 / 70 / 30 / 21 %. */
const funnel = (photos: number): OverviewStats['funnel'] => [
  { step: 'photo', count: photos },
  { step: 'diagnosis', count: Math.round(photos * 0.9617) },
  { step: 'treatment_plan', count: Math.round(photos * 0.6953) },
  { step: 'expert_or_community', count: Math.round(photos * 0.2959) },
  { step: 'shops_map', count: Math.round(photos * 0.2088) },
]

const updatedAt = (() => {
  const date = new Date()
  date.setHours(6, 0, 0, 0)
  return date.toISOString()
})()

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export const mockOverviewStats: Record<StatsPeriod, OverviewStats> = {
  '7d': {
    period: '7d',
    updatedAt,
    activeUsers: { value: 860, changePercent: 4 },
    diagnoses: { value: sum(DAILY_DIAGNOSES.slice(-7)), changePercent: 6 },
    avgConfidence: { percent: 88, changePoints: 1 },
    lowConfidenceShare: { percent: 10, changePoints: -1 },
    openComplaints: { value: 3, changeToday: 1 },
    pendingVerifications: 4,
    diagnosesByDay: toSeries(DAILY_DIAGNOSES.slice(-7), 1),
    newUsersByWeek: WEEKS,
    funnel: funnel(sum(DAILY_DIAGNOSES.slice(-7))),
    avgMinutesToFirstAdvice: 205,
  },
  '30d': {
    period: '30d',
    updatedAt,
    activeUsers: { value: 1240, changePercent: 12 },
    diagnoses: { value: sum(DAILY_DIAGNOSES), changePercent: 18 },
    avgConfidence: { percent: 87, changePoints: 2 },
    lowConfidenceShare: { percent: 11, changePoints: -3 },
    openComplaints: { value: 3, changeToday: 1 },
    pendingVerifications: 4,
    diagnosesByDay: toSeries(DAILY_DIAGNOSES, 1),
    newUsersByWeek: WEEKS,
    funnel: funnel(sum(DAILY_DIAGNOSES)),
    avgMinutesToFirstAdvice: 220,
  },
  season: {
    period: 'season',
    updatedAt,
    activeUsers: { value: 2140, changePercent: 35 },
    diagnoses: { value: sum(WEEKLY_DIAGNOSES_SEASON), changePercent: 41 },
    avgConfidence: { percent: 85, changePoints: 4 },
    lowConfidenceShare: { percent: 13, changePoints: -5 },
    openComplaints: { value: 3, changeToday: 1 },
    pendingVerifications: 4,
    diagnosesByDay: toSeries(WEEKLY_DIAGNOSES_SEASON, 7),
    newUsersByWeek: MONTHS,
    funnel: funnel(sum(WEEKLY_DIAGNOSES_SEASON)),
    avgMinutesToFirstAdvice: 245,
  },
}

export const mockModerationStats: ModerationStats = {
  complaintsToday: 3,
  avgResolutionMinutes: 80,
  resolvedThisWeek: 27,
}

export const mockVerificationStats: VerificationStats = {
  pending: 4,
  approved: 38,
  rejectedThisMonth: 2,
}
