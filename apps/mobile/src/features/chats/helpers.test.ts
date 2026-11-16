import type { Consultation } from '@/api/consultations'

import { chatTimeLabel, counterpartName, filterChats } from './helpers'

const base: Consultation = {
  id: 'c1',
  status: 'active',
  unreadCount: 0,
  createdAt: '2026-11-15T08:00:00Z',
  farmer: { id: 'f1', fullName: 'Farmer One' },
  agrochemist: { id: 'a1', fullName: 'Aigul Sarsenova' },
}

const make = (over: Partial<Consultation>): Consultation => ({ ...base, ...over })

describe('counterpartName', () => {
  it('shows the agrochemist to the farmer and the farmer to the agrochemist', () => {
    expect(counterpartName(base, false)).toBe('Aigul Sarsenova')
    expect(counterpartName(base, true)).toBe('Farmer One')
  })
})

describe('filterChats', () => {
  const items = [
    make({ id: '1', unreadCount: 2 }),
    make({ id: '2', agrochemist: { id: 'a2', fullName: 'Dinara Kim' } }),
  ]

  it('returns everything for an empty query', () => {
    expect(filterChats(items, { query: ' ', filter: 'all', asAgrochemist: false })).toHaveLength(2)
  })

  it('keeps only unread chats', () => {
    const result = filterChats(items, { query: '', filter: 'unread', asAgrochemist: false })
    expect(result.map((c) => c.id)).toEqual(['1'])
  })

  it('searches the name of the other side, ignoring case', () => {
    const result = filterChats(items, { query: 'DINA', filter: 'all', asAgrochemist: false })
    expect(result.map((c) => c.id)).toEqual(['2'])
  })
})

describe('chatTimeLabel', () => {
  const now = new Date(2026, 10, 16, 12, 0)

  it('shows the hour for today', () => {
    const label = chatTimeLabel(new Date(2026, 10, 16, 9, 45).toISOString(), now, 'en')
    expect(label).toEqual({ kind: 'time', value: '09:45' })
  })

  it('says yesterday for the day before', () => {
    expect(chatTimeLabel(new Date(2026, 10, 15, 23, 0).toISOString(), now, 'en')).toEqual({
      kind: 'yesterday',
    })
  })

  it('shows the short date for older messages', () => {
    const label = chatTimeLabel(new Date(2026, 9, 28, 10, 0).toISOString(), now, 'en')
    expect(label.kind).toBe('date')
  })
})
