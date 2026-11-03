// Error body of the backend: RFC 9457 problem details plus a stable `code` and field `errors`.
export type FieldError = { field: string; message: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldError[]
  // Narrows the code, for example `blurry` for `low_quality`; absent when the backend sends none.
  readonly reason?: string
  // From the Retry-After header, in seconds, when the server sends one (for example with a 429).
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: FieldError[] = [],
    reason?: string,
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.reason = reason
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// No answer from the server at all (offline, timeout, wrong address).
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}
