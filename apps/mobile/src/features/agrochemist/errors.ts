import { ApiError, NetworkError } from '@/api/errors'

// What the person is told when sending or removing a document fails. One list for the problems found on
// the phone before the request and for the answers of the backend, so a screen shows one text for both.
export type UploadProblem =
  | 'empty'
  | 'too_large'
  | 'unsupported_format'
  | 'corrupted'
  | 'invalid_document' // the backend refuses the file and gives no known reason
  | 'invalid_fields'
  | 'limit'
  | 'already_approved'
  | 'not_found'
  | 'profile_missing'
  | 'storage_unavailable'
  | 'offline'
  | 'generic'

export type UploadProblemKey = `agrochemist.errors.${UploadProblem}`

export function problemKey(problem: UploadProblem): UploadProblemKey {
  return `agrochemist.errors.${problem}`
}

// The codes of the verification module of the backend (VerificationErrors) that the app can get from
// /api/agrochemist/*. The OpenAPI file does not list error codes, so the list is kept here. The switch
// below has no default branch: a code added to this list and not handled stops the build.
const KNOWN_CODES = [
  'invalid_document',
  'invalid_document_fields',
  'agrochemist_profile_missing',
  'agrochemist_already_approved',
  'document_limit_reached',
  'document_not_found',
  'storage_unavailable',
] as const

export type VerificationErrorCode = (typeof KNOWN_CODES)[number]

function isKnownCode(code: string): code is VerificationErrorCode {
  return (KNOWN_CODES as readonly string[]).includes(code)
}

function assertNever(value: never): never {
  throw new Error(`Unhandled verification error code: ${String(value)}`)
}

function invalidDocumentProblem(reason: string | undefined): UploadProblem {
  switch (reason) {
    case 'empty':
    case 'too_large':
    case 'unsupported_format':
    case 'corrupted':
      return reason
    default:
      return 'invalid_document'
  }
}

function knownProblem(code: VerificationErrorCode, reason: string | undefined): UploadProblem {
  switch (code) {
    case 'invalid_document':
      return invalidDocumentProblem(reason)
    case 'invalid_document_fields':
      return 'invalid_fields'
    case 'agrochemist_profile_missing':
      return 'profile_missing'
    case 'agrochemist_already_approved':
      return 'already_approved'
    case 'document_limit_reached':
      return 'limit'
    case 'document_not_found':
      return 'not_found'
    case 'storage_unavailable':
      return 'storage_unavailable'
    default:
      return assertNever(code)
  }
}

// A code of the backend (and its reason) to what the person is told; a code this app does not know gets
// the general text, never an empty screen.
export function mapApiError(code: string, reason?: string): UploadProblem {
  return isKnownCode(code) ? knownProblem(code, reason) : 'generic'
}

// Anything a call to /api/agrochemist/* can throw.
export function toUploadProblem(error: unknown): UploadProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    // a proxy or the server framework can refuse a too large body before the app code sees the file
    if (error.status === 413) return 'too_large'
    return mapApiError(error.code, error.reason)
  }
  return 'generic'
}
