import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { AgrochemistApi, VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import { createMockAgrochemistApi } from '@/api/mock/agrochemist'

import { useVerification } from './useVerification'

const file = { uri: 'file:///cache/d.pdf', name: 'd.pdf', type: 'application/pdf' }

// renderHook of this version of the library is asynchronous
async function setup() {
  const { api, controls } = createMockAgrochemistApi({ delayMs: 0 })
  const { result } = await renderHook(() => useVerification(api))
  return { result, controls }
}

describe('useVerification', () => {
  it('loads the state of the check', async () => {
    const { result } = await setup()
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state).toMatchObject({ view: { status: 'pending', documents: [] } })
  })

  it('says offline when the first read gets no answer, and reads again on reload', async () => {
    const { api, controls } = createMockAgrochemistApi({ delayMs: 0 })
    controls.failNextRead()
    const { result } = await renderHook(() => useVerification(api))
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', reason: 'offline' }),
    )

    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.state.status).toBe('ready')
  })

  it('keeps what is shown when a later read fails', async () => {
    const { result, controls } = await setup()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    controls.failNextRead()
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.state.status).toBe('ready')
  })

  it('reads the state again after a document is sent', async () => {
    const { result, controls } = await setup()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    controls.setStatus('rejected', 'Not readable')

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.upload(file, { kind: 'diploma' })
    })

    expect(outcome).toEqual({ ok: true })
    expect(result.current.state).toMatchObject({
      view: { status: 'pending', rejectionReason: null, documents: [{ kind: 'diploma' }] },
    })
    expect(result.current.busy).toBe(false)
  })

  it('tells the problem of a failed upload and keeps the list', async () => {
    const { result, controls } = await setup()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    controls.failNextUpload('too_large')

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.upload(file, { kind: 'diploma' })
    })
    expect(outcome).toEqual({ ok: false, problem: 'too_large' })
  })

  it('reads the state again when the profile turns out to be approved', async () => {
    const { result, controls } = await setup()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    controls.setStatus('approved')

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.upload(file, { kind: 'diploma' })
    })
    expect(outcome).toEqual({ ok: false, problem: 'already_approved' })
    expect(result.current.state).toMatchObject({ view: { status: 'approved' } })
  })

  it('removes a document and reads the list again', async () => {
    const { result } = await setup()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => {
      await result.current.upload(file, { kind: 'diploma' })
    })
    const id =
      result.current.state.status === 'ready' ? result.current.state.view.documents[0].id : ''

    await act(async () => {
      await result.current.remove(id)
    })
    expect(result.current.state).toMatchObject({ view: { documents: [] } })
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function viewOf(status: VerificationView['status']): VerificationView {
  return {
    status,
    submittedAt: '2026-11-07T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: [],
  }
}

const document = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'diploma',
  contentType: 'application/pdf',
  sizeBytes: 1,
  uploadedAt: '2026-11-07T10:00:00Z',
} as const

describe('useVerification: concurrent calls', () => {
  it('tells that a send is on its way, and does not start a second one meanwhile', async () => {
    const first = deferred<typeof document>()
    const upload = jest.fn(() => first.promise)
    const api: AgrochemistApi = {
      verification: async () => viewOf('pending'),
      upload,
      remove: async () => undefined,
    }
    const { result } = await renderHook(() => useVerification(api))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.uploading).toBe(false)

    let firstOutcome: Promise<unknown> = Promise.resolve()
    await act(async () => {
      firstOutcome = result.current.upload(file, { kind: 'diploma' })
    })
    expect(result.current.uploading).toBe(true)
    expect(result.current.busy).toBe(true)

    let second: unknown
    await act(async () => {
      second = await result.current.upload(file, { kind: 'diploma' })
    })
    expect(second).toEqual({ ok: false, problem: 'busy' })
    expect(upload).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(document)
      await firstOutcome
    })
    expect(result.current.uploading).toBe(false)
  })

  it('does not start a removal while a send is on its way', async () => {
    const first = deferred<typeof document>()
    const remove = jest.fn(async () => undefined)
    const api: AgrochemistApi = {
      verification: async () => viewOf('pending'),
      upload: () => first.promise,
      remove,
    }
    const { result } = await renderHook(() => useVerification(api))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    let firstOutcome: Promise<unknown> = Promise.resolve()
    await act(async () => {
      firstOutcome = result.current.upload(file, { kind: 'diploma' })
    })
    let removal: unknown
    await act(async () => {
      removal = await result.current.remove('id')
    })
    expect(removal).toEqual({ ok: false, problem: 'busy' })
    expect(remove).not.toHaveBeenCalled()

    await act(async () => {
      first.resolve(document)
      await firstOutcome
    })
  })

  it('keeps the newer state when the answer to an older read comes last', async () => {
    const older = deferred<VerificationView>()
    const newer = deferred<VerificationView>()
    const verification = jest
      .fn<Promise<VerificationView>, []>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const api: AgrochemistApi = {
      verification,
      upload: async () => document,
      remove: async () => undefined,
    }
    const { result } = await renderHook(() => useVerification(api))
    await act(async () => {
      void result.current.reload()
    })
    expect(verification).toHaveBeenCalledTimes(2)

    await act(async () => newer.resolve(viewOf('approved')))
    expect(result.current.state).toMatchObject({ view: { status: 'approved' } })

    await act(async () => older.resolve(viewOf('pending')))
    expect(result.current.state).toMatchObject({ view: { status: 'approved' } })
  })

  it('sets nothing after the screen is gone', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const read = deferred<VerificationView>()
    const sent = deferred<typeof document>()
    const api: AgrochemistApi = {
      verification: () => read.promise,
      upload: () => sent.promise,
      remove: async () => undefined,
    }
    const { result, unmount } = await renderHook(() => useVerification(api))
    let outcome: Promise<unknown> = Promise.resolve()
    await act(async () => {
      outcome = result.current.upload(file, { kind: 'diploma' })
    })
    const before = result.current

    await unmount()
    await act(async () => {
      read.resolve(viewOf('pending'))
      sent.resolve(document)
      await outcome
    })

    expect(result.current).toBe(before)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('never repeats a send by itself, whatever the failure', async () => {
    const upload = jest.fn().mockRejectedValue(new NetworkError())
    const api: AgrochemistApi = {
      verification: async () => viewOf('pending'),
      upload,
      remove: async () => undefined,
    }
    const { result } = await renderHook(() => useVerification(api))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.upload(file, { kind: 'diploma' })
    })
    expect(outcome).toEqual({ ok: false, problem: 'offline' })
    expect(upload).toHaveBeenCalledTimes(1)
    // and a retry is the person's own action
    await act(async () => {
      await result.current.upload(file, { kind: 'diploma' })
    })
    expect(upload).toHaveBeenCalledTimes(2)
  })
})
