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
