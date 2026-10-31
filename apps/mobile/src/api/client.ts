import { ApiError, NetworkError, type FieldError } from './errors'

export type ApiClientOptions = {
  baseUrl: string
  fetchFn?: typeof fetch
  getAccessToken: () => string | null
  // Returns a fresh access token or null when the session cannot be renewed.
  refreshAccessToken: () => Promise<string | null>
  timeoutMs?: number
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  // false for login, register and refresh: no token, no retry on 401
  auth?: boolean
}

type ProblemBody = {
  code?: string
  detail?: string
  errors?: { field?: string; message?: string }[]
}

const DEFAULT_TIMEOUT_MS = 15_000

async function toApiError(response: Response): Promise<ApiError> {
  let body: ProblemBody = {}
  try {
    body = (await response.json()) as ProblemBody
  } catch {
    // not JSON (proxy page, empty body): fall back to the status
  }
  const fieldErrors: FieldError[] = (body.errors ?? []).map((e) => ({
    field: e.field ?? '',
    message: e.message ?? '',
  }))
  return new ApiError(
    response.status,
    body.code ?? 'unknown',
    body.detail ?? response.statusText,
    fieldErrors,
  )
}

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchFn ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function send(path: string, opts: RequestOptions, token: string | null) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchFn(`${options.baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } catch {
      throw new NetworkError()
    } finally {
      clearTimeout(timer)
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const withAuth = opts.auth !== false
    let response = await send(path, opts, withAuth ? options.getAccessToken() : null)

    if (response.status === 401 && withAuth) {
      const fresh = await options.refreshAccessToken()
      if (fresh) response = await send(path, opts, fresh)
    }

    if (!response.ok) throw await toApiError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { request }
}

export type ApiClient = ReturnType<typeof createApiClient>
