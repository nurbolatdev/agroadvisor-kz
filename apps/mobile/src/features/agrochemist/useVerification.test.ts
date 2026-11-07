import { act, renderHook, waitFor } from '@testing-library/react-native'

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
