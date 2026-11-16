import type { ChatMessage } from '@/api/consultations'

import { chatPhotoSource, lastIncoming, mergeMessages, newestId } from './messages'

const msg = (id: string, senderId: string, at: string, extra: Partial<ChatMessage> = {}) => ({
  id,
  senderId,
  createdAt: at,
  text: id,
  ...extra,
})

describe('mergeMessages', () => {
  it('orders by time, oldest first, whatever the order of the answer', () => {
    const newestFirst = [
      msg('c', 'a', '2026-11-16T10:02:00Z'),
      msg('b', 'a', '2026-11-16T10:01:00Z'),
    ]
    expect(mergeMessages([], newestFirst).map((m) => m.id)).toEqual(['b', 'c'])
  })

  it('keeps one copy of a message and prefers the fresher one', () => {
    const held = [msg('a', 'me', '2026-11-16T10:00:00Z')]
    const merged = mergeMessages(held, [
      msg('a', 'me', '2026-11-16T10:00:00Z', { readAt: '2026-11-16T10:05:00Z' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].readAt).toBe('2026-11-16T10:05:00Z')
  })
})

describe('lastIncoming and newestId', () => {
  const list = [msg('a', 'other', '2026-11-16T10:00:00Z'), msg('b', 'me', '2026-11-16T10:01:00Z')]

  it('finds the newest message of the other side', () => {
    expect(lastIncoming(list, 'me')?.id).toBe('a')
    expect(lastIncoming([list[1]], 'me')).toBeUndefined()
  })

  it('takes the newest message as the cursor', () => {
    expect(newestId(list)).toBe('b')
    expect(newestId([])).toBeUndefined()
  })
})

describe('chatPhotoSource', () => {
  const photo = '/api/consultations/c1/messages/m1/photo'

  it('adds the token for the documented paths only', () => {
    expect(chatPhotoSource(photo, 'http://h:8080/', 't')).toEqual({
      uri: `http://h:8080${photo}`,
      headers: { Authorization: 'Bearer t' },
    })
    expect(chatPhotoSource('/api/consultations/c1/diagnosis/photo', 'http://h', 't')).not.toBeNull()
  })

  it('never sends the token elsewhere', () => {
    expect(chatPhotoSource('https://evil.example/x', 'http://h', 't')).toBeNull()
    expect(chatPhotoSource('/api/users/me', 'http://h', 't')).toBeNull()
    expect(chatPhotoSource(photo, 'http://h', null)).toBeNull()
    expect(chatPhotoSource(null, 'http://h', 't')).toBeNull()
  })
})
