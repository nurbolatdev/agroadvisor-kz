/**
 * HTTP client of the admin web for the backend REST API. Pages never use it directly: they go through
 * `api` (services/api.ts), and the adapters built on this client map backend answers to the page types.
 */

export interface FieldError {
  field: string
  message: string
}

/** The backend answered with an error: RFC 9457 problem details plus a stable `code`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldError[]
  /** From the Retry-After header, in seconds, when the server sends one (a 429). */
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: FieldError[] = [],
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** No answer from the server at all (offline, timeout, wrong address, blocked by CORS). */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message)
    this.name = 'NetworkError'
  }
}

export type QueryValue = string | number | boolean | undefined | null

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  /** false for the endpoints that need no token (login, refresh). Default true. */
  auth?: boolean
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface HttpClientOptions {
  baseUrl: string
  getAccessToken: () => string | null
  /** Returns a fresh access token, or null when the session is over. Concurrent calls must share one request. */
  refreshAccessToken: () => Promise<string | null>
  /** Called when a call still gets 401 after a refresh: the person has to sign in again. */
  onSessionExpired?: () => void
  getLanguage?: () => string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

interface ProblemBody {
  code?: string
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
    // not JSON (a proxy page, an empty body): fall back to the status
  }
  const fieldErrors = (body.errors ?? []).map((e) => ({ field: e.field ?? '', message: e.message ?? '' }))
  return new ApiError(
    response.status,
    body.code ?? 'unknown',
    body.detail ?? response.statusText,
    fieldErrors,
    parseRetryAfter(response.headers.get('Retry-After')),
  )
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return `${baseUrl.replace(/\/+$/, '')}${path}${text ? `?${text}` : ''}`
}

export function createHttpClient(options: HttpClientOptions) {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? defaultTimeout)
    try {
      return await fetchFn(buildUrl(options.baseUrl, path, opts.query), {
        method: opts.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.getLanguage ? { 'Accept-Language': options.getLanguage() } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
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
    const sentWith = withAuth ? options.getAccessToken() : null
    let response = await send(path, opts, sentWith)

    if (response.status === 401 && withAuth) {
      // Another request may have renewed the token while this one was in flight.
      const current = options.getAccessToken()
      const fresh = current && current !== sentWith ? current : await options.refreshAccessToken()
      if (fresh) response = await send(path, opts, fresh)
      if (response.status === 401) options.onSessionExpired?.()
    }

    if (!response.ok) throw await toApiError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { request }
}

export type HttpClient = ReturnType<typeof createHttpClient>
