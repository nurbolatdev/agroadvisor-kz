import { ApiError, NetworkError, type FieldError } from './errors'

export type ApiClientOptions = {
  baseUrl: string
  fetchFn?: typeof fetch
  getAccessToken: () => string | null
  // Returns a fresh access token or null when the session cannot be renewed.
  refreshAccessToken: () => Promise<string | null>
  timeoutMs?: number
  // The language of the app (ru, kk or en), read on every request and sent as Accept-Language: the backend
  // answers its own texts (errors, the catalog) in it. A header given with a request wins.
  getLanguage?: () => string
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  // multipart upload instead of a JSON body; the content type with its boundary is set by fetch
  formData?: FormData
  // extra request headers, for example Idempotency-Key
  headers?: Record<string, string>
  // overrides the client's timeout for slow calls such as a photo diagnosis
  timeoutMs?: number
  // false for login, register and refresh: no token, no retry on 401
  auth?: boolean
}

type ProblemBody = {
  code?: string
  reason?: string
  detail?: string
  errors?: { field?: string; message?: string }[]
}

const DEFAULT_TIMEOUT_MS = 15_000

// Retry-After is a number of seconds or a date; only the number is used.
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  return Number(value.trim())
}

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
    body.reason,
    parseRetryAfter(response.headers.get('Retry-After')),
  )
}

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchFn ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function send(path: string, opts: RequestOptions, token: string | null) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? timeoutMs)
    try {
      return await fetchFn(`${options.baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.getLanguage ? { 'Accept-Language': options.getLanguage() } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
        },
        body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
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
    const sentWith = withAuth ? options.getAccessToken() : null
    let response = await send(path, opts, sentWith)

    if (response.status === 401 && withAuth) {
      // Another request may have renewed the token while this one was in flight.
      const current = options.getAccessToken()
      const fresh = current && current !== sentWith ? current : await options.refreshAccessToken()
      if (fresh) response = await send(path, opts, fresh)
    }

    if (!response.ok) throw await toApiError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { request }
}

export type ApiClient = ReturnType<typeof createApiClient>
