/**
 * HTTP client of the admin web for the backend REST API. Pages never use it directly: they go through
 * `api` (services/api.ts), and the adapters built on this client map backend answers to the page types.
 * It throws only `ApiError` (the server answered), `NetworkError` (no usable answer) or, when the caller
 * cancels with its own signal, the abort error of that signal.
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
  /** Narrows the code, when the backend sends a reason; absent otherwise. */
  readonly reason?: string
  /** From the Retry-After header, in seconds, when the server sends one (a 429). */
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: FieldError[] = [],
    retryAfterSeconds?: number,
    reason?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.retryAfterSeconds = retryAfterSeconds
    this.reason = reason
  }
}

/** No usable answer from the server (offline, timeout, wrong address, blocked by CORS, broken stream). */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message)
    this.name = 'NetworkError'
  }
}

export type QueryValue = string | number | boolean | undefined | null

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Starts with `/` and has no query string; the query goes to `query`. */
  query?: Record<string, QueryValue>
  body?: unknown
  /** false for the endpoints that need no token (login, refresh). Default true. */
  auth?: boolean
  headers?: Record<string, string>
  timeoutMs?: number
  /** Cancels the call (a page that unmounts or changes its filter); the abort error reaches the caller. */
  signal?: AbortSignal
  /** `blob` for files (the document of an application needs the token, so a plain link would not work). */
  responseType?: 'json' | 'blob'
}

export interface HttpClientOptions {
  baseUrl: string
  getAccessToken: () => string | null
  /**
   * Returns a fresh access token, or null when the session is over. Concurrent calls must share one request:
   * the backend rotates refresh tokens, so a second use of the old one would end the session.
   */
  refreshAccessToken: () => Promise<string | null>
  /**
   * Called when a call still gets 401 after a refresh: the person has to sign in again. Several parallel
   * calls call it several times, so the handler must be idempotent.
   */
  onSessionExpired?: () => void
  getLanguage?: () => string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

interface ProblemBody {
  code?: string
  detail?: string
  reason?: string
  errors?: { field?: string; message?: string }[]
}

interface Exchange {
  response: Response
  /** The parsed JSON body, a Blob for `blob`, or undefined when empty. */
  payload: unknown
  /** The body of a successful answer was not JSON. */
  invalid: boolean
}

const DEFAULT_TIMEOUT_MS = 15_000

// Retry-After is a number of seconds or a date; only the number is used.
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  return Number(value.trim())
}

function toApiError({ response, payload }: Exchange): ApiError {
  const body = (typeof payload === 'object' && payload !== null && !(payload instanceof Blob)
    ? payload
    : {}) as ProblemBody
  const fieldErrors = (body.errors ?? []).map((e) => ({ field: e.field ?? '', message: e.message ?? '' }))
  return new ApiError(
    response.status,
    body.code ?? 'unknown',
    // over HTTP/2 the status text is empty
    body.detail ?? (response.statusText || `HTTP ${response.status}`),
    fieldErrors,
    parseRetryAfter(response.headers.get('Retry-After')),
    body.reason,
  )
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  if (!path.startsWith('/') || path.includes('?')) {
    throw new Error(`Request path must start with "/" and carry no query string: ${path}`)
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return `${baseUrl.replace(/\/+$/, '')}${path}${text ? `?${text}` : ''}`
}

async function readBody(response: Response, opts: RequestOptions): Promise<Pick<Exchange, 'payload' | 'invalid'>> {
  if (response.ok && opts.responseType === 'blob') {
    return { payload: await response.blob(), invalid: false }
  }
  const text = await response.text()
  if (text === '') return { payload: undefined, invalid: false }
  try {
    return { payload: JSON.parse(text) as unknown, invalid: false }
  } catch {
    // an error answer that is not JSON (a proxy page) falls back to the status; a successful one is invalid
    return { payload: undefined, invalid: response.ok }
  }
}

export function createHttpClient(options: HttpClientOptions) {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // The timeout covers the whole answer, the body included.
  async function send(path: string, opts: RequestOptions, token: string | null): Promise<Exchange> {
    const url = buildUrl(options.baseUrl, path, opts.query)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? defaultTimeout)
    const signal = opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal
    try {
      const response = await fetchFn(url, {
        method: opts.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.getLanguage ? { 'Accept-Language': options.getLanguage() } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal,
      })
      return { response, ...(await readBody(response, opts)) }
    } catch (error) {
      if (opts.signal?.aborted) throw error // the caller cancelled: not a network problem
      throw new NetworkError()
    } finally {
      clearTimeout(timer)
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const withAuth = opts.auth !== false
    const sentWith = withAuth ? options.getAccessToken() : null
    let exchange = await send(path, opts, sentWith)

    if (exchange.response.status === 401 && withAuth) {
      // Another request may have renewed the token while this one was in flight.
      const current = options.getAccessToken()
      const fresh = current && current !== sentWith ? current : await options.refreshAccessToken()
      if (fresh) exchange = await send(path, opts, fresh)
      if (exchange.response.status === 401) options.onSessionExpired?.()
    }

    if (!exchange.response.ok) throw toApiError(exchange)
    if (exchange.invalid) {
      throw new ApiError(exchange.response.status, 'invalid_response', 'The server answer is not valid JSON')
    }
    return exchange.payload as T
  }

  return { request }
}

export type HttpClient = ReturnType<typeof createHttpClient>
