import type { AgrochemistApi, VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'

import { createVerificationStore } from './verification'

function view(status: VerificationView['status'] = 'pending'): VerificationView {
  return {
    status,
    submittedAt: '2026-11-08T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: [],
    specializations: [],
    experienceYears: null,
  }
}

function setup() {
  const api = {
    verification: jest.fn<Promise<VerificationView>, []>(),
    upload: jest.fn(),
    remove: jest.fn(),
  }
  api.verification.mockResolvedValue(view())
  const store = createVerificationStore({ api: api as unknown as AgrochemistApi })
  return { api, store }
}

describe('the verification store', () => {
  it('asks the server once for everybody who asks for the first read (the gate and the screens)', async () => {
    const { api, store } = setup()

    await Promise.all([
      store.getState().ensure(),
      store.getState().ensure(),
      store.getState().ensure(),
    ])

    expect(api.verification).toHaveBeenCalledTimes(1)
    expect(store.getState().state).toMatchObject({ status: 'ready', view: { status: 'pending' } })
  })

  it('reads again on reload, and shows the new state to every subscriber', async () => {
    const { api, store } = setup()
    await store.getState().ensure()
    const seen: string[] = []
    store.subscribe((s) => {
      if (s.state.status === 'ready') seen.push(s.state.view.status)
    })
    api.verification.mockResolvedValue(view('approved'))

    await store.getState().reload()

    expect(api.verification).toHaveBeenCalledTimes(2)
    expect(seen).toEqual(['approved'])
  })

  it('does not ask again by itself after a failure: the person retries with reload', async () => {
    const { api, store } = setup()
    api.verification.mockRejectedValueOnce(new NetworkError())

    await store.getState().ensure()
    await store.getState().ensure()
    expect(store.getState().state).toEqual({ status: 'error', reason: 'offline' })
    expect(api.verification).toHaveBeenCalledTimes(1)

    await store.getState().reload()
    expect(store.getState().state.status).toBe('ready')
  })

  it('keeps what is shown when a later read fails', async () => {
    const { api, store } = setup()
    await store.getState().ensure()
    api.verification.mockRejectedValueOnce(new NetworkError())

    await store.getState().reload()

    expect(store.getState().state.status).toBe('ready')
  })

  it('a document sent on one screen shows on the others at once, with no extra announcement', async () => {
    const { api, store } = setup()
    await store.getState().ensure()
    api.upload.mockResolvedValue(undefined)
    api.verification.mockResolvedValue({ ...view(), documents: [{ id: 'd1' } as never] })

    const result = await store
      .getState()
      .upload({ uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' }, { kind: 'diploma' })

    expect(result).toEqual({ ok: true })
    expect(store.getState().state).toMatchObject({ view: { documents: [{ id: 'd1' }] } })
    expect(store.getState().uploading).toBe(false)
  })

  it('drops the answer of a read that was on its way when the user changed, and reads again afterwards', async () => {
    const { api, store } = setup()
    let release: (v: VerificationView) => void = () => {}
    api.verification.mockReturnValueOnce(
      new Promise<VerificationView>((resolve) => (release = resolve)),
    )
    const first = store.getState().ensure()

    store.getState().reset() // sign-out or another user
    release(view('approved')) // the answer of the previous user arrives late
    await first

    expect(store.getState().state).toEqual({ status: 'loading' })

    await store.getState().ensure() // the next user: the first read is made again
    expect(api.verification).toHaveBeenCalledTimes(2)
    expect(store.getState().state).toMatchObject({ status: 'ready', view: { status: 'pending' } })
  })

  it('a send that ends after the user changed reads nothing and does not touch the new user', async () => {
    const { api, store } = setup()
    await store.getState().ensure()
    const file = { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' }
    let finishOld: () => void = () => {}
    api.upload.mockReturnValueOnce(new Promise<void>((resolve) => (finishOld = resolve)))
    const oldSend = store.getState().upload(file, { kind: 'diploma' })
    expect(store.getState().uploading).toBe(true)

    store.getState().reset() // sign-out: the next person comes
    api.verification.mockClear()
    // the next person starts a send of their own
    let finishNew: () => void = () => {}
    api.upload.mockReturnValueOnce(new Promise<void>((resolve) => (finishNew = resolve)))
    const newSend = store.getState().upload(file, { kind: 'diploma' })
    expect(store.getState().uploading).toBe(true)

    finishOld() // the old send ends late
    await oldSend

    expect(api.verification).not.toHaveBeenCalled() // no read as the wrong person
    expect(store.getState().state).toEqual({ status: 'loading' }) // no error left in the new state
    expect(store.getState().uploading).toBe(true) // the new send is still protected
    expect(await store.getState().upload(file, { kind: 'diploma' })).toEqual({
      ok: false,
      problem: 'busy',
    })

    finishNew()
    expect(await newSend).toEqual({ ok: true })
    expect(store.getState().uploading).toBe(false)
  })

  it('refresh joins the read that is on its way and makes a new one otherwise', async () => {
    const { api, store } = setup()
    const first = store.getState().ensure() // the start of the app: the gate reads

    await Promise.all([store.getState().refresh(), first]) // the first focus of a tab joins it
    expect(api.verification).toHaveBeenCalledTimes(1)

    await store.getState().refresh() // a later focus reads again
    expect(api.verification).toHaveBeenCalledTimes(2)
  })
})
