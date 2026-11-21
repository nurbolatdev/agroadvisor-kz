import { createNotificationsApi, notificationsPath } from './notifications'
import { createMockNotificationsApi } from './mock/notifications'

describe('notificationsPath', () => {
  it('always sends unread, the page and the size', () => {
    expect(notificationsPath()).toBe('/api/notifications?unread=false&page=0&size=20')
    expect(notificationsPath({ unread: true, page: 2, size: 5 })).toBe(
      '/api/notifications?unread=true&page=2&size=5',
    )
  })

  it('keeps the numbers inside the limits of the backend', () => {
    expect(notificationsPath({ page: -3, size: 500 })).toBe(
      '/api/notifications?unread=false&page=0&size=50',
    )
    expect(notificationsPath({ page: Number.NaN, size: 0 })).toBe(
      '/api/notifications?unread=false&page=0&size=1',
    )
  })
})

describe('notifications api', () => {
  const client = { request: jest.fn() }
  beforeEach(() => client.request.mockReset().mockResolvedValue({ count: 0 }))

  it('calls the documented endpoints', async () => {
    const api = createNotificationsApi(client as never)

    await api.list({ unread: true })
    await api.unreadCount()
    await api.markRead('n/1')
    await api.markAllRead()

    expect(client.request.mock.calls).toEqual([
      ['/api/notifications?unread=true&page=0&size=20'],
      ['/api/notifications/unread-count'],
      ['/api/notifications/n%2F1/read', { method: 'POST' }],
      ['/api/notifications/read-all', { method: 'POST' }],
    ])
  })
})

describe('mock notifications', () => {
  const make = () => createMockNotificationsApi({ delayMs: 0, now: () => 1_700_000_000_000 })

  it('lists the latest first and counts the unread', async () => {
    const { api, controls } = make()
    const first = controls.push('consultation_accepted', { consultationId: 'c1' })
    const second = controls.push('consultation_message', { consultationId: 'c1', messageId: 'm1' })

    expect((await api.list()).map((n) => n.id)).toEqual([second.id, first.id])
    expect(await api.unreadCount()).toEqual({ count: 2 })
  })

  it('marks one as read and answers what is still unread; repeating changes nothing', async () => {
    const { api, controls } = make()
    const a = controls.push('verification_approved')
    controls.push('verification_rejected')

    expect(await api.markRead(a.id)).toEqual({ count: 1 })
    expect(await api.markRead(a.id)).toEqual({ count: 1 })
    expect((await api.list({ unread: true })).map((n) => n.type)).toEqual(['verification_rejected'])
  })

  it('collapses unread messages of one chat and verdicts of one diagnosis, and no other type', async () => {
    const { api, controls } = make()
    controls.push('consultation_message', { consultationId: 'c1', messageId: 'm1' })
    const row = controls.push('consultation_message', { consultationId: 'c1', messageId: 'm2' })
    controls.push('consultation_message', { consultationId: 'c2', messageId: 'm3' })
    controls.push('diagnosis_reviewed', { diagnosisId: 'd1' })
    controls.push('diagnosis_reviewed', { diagnosisId: 'd1' })
    controls.push('consultation_accepted', { consultationId: 'c1' })
    controls.push('consultation_accepted', { consultationId: 'c1' })

    expect(row.count).toBe(2)
    expect(row.messageId).toBe('m2')
    const list = await api.list()
    expect(list).toHaveLength(5)
    expect(list.find((n) => n.diagnosisId === 'd1')?.count).toBe(2)
  })

  it('collapses answers of one question, new questions and picks of one answer', async () => {
    const { api, controls } = make()
    controls.push('community_answer', { questionId: 'q1', answerId: 'a1' })
    const answers = controls.push('community_answer', { questionId: 'q1', answerId: 'a2' })
    controls.push('community_answer', { questionId: 'q2', answerId: 'a3' })
    controls.push('community_question', { questionId: 'q3' })
    const questions = controls.push('community_question', { questionId: 'q4' })
    controls.push('community_answer_accepted', { questionId: 'q1', answerId: 'a1' })
    const accepted = controls.push('community_answer_accepted', {
      questionId: 'q1',
      answerId: 'a1',
    })
    controls.push('community_answer_accepted', { questionId: 'q1', answerId: 'a2' })

    expect(accepted.count).toBe(2)
    expect(answers.count).toBe(2)
    expect(answers.answerId).toBe('a2')
    expect(questions.count).toBe(2)
    expect(questions.questionId).toBe('q4')
    const list = await api.list()
    expect(list).toHaveLength(5)
    expect(list.filter((n) => n.type === 'community_answer_accepted')).toHaveLength(2)
    expect(list.filter((n) => n.type === 'community_question')).toHaveLength(1)
  })

  it('starts a new row after the old one was read', async () => {
    const { api, controls } = make()
    const first = controls.push('consultation_message', { consultationId: 'c1', messageId: 'm1' })
    await api.markRead(first.id)

    const next = controls.push('consultation_message', { consultationId: 'c1', messageId: 'm2' })

    expect(next.id).not.toBe(first.id)
    expect(next.count).toBe(1)
  })

  it('marks everything as read', async () => {
    const { api, controls } = make()
    controls.push('verification_approved')
    controls.push('diagnosis_reviewed', { diagnosisId: 'd1' })

    expect(await api.markAllRead()).toEqual({ count: 0 })
    expect(await api.unreadCount()).toEqual({ count: 0 })
  })

  it('pages the list and answers 404 for an unknown id', async () => {
    const { api, controls } = make()
    for (let i = 0; i < 3; i += 1) controls.push('verification_approved')

    expect(await api.list({ page: 1, size: 2 })).toHaveLength(1)
    await expect(api.markRead('nope')).rejects.toMatchObject({
      status: 404,
      code: 'notification_not_found',
    })
  })
})
