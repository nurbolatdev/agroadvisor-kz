import { ApiError, NetworkError } from '@/api/errors'
import type { RegisterBody } from '@/api/auth'

import { createApplicationStore, type ApplicationDeps } from './application'

const account = {
  fullName: ' Aigul Sarsenova ',
  login: ' +77001112233 ',
  password: 'secret-pass-1',
}
const qualification = { specializations: ['plant_protection' as const], experienceYears: 12 }
const document = {
  file: { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' },
  meta: { kind: 'diploma' as const },
}

function setup(overrides: Partial<ApplicationDeps> = {}) {
  const calls: string[] = []
  const bodies: RegisterBody[] = []
  const deps: ApplicationDeps = {
    register: async (body) => {
      calls.push('register')
      bodies.push(body)
    },
    upload: async () => {
      calls.push('upload')
    },
    documentCount: async () => {
      calls.push('count')
      return 0
    },
    releaseEntry: () => {
      calls.push('release')
    },
    language: () => 'ru',
    ...overrides,
  }
  const store = createApplicationStore(deps)
  store.getState().setAccount(account)
  store.getState().setQualification(qualification)
  store.getState().setDocument(document)
  return { store, calls, bodies }
}

describe('the application of an agrochemist', () => {
  it('registers, sends the document and ends as sent', async () => {
    const { store, calls, bodies } = setup()

    await expect(store.getState().submit()).resolves.toBe('sent')

    expect(calls).toEqual(['register', 'upload'])
    expect(store.getState().phase).toBe('sent')
    expect(store.getState().failure).toBeNull()
    expect(bodies[0]).toEqual({
      fullName: 'Aigul Sarsenova',
      login: '+77001112233',
      password: 'secret-pass-1',
      language: 'ru',
      role: 'agrochemist',
      specializations: ['plant_protection'],
      experienceYears: 12,
    })
  })

  it('drops the password as soon as the account exists', async () => {
    const { store } = setup()

    await store.getState().submit()

    expect(store.getState().account?.password).toBe('')
  })

  it('keeps the password while the registration has not gone through, for another try', async () => {
    let fail = true
    const { store } = setup({
      register: async () => {
        if (fail) throw new ApiError(409, 'login_taken', 'taken')
      },
    })

    await expect(store.getState().submit()).resolves.toBe('failed')
    expect(store.getState().failure).toMatchObject({ stage: 'register' })
    expect(store.getState().phase).toBe('editing')
    expect(store.getState().account?.password).toBe('secret-pass-1')

    fail = false
    await expect(store.getState().submit()).resolves.toBe('sent')
  })

  it('after a failed upload sends only the document again and never registers twice', async () => {
    let failUpload = true
    const { store, calls } = setup({
      upload: async () => {
        calls.push('upload')
        if (failUpload) throw new ApiError(500, 'internal', 'boom')
      },
    })

    await expect(store.getState().submit()).resolves.toBe('failed')
    expect(store.getState().phase).toBe('registered')
    expect(store.getState().failure).toMatchObject({ stage: 'upload' })

    failUpload = false
    await expect(store.getState().submit()).resolves.toBe('sent')
    expect(store.getState().phase).toBe('sent')

    expect(calls.filter((c) => c === 'register')).toHaveLength(1)
    expect(calls.filter((c) => c === 'upload')).toHaveLength(2)
  })

  it('a second press while the first is running is ignored and creates no second account', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { store, calls } = setup({
      register: async () => {
        calls.push('register')
        await gate
      },
    })

    const first = store.getState().submit()
    const second = await store.getState().submit()
    release()
    const firstResult = await first

    expect(second).toBe('busy')
    expect(firstResult).toBe('sent')
    expect(calls.filter((c) => c === 'register')).toHaveLength(1)
    expect(calls.filter((c) => c === 'upload')).toHaveLength(1)
  })

  it('presses after the application is sent do not register again', async () => {
    const { store, calls } = setup()
    await store.getState().submit()
    await store.getState().submit()

    expect(calls.filter((c) => c === 'register')).toHaveLength(1)
  })

  describe('a send that got no answer', () => {
    it('asks the server before it repeats, and does not send a duplicate that has arrived', async () => {
      let upload = 0
      const { store, calls } = setup({
        upload: async () => {
          calls.push('upload')
          upload += 1
          throw new NetworkError()
        },
        documentCount: async () => {
          calls.push('count')
          return 1 // the first send had reached the server
        },
      })

      await expect(store.getState().submit()).resolves.toBe('failed')
      expect(store.getState().failure).toEqual({ stage: 'upload', problem: 'offline' })

      await expect(store.getState().submit()).resolves.toBe('sent')

      expect(upload).toBe(1)
      expect(calls).toEqual(['register', 'upload', 'count'])
    })

    it('sends again when the server has no document', async () => {
      let first = true
      const { store, calls } = setup({
        upload: async () => {
          calls.push('upload')
          if (first) {
            first = false
            throw new NetworkError()
          }
        },
      })

      await store.getState().submit()
      await expect(store.getState().submit()).resolves.toBe('sent')

      expect(calls).toEqual(['register', 'upload', 'count', 'upload'])
    })

    it('does not ask the server after an answer that was a refusal', async () => {
      let first = true
      const { store, calls } = setup({
        upload: async () => {
          calls.push('upload')
          if (first) {
            first = false
            throw new ApiError(400, 'invalid_document', 'bad', [], 'too_large')
          }
        },
      })

      await store.getState().submit()
      await store.getState().submit()

      expect(calls).not.toContain('count')
    })
  })

  it('does not start without the data of both steps and the document', async () => {
    const { store, calls } = setup()
    store.getState().setDocument(null)

    await expect(store.getState().submit()).resolves.toBe('incomplete')
    expect(calls).toEqual([])
  })

  it('finish opens the app and forgets everything', async () => {
    const { store, calls } = setup()
    await store.getState().submit()

    store.getState().finish()

    expect(calls.at(-1)).toBe('release')
    expect(store.getState().account).toBeNull()
    expect(store.getState().document).toBeNull()
    expect(store.getState().phase).toBe('editing')
  })

  it('after finish a new application registers again', async () => {
    const { store, calls } = setup()
    await store.getState().submit()
    store.getState().finish()
    store.getState().setAccount(account)
    store.getState().setQualification(qualification)
    store.getState().setDocument(document)

    await store.getState().submit()

    expect(calls.filter((c) => c === 'register')).toHaveLength(2)
  })

  it('does not persist anything: the store has no storage', () => {
    const { store } = setup()
    // zustand's persist middleware adds .persist to the store; none is there
    expect('persist' in store).toBe(false)
  })
})
