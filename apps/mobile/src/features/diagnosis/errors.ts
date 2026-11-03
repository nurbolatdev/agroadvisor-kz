import { ApiError, NetworkError } from '@/api/errors'

import { PhotoError } from './photo'

export type DiagnosisErrorKey =
  | 'diagnosis.errors.network'
  | 'diagnosis.errors.blurry'
  | 'diagnosis.errors.dark'
  | 'diagnosis.errors.tooSmall'
  | 'diagnosis.errors.lowQuality'
  | 'diagnosis.errors.invalidImage'
  | 'diagnosis.errors.unknownCrop'
  | 'diagnosis.errors.aiUnavailable'
  | 'diagnosis.errors.aiError'
  | 'diagnosis.errors.storage'
  | 'diagnosis.errors.rateLimited'
  | 'diagnosis.errors.keyReused'
  | 'diagnosis.errors.photoUnreadable'
  | 'diagnosis.errors.photoTooLarge'
  | 'diagnosis.errors.photoLost'
  | 'diagnosis.errors.generic'

export type DiagnosisFailure = {
  messageKey: DiagnosisErrorKey
  // retry: the same request again, with the same key and the same file (the cause is temporary);
  // newPhoto: sending it again would fail the same way, the farmer has to take or pick another photo.
  action: 'retry' | 'newPhoto'
  // when the server says how long to wait (Retry-After), in seconds
  retryAfterSeconds?: number
}

// The one rule for resending: only a temporary error is worth another try of the very same request.
// Temporary: no answer at all (offline, timeout), 408, 429 and 5xx (the AI service or the storage is
// down or busy: 502, 503, 504, also 500). Every other 4xx - an image the server refused, a payload
// that is too large, an unsupported type, a refused key, 401, 403, 422 - would be refused again.
export function isTemporary(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  return false
}

// What went wrong, in the app's own closed vocabulary. `code` and `reason` come from the server as free
// strings; here they are narrowed to the values the app has a text for. A reason the app does not know
// falls back to the text of its code.
export type LowQualityReason = 'blurry' | 'dark' | 'too_small'
export type KeyReusedReason = 'crop' | 'photo'

export type DiagnosisProblem =
  | { kind: 'network' }
  | { kind: 'lowQuality'; reason: LowQualityReason | null }
  | { kind: 'invalidImage' }
  | { kind: 'unknownCrop' }
  | { kind: 'keyReused'; reason: KeyReusedReason | null }
  | { kind: 'invalidKey' }
  | { kind: 'aiUnavailable' }
  | { kind: 'aiError' }
  | { kind: 'storage' }
  | { kind: 'rateLimited' }
  | { kind: 'photoUnreadable' }
  | { kind: 'photoTooLarge' }
  | { kind: 'photoLost' }
  | { kind: 'generic' }

const LOW_QUALITY_REASONS: readonly string[] = ['blurry', 'dark', 'too_small']
const KEY_REUSED_REASONS: readonly string[] = ['crop', 'photo']

function lowQualityReason(reason: string | undefined): LowQualityReason | null {
  return reason !== undefined && LOW_QUALITY_REASONS.includes(reason)
    ? (reason as LowQualityReason)
    : null
}

function keyReusedReason(reason: string | undefined): KeyReusedReason | null {
  return reason !== undefined && KEY_REUSED_REASONS.includes(reason)
    ? (reason as KeyReusedReason)
    : null
}

// The code says it best; a status stands in for a code the app does not know (a proxy in front of the
// backend may answer 413 or 415 without our body).
export function problemOf(error: unknown): DiagnosisProblem {
  if (error instanceof PhotoError) {
    return { kind: error.code === 'too_large' ? 'photoTooLarge' : 'photoUnreadable' }
  }
  if (error instanceof NetworkError) return { kind: 'network' }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'low_quality':
        return { kind: 'lowQuality', reason: lowQualityReason(error.reason) }
      case 'invalid_image':
        return { kind: 'invalidImage' }
      case 'unknown_crop':
        return { kind: 'unknownCrop' }
      case 'idempotency_key_reused':
        return { kind: 'keyReused', reason: keyReusedReason(error.reason) }
      case 'invalid_idempotency_key':
        return { kind: 'invalidKey' }
      case 'ai_unavailable':
        return { kind: 'aiUnavailable' }
      case 'ai_error':
        return { kind: 'aiError' }
      case 'storage_unavailable':
        return { kind: 'storage' }
      case 'rate_limited':
        return { kind: 'rateLimited' }
    }
    if (error.status === 413) return { kind: 'photoTooLarge' }
    if (error.status === 415) return { kind: 'invalidImage' }
  }
  return { kind: 'generic' }
}

// The text for a problem. Exhaustive: a new problem or reason without a text does not compile.
export function messageKeyOf(problem: DiagnosisProblem): DiagnosisErrorKey {
  switch (problem.kind) {
    case 'network':
      return 'diagnosis.errors.network'
    case 'lowQuality': {
      const reason = problem.reason
      switch (reason) {
        case 'blurry':
          return 'diagnosis.errors.blurry'
        case 'dark':
          return 'diagnosis.errors.dark'
        case 'too_small':
          return 'diagnosis.errors.tooSmall'
        case null:
          return 'diagnosis.errors.lowQuality'
        default:
          return assertNever(reason)
      }
    }
    case 'invalidImage':
      return 'diagnosis.errors.invalidImage'
    case 'unknownCrop':
      return 'diagnosis.errors.unknownCrop'
    case 'keyReused': {
      const reason = problem.reason
      switch (reason) {
        case 'crop':
        case 'photo':
        case null:
          return 'diagnosis.errors.keyReused'
        default:
          return assertNever(reason)
      }
    }
    case 'invalidKey':
      return 'diagnosis.errors.keyReused'
    case 'aiUnavailable':
      return 'diagnosis.errors.aiUnavailable'
    case 'aiError':
      return 'diagnosis.errors.aiError'
    case 'storage':
      return 'diagnosis.errors.storage'
    case 'rateLimited':
      return 'diagnosis.errors.rateLimited'
    case 'photoUnreadable':
      return 'diagnosis.errors.photoUnreadable'
    case 'photoTooLarge':
      return 'diagnosis.errors.photoTooLarge'
    case 'photoLost':
      return 'diagnosis.errors.photoLost'
    case 'generic':
      return 'diagnosis.errors.generic'
    default:
      return assertNever(problem)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`)
}

// Maps what went wrong to a message and to what the farmer can do next. Statuses such as unknown,
// crop_mismatch and low_confidence are answers (HTTP 201 with a status in the body), not errors, and
// never get here.
export function toDiagnosisFailure(error: unknown): DiagnosisFailure {
  const failure: DiagnosisFailure = {
    messageKey: messageKeyOf(problemOf(error)),
    action: isTemporary(error) ? 'retry' : 'newPhoto',
  }
  if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
    failure.retryAfterSeconds = error.retryAfterSeconds
  }
  return failure
}
