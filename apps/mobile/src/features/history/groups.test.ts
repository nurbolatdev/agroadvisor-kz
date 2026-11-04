import type { DiagnosisResult } from '@/api/diagnosis'

import { groupByMonth } from './groups'

function at(id: string, createdAt: string): DiagnosisResult {
  const top1 = { code: 'tomato__healthy', confidence: 0.9 }
  return {
    id,
    crop: 'tomato',
    status: 'ok',
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    photoUrl: `/api/diagnoses/${id}/photo`,
    createdAt,
  }
}

// the middle of a month, so that the time zone of the test machine cannot move a date to another month
const NOW = new Date('2026-11-15T12:00:00')

describe('history groups by month', () => {
  it('keeps the order and puts every month in one group', () => {
    const items = [
      at('a', '2026-09-24T12:00:00'),
      at('b', '2026-09-12T12:00:00'),
      at('c', '2026-08-21T12:00:00'),
      at('d', '2026-08-02T12:00:00'),
    ]

    const groups = groupByMonth(items, 'en', NOW)

    expect(groups.map((g) => [g.key, g.items.map((d) => d.id)])).toEqual([
      ['2026-09', ['a', 'b']],
      ['2026-08', ['c', 'd']],
    ])
  })

  it('names the month in the chosen language, capitalized', () => {
    const items = [at('a', '2026-09-24T12:00:00')]

    expect(groupByMonth(items, 'en', NOW)[0].label).toBe('September')
    expect(groupByMonth(items, 'ru', NOW)[0].label).toBe('Сентябрь')
  })

  it('adds the year when the month is not of this year', () => {
    const groups = groupByMonth([at('a', '2025-09-24T12:00:00')], 'en', NOW)

    expect(groups[0].label).toBe('September 2025')
  })

  it('the same month of two years are two groups', () => {
    const groups = groupByMonth(
      [at('a', '2026-09-10T12:00:00'), at('b', '2025-09-10T12:00:00')],
      'en',
      NOW,
    )

    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2025-09'])
  })

  it('puts a date that cannot be read into a group of its own, without a title', () => {
    const groups = groupByMonth([at('a', 'not a date'), at('b', '2026-09-10T12:00:00')], 'en', NOW)

    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['unknown', ''],
      ['2026-09', 'September'],
    ])
  })

  it('has no groups for an empty history', () => {
    expect(groupByMonth([], 'ru', NOW)).toEqual([])
  })
})
