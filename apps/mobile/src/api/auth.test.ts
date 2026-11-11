import { REFRESH_FIRST_ATTEMPT_TIMEOUT_MS, createAuthApi } from './auth'
import type { ApiClient, RequestOptions } from './client'

function setup() {
  const calls: { path: string; opts: RequestOptions }[] = []
  const client = {
    request: jest.fn(async (path: string, opts: RequestOptions = {}) => {
      calls.push({ path, opts })
      return {}
    }),
  } as unknown as ApiClient
  return { api: createAuthApi(client), calls }
}

describe('auth api', () => {
  it('passes the timeout of a refresh attempt to the client', async () => {
    const { api, calls } = setup()

    await api.refresh('token', { timeoutMs: 1234 })

    expect(calls[0].path).toBe('/api/auth/refresh')
    expect(calls[0].opts.timeoutMs).toBe(1234)
  })

  it('leaves the timeout to the client when none is given (the retry of a refresh)', async () => {
    const { api, calls } = setup()

    await api.refresh('token')

    expect(calls[0].opts.timeoutMs).toBeUndefined()
  })

  it('keeps the first attempt well inside the server reuse window (10 s)', () => {
    // the retry has to start within the window: one timeout plus the time of the request to leave
    expect(REFRESH_FIRST_ATTEMPT_TIMEOUT_MS + 2_000).toBeLessThan(10_000)
  })
})
