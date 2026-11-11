import { REFRESH_TIMEOUT_MS, createAuthApi } from './auth'
import type { ApiClient, RequestOptions } from './client'

describe('auth api', () => {
  it('refreshes with a short timeout so a retry still fits the server reuse window', async () => {
    const calls: { path: string; opts: RequestOptions }[] = []
    const client = {
      request: jest.fn(async (path: string, opts: RequestOptions = {}) => {
        calls.push({ path, opts })
        return {}
      }),
    } as unknown as ApiClient

    await createAuthApi(client).refresh('token')

    expect(calls[0].path).toBe('/api/auth/refresh')
    expect(calls[0].opts.timeoutMs).toBe(REFRESH_TIMEOUT_MS)
    // two attempts, each up to the timeout, must start within the backend window (10 s)
    expect(REFRESH_TIMEOUT_MS * 2).toBeLessThan(10_000)
  })
})
