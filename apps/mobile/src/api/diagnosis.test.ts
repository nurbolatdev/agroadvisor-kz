import { createPending } from '@/features/diagnosis/pending'

import type { ApiClient, RequestOptions } from './client'
import { DIAGNOSIS_TIMEOUT_MS, createDiagnosisApi } from './diagnosis'

type Part = { name: string; value: unknown }

// Node's FormData turns a React Native file part ({ uri, name, type }) into a string, so the parts
// are recorded as they are appended.
function recordingForm() {
  const parts: Part[] = []
  const form = { append: (name: string, value: unknown) => parts.push({ name, value }) }
  return { form: form as unknown as FormData, parts }
}

function setup() {
  const calls: { path: string; opts: RequestOptions }[] = []
  const client = {
    request: jest.fn(async (path: string, opts: RequestOptions = {}) => {
      calls.push({ path, opts })
      return { id: 'd1' }
    }),
  } as unknown as ApiClient
  const forms: Part[][] = []
  const api = createDiagnosisApi(client, () => {
    const { form, parts } = recordingForm()
    forms.push(parts)
    return form
  })
  return { api, calls, forms }
}

describe('diagnosis api', () => {
  it('posts the crop and the file with the idempotency key and a long timeout', async () => {
    const { api, calls, forms } = setup()
    const pending = createPending('potato', 'file:///leaf.jpg', { newKey: () => 'key-12345678' })

    await api.create(pending)

    expect(calls).toHaveLength(1)
    const { path, opts } = calls[0]
    expect(path).toBe('/api/diagnoses')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ 'Idempotency-Key': 'key-12345678' })
    expect(opts.timeoutMs).toBe(DIAGNOSIS_TIMEOUT_MS)
    expect(DIAGNOSIS_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000)
    expect(forms[0]).toEqual([
      { name: 'crop', value: 'potato' },
      { name: 'image', value: { uri: 'file:///leaf.jpg', name: 'leaf.jpg', type: 'image/jpeg' } },
    ])
  })

  it('asks for a page of the history with page and size', async () => {
    const { api, calls } = setup()

    await api.list(2, 20)

    expect(calls[0].path).toBe('/api/diagnoses?page=2&size=20')
    expect(calls[0].opts.method).toBeUndefined() // GET
  })

  it('keeps the page and the size inside what the server accepts', async () => {
    const { api, calls } = setup()

    await api.list(-3, 500)
    await api.list(0, 0)
    await api.list(1.9, 10.7)

    expect(calls.map((c) => c.path)).toEqual([
      '/api/diagnoses?page=0&size=100',
      '/api/diagnoses?page=0&size=1',
      '/api/diagnoses?page=1&size=10',
    ])
  })

  it('reads one diagnosis by its id, escaped', async () => {
    const { api, calls } = setup()

    await api.get('0b1f2c3d-0000-4000-8000-000000000000')
    await api.get('a/b?c')

    expect(calls.map((c) => c.path)).toEqual([
      '/api/diagnoses/0b1f2c3d-0000-4000-8000-000000000000',
      '/api/diagnoses/a%2Fb%3Fc',
    ])
  })

  it('sends the same key and the same file on every call with the same pending diagnosis', async () => {
    const { api, calls, forms } = setup()
    const pending = createPending('tomato', 'file:///a.jpg')

    await api.create(pending)
    await api.create(pending)

    expect(calls.map((c) => c.opts.headers?.['Idempotency-Key'])).toEqual([
      pending.key,
      pending.key,
    ])
    expect(forms.map((parts) => (parts[1].value as { uri: string }).uri)).toEqual([
      'file:///a.jpg',
      'file:///a.jpg',
    ])
  })
})
