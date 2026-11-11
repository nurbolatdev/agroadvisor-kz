import { describe, expect, it, vi } from 'vitest'

import { ApiError, NetworkError, createHttpClient } from './http'

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function setup(responses: (Response | Error)[], over: { token?: string | null; refreshed?: string | null } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  const queue = [...responses]
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next ?? json(500)
  }) as unknown as typeof fetch
  let token = over.token === undefined ? 'old' : over.token
  const refresh = vi.fn(async () => {
    token = over.refreshed === undefined ? 'new' : over.refreshed
    return token
  })
  const expired = vi.fn()
  const client = createHttpClient({
    baseUrl: 'http://api.test/',
    getAccessToken: () => token,
    refreshAccessToken: refresh,
    onSessionExpired: expired,
    getLanguage: () => 'kk',
    fetchFn,
  })
  return { client, calls, refresh, expired }
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name]

describe('http client', () => {
  it('sends the token, the language and the query without empty values', async () => {
    const { client, calls } = setup([json(200, { ok: true })])

    const result = await client.request('/api/admin/agrochemists', {
      query: { status: 'pending', page: 0, size: undefined, q: '' },
    })

    expect(result).toEqual({ ok: true })
    expect(calls[0].url).toBe('http://api.test/api/admin/agrochemists?status=pending&page=0')
    expect(header(calls[0].init, 'Authorization')).toBe('Bearer old')
    expect(header(calls[0].init, 'Accept-Language')).toBe('kk')
  })

  it('sends a JSON body and no token for a public call', async () => {
    const { client, calls } = setup([json(200, {})])

    await client.request('/api/auth/login', { method: 'POST', body: { login: 'a' }, auth: false })

    expect(header(calls[0].init, 'Content-Type')).toBe('application/json')
    expect(header(calls[0].init, 'Authorization')).toBeUndefined()
    expect(calls[0].init.body).toBe('{"login":"a"}')
  })

  it('refreshes the token once on 401 and repeats the call', async () => {
    const { client, calls, refresh, expired } = setup([json(401, { code: 'unauthorized' }), json(200, { n: 1 })])

    expect(await client.request('/x')).toEqual({ n: 1 })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(header(calls[1].init, 'Authorization')).toBe('Bearer new')
    expect(expired).not.toHaveBeenCalled()
  })

  it('reports an expired session when the refresh gives nothing', async () => {
    const { client, expired } = setup([json(401, { code: 'unauthorized', detail: 'no' })], { refreshed: null })

    await expect(client.request('/x')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })

    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('reports an expired session when the repeated call is still refused', async () => {
    const { client, expired } = setup([json(401, {}), json(401, {})])

    await expect(client.request('/x')).rejects.toBeInstanceOf(ApiError)

    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for a public call', async () => {
    const { client, refresh } = setup([json(401, { code: 'invalid_credentials' })])

    await expect(client.request('/api/auth/login', { auth: false })).rejects.toMatchObject({
      code: 'invalid_credentials',
    })

    expect(refresh).not.toHaveBeenCalled()
  })

  it('turns a problem body into an ApiError with field errors and Retry-After', async () => {
    const { client } = setup([
      json(429, { code: 'rate_limited', detail: 'slow down', errors: [{ field: 'login', message: 'bad' }] }, {
        'Retry-After': '30',
      }),
    ])

    const error = await client.request('/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'slow down',
      fieldErrors: [{ field: 'login', message: 'bad' }],
      retryAfterSeconds: 30,
    })
  })

  it('falls back to the status text when the error body is not JSON', async () => {
    const { client } = setup([new Response('<html>', { status: 502, statusText: 'Bad Gateway' })])

    await expect(client.request('/x')).rejects.toMatchObject({ status: 502, code: 'unknown', message: 'Bad Gateway' })
  })

  it('returns undefined for 204', async () => {
    const { client } = setup([new Response(null, { status: 204 })])

    expect(await client.request('/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('turns a failed fetch into a NetworkError', async () => {
    const { client } = setup([new TypeError('failed')])

    await expect(client.request('/x')).rejects.toBeInstanceOf(NetworkError)
  })
})
