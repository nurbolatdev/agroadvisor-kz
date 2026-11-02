import { createApiClient } from './client'
import { ApiError, NetworkError } from './errors'

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

function setup(responses: (Response | Error)[], token: string | null = 'old') {
  const calls: { url: string; auth: string | null }[] = []
  const fetchFn = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next as Response
  })
  const refreshAccessToken = jest.fn(async () => 'fresh' as string | null)
  const client = createApiClient({
    baseUrl: 'http://api',
    fetchFn: fetchFn as unknown as typeof fetch,
    getAccessToken: () => token,
    refreshAccessToken,
  })
  return { client, calls, refreshAccessToken }
}

describe('api client', () => {
  it('sends the access token and parses JSON', async () => {
    const { client, calls } = setup([json(200, { ok: true })])
    await expect(client.request('/api/x')).resolves.toEqual({ ok: true })
    expect(calls[0]).toEqual({ url: 'http://api/api/x', auth: 'Bearer old' })
  })

  it('does not send a token when auth is false', async () => {
    const { client, calls } = setup([json(200, {})])
    await client.request('/api/auth/login', { method: 'POST', body: {}, auth: false })
    expect(calls[0].auth).toBeNull()
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, calls, refreshAccessToken } = setup([json(401, {}), json(200, { n: 1 })])
    await expect(client.request('/api/x')).resolves.toEqual({ n: 1 })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(calls.map((c) => c.auth)).toEqual(['Bearer old', 'Bearer fresh'])
  })

  it('retries with the current token without a second refresh if it already changed', async () => {
    let token = 'old'
    const calls: (string | null)[] = []
    const fetchFn = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      if (calls.length === 1) {
        token = 'newer' // a parallel request renewed the token meanwhile
        return json(401, {})
      }
      return json(200, {})
    })
    const refreshAccessToken = jest.fn(async () => 'fresh' as string | null)
    const client = createApiClient({
      baseUrl: 'http://api',
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken: () => token,
      refreshAccessToken,
    })

    await client.request('/api/x')

    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(calls).toEqual(['Bearer old', 'Bearer newer'])
  })

  it('fails with the 401 when the session cannot be renewed', async () => {
    const { client, refreshAccessToken } = setup([json(401, { code: 'unauthorized' })])
    refreshAccessToken.mockResolvedValueOnce(null)
    await expect(client.request('/api/x')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    })
  })

  it('does not refresh when auth is false', async () => {
    const { client, refreshAccessToken } = setup([json(401, { code: 'invalid_credentials' })])
    await expect(client.request('/api/auth/login', { auth: false })).rejects.toMatchObject({
      code: 'invalid_credentials',
    })
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('maps problem details with field errors', async () => {
    const { client } = setup([
      json(400, {
        code: 'validation_failed',
        detail: 'Validation failed',
        errors: [{ field: 'password', message: 'size must be between 8 and 72' }],
      }),
    ])
    const error = await client.request('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).fieldErrors).toEqual([
      { field: 'password', message: 'size must be between 8 and 72' },
    ])
  })

  it('returns undefined for 204', async () => {
    const { client } = setup([json(204)])
    await expect(client.request('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('turns a failed fetch into NetworkError', async () => {
    const { client } = setup([new TypeError('Network request failed')])
    await expect(client.request('/api/x')).rejects.toBeInstanceOf(NetworkError)
  })

  it('falls back to code "unknown" for a non-JSON error body', async () => {
    const { client } = setup([new Response('<html>', { status: 502 })])
    await expect(client.request('/api/x')).rejects.toMatchObject({ status: 502, code: 'unknown' })
  })
})
