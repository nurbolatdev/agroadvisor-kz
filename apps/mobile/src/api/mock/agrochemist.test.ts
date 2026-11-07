import { NetworkError } from '../errors'
import { createMockAgrochemistApi } from './agrochemist'
import { createMockAuthApi } from './auth'
import { mockAccount } from './account'
import { createMockUsersApi } from './users'

const file = { uri: 'file:///cache/d.pdf', name: 'd.pdf', type: 'application/pdf' }
const fixed = () => new Date('2026-11-07T10:00:00Z')

function setup(maxDocuments?: number) {
  return createMockAgrochemistApi({ delayMs: 0, now: fixed, maxDocuments })
}

describe('mock agrochemist: the state of the check', () => {
  it('starts in the queue with no documents', async () => {
    const { api } = setup()
    await expect(api.verification()).resolves.toEqual({
      status: 'pending',
      submittedAt: '2026-11-07T10:00:00.000Z',
      reviewedAt: null,
      rejectionReason: null,
      documents: [],
    })
  })

  it.each(['pending', 'approved', 'rejected', 'documents_requested'] as const)(
    'can be put in the state %s',
    async (status) => {
      const { api, controls } = setup()
      controls.setStatus(status, 'Photo of the diploma is not readable')
      const view = await api.verification()
      expect(view.status).toBe(status)
      const withReason = status === 'rejected' || status === 'documents_requested'
      expect(view.rejectionReason).toBe(withReason ? 'Photo of the diploma is not readable' : null)
    },
  )

  it('fails once with no answer when asked to', async () => {
    const { api, controls } = setup()
    controls.failNextRead()
    await expect(api.verification()).rejects.toBeInstanceOf(NetworkError)
    await expect(api.verification()).resolves.toMatchObject({ status: 'pending' })
  })
})

describe('mock agrochemist: documents', () => {
  it('lists a sent document and queues the profile again, clearing the reason', async () => {
    const { api, controls } = setup()
    controls.setStatus('rejected', 'Not readable')

    const sent = await api.upload(file, { kind: 'diploma', title: 'Diploma', year: 2020 })

    expect(sent).toMatchObject({ kind: 'diploma', title: 'Diploma', year: 2020 })
    await expect(api.verification()).resolves.toMatchObject({
      status: 'pending',
      rejectionReason: null,
      documents: [sent],
    })
  })

  it('keeps the time of the last review when a document is sent after a rejection', async () => {
    const { api, controls } = setup()
    controls.setStatus('rejected', 'Not readable')
    const reviewed = (await api.verification()).reviewedAt
    expect(reviewed).not.toBeNull()

    await api.upload(file, { kind: 'diploma' })
    await expect(api.verification()).resolves.toMatchObject({ reviewedAt: reviewed })
  })

  it('refuses the sixth document with document_limit_reached', async () => {
    const { api } = setup(2)
    await api.upload(file, { kind: 'diploma' })
    await api.upload(file, { kind: 'certificate' })
    await expect(api.upload(file, { kind: 'certificate' })).rejects.toMatchObject({
      status: 409,
      code: 'document_limit_reached',
    })
  })

  it('locks an approved profile for sending and for removing', async () => {
    const { api, controls } = setup()
    const sent = await api.upload(file, { kind: 'diploma' })
    controls.setStatus('approved')

    await expect(api.upload(file, { kind: 'diploma' })).rejects.toMatchObject({
      status: 409,
      code: 'agrochemist_already_approved',
    })
    await expect(api.remove(sent.id)).rejects.toMatchObject({
      status: 409,
      code: 'agrochemist_already_approved',
    })
  })

  it('removes a document and answers 404 for an unknown one', async () => {
    const { api } = setup()
    const sent = await api.upload(file, { kind: 'diploma' })
    await api.remove(sent.id)
    await expect(api.verification()).resolves.toMatchObject({ documents: [] })
    await expect(api.remove(sent.id)).rejects.toMatchObject({
      status: 404,
      code: 'document_not_found',
    })
  })

  it.each(['empty', 'too_large', 'unsupported_format', 'corrupted'] as const)(
    'fails the next upload once with invalid_document (%s)',
    async (reason) => {
      const { api, controls } = setup()
      controls.failNextUpload(reason)
      await expect(api.upload(file, { kind: 'diploma' })).rejects.toMatchObject({
        status: 400,
        code: 'invalid_document',
        reason,
      })
      await expect(api.upload(file, { kind: 'diploma' })).resolves.toMatchObject({
        kind: 'diploma',
      })
    },
  )

  it('can fail an upload with no answer from the server', async () => {
    const { api, controls } = setup()
    controls.failNextUpload('network')
    await expect(api.upload(file, { kind: 'diploma' })).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('mock sign-up with a role', () => {
  afterEach(() => mockAccount.reset())

  it('answers /api/users/me with the role chosen at sign-up', async () => {
    const auth = createMockAuthApi()
    const users = createMockUsersApi({ delayMs: 0 })
    await auth.register({
      fullName: 'A',
      login: 'agro@example.com',
      password: 'secret-pass-1',
      role: 'agrochemist',
    })
    await expect(users.me()).resolves.toMatchObject({ roles: ['agrochemist'] })
  })

  it('answers with a farmer when a farmer signed up', async () => {
    const auth = createMockAuthApi()
    const users = createMockUsersApi({ delayMs: 0 })
    await auth.register({
      fullName: 'F',
      login: 'f@example.com',
      password: 'secret-pass-1',
      role: 'farmer',
    })
    await expect(users.me()).resolves.toMatchObject({ roles: ['farmer'] })
  })
})
