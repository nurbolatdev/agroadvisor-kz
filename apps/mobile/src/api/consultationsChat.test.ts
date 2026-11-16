import type { ApiClient } from './client'
import {
  createConsultationsApi,
  listPath,
  messagesPath,
  photoFormData,
  type ConsultationsApi,
} from './consultations'
import { MOCK_AGROCHEMISTS } from './mock/agrochemistDirectory'
import { createMockConsultationsApi, MOCK_FARMER_ID } from './mock/consultations'

describe('listPath', () => {
  it('repeats the status and always sends the page and the size', () => {
    expect(listPath()).toBe('/api/consultations?page=0&size=20')
    expect(listPath({ status: ['requested', 'active'], page: 2, size: 5 })).toBe(
      '/api/consultations?status=requested&status=active&page=2&size=5',
    )
  })

  it('keeps the numbers inside the limits of the backend', () => {
    expect(listPath({ page: -1, size: 500 })).toBe('/api/consultations?page=0&size=50')
    expect(listPath({ page: 99_999, size: 0 })).toBe('/api/consultations?page=10000&size=1')
    expect(listPath({ page: Number.NaN })).toBe('/api/consultations?page=0&size=20')
  })
})

describe('messagesPath', () => {
  it('asks the newest page, or older ones before a message, or newer ones after it', () => {
    expect(messagesPath('c1')).toBe('/api/consultations/c1/messages?limit=30')
    expect(messagesPath('c1', { before: 'm5', limit: 10 })).toBe(
      '/api/consultations/c1/messages?before=m5&limit=10',
    )
    expect(messagesPath('c1', { after: 'm9' })).toBe(
      '/api/consultations/c1/messages?after=m9&limit=30',
    )
  })

  it('never sends both cursors: the backend would answer 400', () => {
    expect(messagesPath('c1', { before: 'a', after: 'b' })).toBe(
      '/api/consultations/c1/messages?before=a&limit=30',
    )
  })

  it('keeps the limit inside 1..100 and encodes the ids', () => {
    expect(messagesPath('a/b', { limit: 1000 })).toBe('/api/consultations/a%2Fb/messages?limit=100')
  })
})

describe('photoFormData', () => {
  afterEach(() => jest.restoreAllMocks())

  it('sends the photo under a neutral name and the caption as a form part', () => {
    const append = jest.spyOn(FormData.prototype, 'append')

    const form = photoFormData(
      { uri: 'file:///Ivanov.png', name: 'Ivanov.png', type: 'image/png' },
      ' look ',
    )

    expect(form.get('text')).toBe('look')
    expect(append).toHaveBeenCalledWith(
      'image',
      expect.objectContaining({ uri: 'file:///Ivanov.png', type: 'image/png', name: 'photo.png' }),
    )
  })

  it('leaves the caption out when it is blank', () => {
    const form = photoFormData({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }, '  ')

    expect(form.get('text')).toBeNull()
  })
})

describe('createConsultationsApi', () => {
  it('calls the endpoints of the contract', async () => {
    const request = jest.fn().mockResolvedValue({})
    const api = createConsultationsApi({ request } as unknown as ApiClient)

    await api.list({ status: ['active'] })
    await api.messages('c1', { after: 'm1' })
    await api.get('c1')
    await api.accept('c1')
    await api.decline('c1')
    await api.close('c1')
    await api.sendMessage('c1', 'hi')
    await api.markRead('c1', 'm1')
    await api.unreadCount()
    await api.diagnosis('c1')

    expect(request.mock.calls).toEqual([
      ['/api/consultations?status=active&page=0&size=20'],
      ['/api/consultations/c1/messages?after=m1&limit=30'],
      ['/api/consultations/c1'],
      ['/api/consultations/c1/accept', { method: 'POST' }],
      ['/api/consultations/c1/decline', { method: 'POST' }],
      ['/api/consultations/c1/close', { method: 'POST' }],
      ['/api/consultations/c1/messages', { method: 'POST', body: { text: 'hi' } }],
      ['/api/consultations/c1/read', { method: 'POST', body: { upTo: 'm1' } }],
      ['/api/consultations/unread-count'],
      ['/api/consultations/c1/diagnosis'],
    ])
  })

  it('sends a photo as multipart with a long timeout', async () => {
    const request = jest.fn().mockResolvedValue({})
    const api = createConsultationsApi({ request } as unknown as ApiClient)

    await api.sendPhoto('c1', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' })

    expect(request).toHaveBeenCalledWith(
      '/api/consultations/c1/messages/photo',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 120_000,
        formData: expect.any(FormData),
      }),
    )
  })
})

describe('mock chat with a simulated agrochemist', () => {
  const agrochemistId = MOCK_AGROCHEMISTS[0].id
  const make = () =>
    createMockConsultationsApi({
      delayMs: 0,
      now: () => 1_700_000_000_000,
      simulate: { acceptAfterMs: 5_000, replyAfterMs: 3_000 },
    })

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('accepts a request after a while and greets the farmer', async () => {
    const api = make()
    const c = await api.create({ agrochemistId, text: 'first' })
    expect((await api.get(c.id)).status).toBe('requested')

    await jest.advanceTimersByTimeAsync(5_000)

    const accepted = await api.get(c.id)
    expect(accepted.status).toBe('active')
    expect(accepted.unreadCount).toBe(1)
    const newest = (await api.messages(c.id))[0]
    expect(newest.senderId).toBe(agrochemistId)
  })

  it('answers every message of the farmer after a pause', async () => {
    const api = make()
    const c = await api.create({ agrochemistId, text: 'first' })
    await jest.advanceTimersByTimeAsync(5_000)
    const before = (await api.messages(c.id)).length

    await api.sendMessage(c.id, 'And the neighbours?')
    expect((await api.messages(c.id)).length).toBe(before + 1)
    await jest.advanceTimersByTimeAsync(3_000)

    const after = await api.messages(c.id)
    expect(after.length).toBe(before + 2)
    expect(after[0].senderId).toBe(agrochemistId)
  })

  it('does not accept a request the farmer withdrew, nor answer a closed chat', async () => {
    const api = make()
    const withdrawn = await api.create({ agrochemistId, text: 'first' })
    await api.close(withdrawn.id)
    await jest.advanceTimersByTimeAsync(5_000)
    expect((await api.get(withdrawn.id)).status).toBe('closed')
    expect(await api.messages(withdrawn.id)).toHaveLength(1)
  })

  it('stays silent when it is not asked to simulate', async () => {
    const api = createMockConsultationsApi({ delayMs: 0, now: () => 1_700_000_000_000 })
    const c = await api.create({ agrochemistId, text: 'first' })

    await jest.advanceTimersByTimeAsync(60_000)

    expect((await api.get(c.id)).status).toBe('requested')
  })
})

describe('mock chat', () => {
  const agrochemistId = MOCK_AGROCHEMISTS[0].id
  const make = () => createMockConsultationsApi({ delayMs: 0, now: () => 1_700_000_000_000 })

  async function active(api: ConsultationsApi) {
    const c = await api.create({ agrochemistId, text: 'first' })
    await api.accept(c.id)
    return c
  }

  it('walks the statuses: requested, active, closed; wrong steps are 409 with the status', async () => {
    const api = make()
    const c = await api.create({ agrochemistId, text: 'first' })

    await expect(api.sendMessage(c.id, 'too early')).rejects.toMatchObject({
      status: 409,
      code: 'invalid_consultation_state',
      reason: 'requested',
    })
    expect((await api.accept(c.id)).status).toBe('active')
    await expect(api.accept(c.id)).rejects.toMatchObject({ reason: 'active' })
    expect(await api.close(c.id)).toMatchObject({ status: 'closed', closedBy: MOCK_FARMER_ID })
    await expect(api.close(c.id)).rejects.toMatchObject({ reason: 'closed' })
  })

  it('lets the farmer withdraw a waiting request and the agrochemist decline it', async () => {
    const api = make()
    const a = await api.create({ agrochemistId, text: 'a' })
    const b = await api.create({ agrochemistId: MOCK_AGROCHEMISTS[1].id, text: 'b' })

    expect((await api.close(a.id)).status).toBe('closed')
    expect((await api.decline(b.id)).status).toBe('declined')
    await expect(api.decline(b.id)).rejects.toMatchObject({ reason: 'declined' })
  })

  it('records the agrochemist as the one who declined, and the caller as the one who closed', async () => {
    const api = make()
    const a = await api.create({ agrochemistId, text: 'a' })
    const b = await api.create({ agrochemistId: MOCK_AGROCHEMISTS[1].id, text: 'b' })

    expect((await api.decline(a.id)).closedBy).toBe(agrochemistId)
    expect((await api.close(b.id)).closedBy).toBe(MOCK_FARMER_ID)
  })

  it('hands out copies: an old answer does not change when the consultation does', async () => {
    const api = make()
    const before = await api.create({ agrochemistId, text: 'first' })

    await api.accept(before.id)

    expect(before.status).toBe('requested')
    expect((await api.get(before.id)).status).toBe('active')
  })

  it('refuses both cursors together, like the backend', async () => {
    const api = make()
    const c = await active(api)

    await expect(api.messages(c.id, { before: 'a', after: 'b' })).rejects.toMatchObject({
      status: 400,
      code: 'validation_failed',
    })
  })

  it('keeps the limit of a page inside 1..100', async () => {
    const api = make()
    const c = await active(api)

    expect(await api.messages(c.id, { limit: 0 })).toHaveLength(1)
  })

  it('has nothing unread in a closed consultation', async () => {
    const other = createMockConsultationsApi({ delayMs: 0, viewerId: 'someone-else' })
    const c = await other.create({ agrochemistId, text: 'from the farmer' })
    const [first] = await other.messages(c.id)
    await other.close(c.id)

    expect(await other.markRead(c.id, first.id)).toEqual({ unreadCount: 0 })
    expect((await other.list())[0].unreadCount).toBe(0)
  })

  it('answers 404 for an unknown consultation', async () => {
    await expect(make().get('nope')).rejects.toMatchObject({
      status: 404,
      code: 'consultation_not_found',
    })
  })

  it('starts the chat with the text of the request and pages it by cursors', async () => {
    const api = make()
    const c = await active(api)
    const sent = []
    for (const text of ['one', 'two', 'three']) sent.push(await api.sendMessage(c.id, text))

    const newest = await api.messages(c.id, { limit: 2 })
    expect(newest.map((m) => m.text)).toEqual(['three', 'two'])

    const older = await api.messages(c.id, { before: newest[1].id, limit: 5 })
    expect(older.map((m) => m.text)).toEqual(['one', 'first'])

    const newer = await api.messages(c.id, { after: sent[0].id })
    expect(newer.map((m) => m.text)).toEqual(['two', 'three'])

    await expect(api.messages(c.id, { before: 'nope' })).rejects.toMatchObject({
      code: 'message_not_found',
    })
  })

  it('keeps the last message and sorts the list by the latest activity', async () => {
    const api = make()
    const a = await active(api)
    const b = await api.create({ agrochemistId: MOCK_AGROCHEMISTS[1].id, text: 'b' })
    await api.sendMessage(a.id, 'newest')

    const list = await api.list()

    expect(list.map((c) => c.id)).toEqual([a.id, b.id])
    expect(list[0].lastMessage?.text).toBe('newest')
    expect(await api.list({ status: ['requested'] })).toHaveLength(1)
  })

  it('sends a photo with or without a caption, and refuses a bad caption', async () => {
    const api = make()
    const c = await active(api)
    const file = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }

    const bare = await api.sendPhoto(c.id, file)
    const captioned = await api.sendPhoto(c.id, file, 'rust')

    expect(bare).toMatchObject({ text: null, photoUrl: expect.stringContaining('/photo') })
    expect(captioned.text).toBe('rust')
    await expect(api.sendPhoto(c.id, file, 'bad\u0007')).rejects.toMatchObject({
      code: 'validation_failed',
    })
  })

  it('counts the incoming unread messages and clears them when they are read', async () => {
    const other = createMockConsultationsApi({ delayMs: 0, viewerId: 'someone-else' })
    const c = await other.create({ agrochemistId, text: 'from the farmer' })
    await other.accept(c.id)
    const incoming = await other.messages(c.id)

    expect(await other.unreadCount()).toEqual({ count: 1 })
    expect(await other.markRead(c.id, incoming[0].id)).toEqual({ unreadCount: 0 })
    expect(await other.unreadCount()).toEqual({ count: 0 })
    expect((await other.messages(c.id))[0].readAt).not.toBeNull()
    await expect(other.markRead(c.id, 'nope')).rejects.toMatchObject({ code: 'message_not_found' })
  })

  it('answers the attached diagnosis, or 404 when there is none', async () => {
    const diagnosis = { id: 'd1' } as never
    const api = createMockConsultationsApi({ delayMs: 0, diagnosisOf: () => diagnosis })
    const withDiagnosis = await api.create({ agrochemistId, text: 'a', diagnosisId: 'd1' })
    const without = await api.create({ agrochemistId: MOCK_AGROCHEMISTS[1].id, text: 'b' })

    expect(await api.diagnosis(withDiagnosis.id)).toBe(diagnosis)
    await expect(api.diagnosis(without.id)).rejects.toMatchObject({ code: 'diagnosis_not_found' })
  })
})
