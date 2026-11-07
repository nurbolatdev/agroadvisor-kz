import { createAgrochemistApi, UPLOAD_TIMEOUT_MS, uploadQuery } from './agrochemist'
import { createApiClient } from './client'

type Sent = { url: string; init: RequestInit | undefined }

function setup(response: Response = new Response('{}', { status: 201 })) {
  const sent: Sent[] = []
  const fetchFn = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), init })
    return response
  })
  const client = createApiClient({
    baseUrl: 'http://api',
    fetchFn: fetchFn as unknown as typeof fetch,
    getAccessToken: () => 'token',
    refreshAccessToken: async () => null,
  })
  return { api: createAgrochemistApi(client), sent }
}

const file = { uri: 'file:///cache/diploma.pdf', name: 'diploma.pdf', type: 'application/pdf' }

describe('uploadQuery', () => {
  it('sends the kind alone when nothing else is given', () => {
    expect(uploadQuery({ kind: 'diploma' })).toBe('kind=diploma')
  })

  it('encodes the free text and skips empty fields', () => {
    expect(
      uploadQuery({ kind: 'certificate', title: 'Агроном & co', issuer: '', year: 2019 }),
    ).toBe(`kind=certificate&title=${encodeURIComponent('Агроном & co')}&year=2019`)
  })
})

describe('agrochemist upload', () => {
  it('does not set Content-Type itself, so fetch adds the multipart boundary', async () => {
    const { api, sent } = setup()
    await api.upload(file, { kind: 'diploma' })

    const headers = new Headers(sent[0].init?.headers)
    expect(headers.get('Content-Type')).toBeNull()
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(sent[0].init?.body).toBeInstanceOf(FormData)
  })

  it('posts the file part to the documents path with the fields in the query', async () => {
    const { api, sent } = setup()
    await api.upload(file, { kind: 'diploma', title: 'Diploma', year: 2020 })

    expect(sent[0].url).toBe(
      'http://api/api/agrochemist/documents?kind=diploma&title=Diploma&year=2020',
    )
    expect(sent[0].init?.method).toBe('POST')
    const body = sent[0].init?.body as FormData
    expect(body.has('file')).toBe(true)
  })

  it('waits longer than the default timeout for the upload', async () => {
    jest.useFakeTimers()
    try {
      const fetchFn = jest.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      )
      const client = createApiClient({
        baseUrl: 'http://api',
        fetchFn: fetchFn as unknown as typeof fetch,
        getAccessToken: () => 'token',
        refreshAccessToken: async () => null,
      })
      const upload = createAgrochemistApi(client)
        .upload(file, { kind: 'diploma' })
        .catch((e: unknown) => e)

      await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1)
      let settled = false
      void upload.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(await upload).toBeInstanceOf(Error)
    } finally {
      jest.useRealTimers()
    }
  })

  it('has a longer timeout than the default 15 s of the client', () => {
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(15_000)
  })
})

describe('agrochemist remove and verification', () => {
  it('deletes a document by its id', async () => {
    const { api, sent } = setup(new Response(null, { status: 204 }))
    await api.remove('a b')
    expect(sent[0].url).toBe('http://api/api/agrochemist/documents/a%20b')
    expect(sent[0].init?.method).toBe('DELETE')
  })

  it('reads the state of the check', async () => {
    const { api, sent } = setup(
      new Response('{"status":"pending","documents":[]}', { status: 200 }),
    )
    await expect(api.verification()).resolves.toMatchObject({ status: 'pending' })
    expect(sent[0].url).toBe('http://api/api/agrochemist/verification')
  })
})
