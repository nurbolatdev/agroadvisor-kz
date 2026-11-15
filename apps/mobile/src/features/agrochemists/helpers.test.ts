import type { AgrochemistCard } from '@/api/agrochemistDirectory'

import { filterAgrochemists, initials } from './helpers'

const card = (fullName: string, specializations: string[] = []): AgrochemistCard => ({
  id: fullName,
  fullName,
  crops: [],
  specializations,
  verifiedAt: '2026-10-01T09:00:00Z',
})

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Айгуль Сарсенова')).toBe('АС')
    expect(initials('  динара   ким  Алиевна ')).toBe('ДК')
  })

  it('works for one word and for an empty name', () => {
    expect(initials('Мирас')).toBe('М')
    expect(initials('   ')).toBe('')
  })
})

describe('filterAgrochemists', () => {
  const name = (code: string) => (code === 'fertilizers' ? 'Удобрения' : code)
  const items = [card('Айгуль Сарсенова'), card('Бауыржан Оспанов', ['fertilizers'])]

  it('returns everything for an empty search', () => {
    expect(filterAgrochemists(items, '  ', name)).toBe(items)
  })

  it('matches a part of the name, ignoring case', () => {
    expect(filterAgrochemists(items, 'сарсе', name).map((a) => a.fullName)).toEqual([
      'Айгуль Сарсенова',
    ])
  })

  it('matches the name of a specialization', () => {
    expect(filterAgrochemists(items, 'удобр', name).map((a) => a.fullName)).toEqual([
      'Бауыржан Оспанов',
    ])
  })

  it('returns nothing when nobody matches', () => {
    expect(filterAgrochemists(items, 'zzz', name)).toEqual([])
  })
})
