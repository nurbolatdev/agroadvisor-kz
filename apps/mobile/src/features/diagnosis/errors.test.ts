import { ApiError, NetworkError } from '@/api/errors'

import { isTemporary, toDiagnosisFailure } from './errors'
import { PhotoError } from './photo'

const api = (status: number, code: string, reason?: string, retryAfter?: number) =>
  new ApiError(status, code, code, [], reason, retryAfter)

describe('which errors are worth a resend', () => {
  const temporary: [string, unknown][] = [
    ['no answer (offline, timeout)', new NetworkError()],
    ['408 request timeout', api(408, 'unknown')],
    ['429 too many requests', api(429, 'rate_limited')],
    ['500 internal error', api(500, 'internal_error')],
    ['502 ai_error', api(502, 'ai_error')],
    ['503 ai_unavailable', api(503, 'ai_unavailable')],
    ['503 storage_unavailable', api(503, 'storage_unavailable')],
    ['504 from a proxy without our body', api(504, 'unknown')],
  ]
  const permanent: [string, unknown][] = [
    ['400 invalid_image', api(400, 'invalid_image')],
    ['400 unknown_crop', api(400, 'unknown_crop')],
    ['400 invalid_idempotency_key', api(400, 'invalid_idempotency_key')],
    ['401', api(401, 'unauthorized')],
    ['403', api(403, 'forbidden')],
    ['413 payload_too_large', api(413, 'payload_too_large')],
    ['415 unsupported_media_type', api(415, 'unsupported_media_type')],
    ['422 low_quality', api(422, 'low_quality', 'blurry')],
    ['422 idempotency_key_reused', api(422, 'idempotency_key_reused', 'photo')],
    ['a 4xx the app does not know', api(418, 'teapot')],
    ['a problem with the prepared file', new PhotoError('unreadable')],
    ['an unexpected exception', new Error('boom')],
  ]

  it.each(temporary)('resends after: %s', (_name, error) => {
    expect(isTemporary(error)).toBe(true)
    expect(toDiagnosisFailure(error).action).toBe('retry')
  })

  it.each(permanent)('does not resend after: %s', (_name, error) => {
    expect(isTemporary(error)).toBe(false)
    expect(toDiagnosisFailure(error).action).toBe('newPhoto')
  })
})

describe('toDiagnosisFailure', () => {
  it('tells why a photo of low quality was refused', () => {
    expect(toDiagnosisFailure(api(422, 'low_quality', 'blurry')).messageKey).toBe(
      'diagnosis.errors.blurry',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'dark')).messageKey).toBe(
      'diagnosis.errors.dark',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'too_small')).messageKey).toBe(
      'diagnosis.errors.tooSmall',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'something_new')).messageKey).toBe(
      'diagnosis.errors.lowQuality',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality')).messageKey).toBe(
      'diagnosis.errors.lowQuality',
    )
  })

  it('names the cause of the other refusals and failures', () => {
    const key = (status: number, code: string) => toDiagnosisFailure(api(status, code)).messageKey
    expect(key(400, 'invalid_image')).toBe('diagnosis.errors.invalidImage')
    expect(key(400, 'unknown_crop')).toBe('diagnosis.errors.unknownCrop')
    expect(key(422, 'idempotency_key_reused')).toBe('diagnosis.errors.keyReused')
    expect(key(400, 'invalid_idempotency_key')).toBe('diagnosis.errors.keyReused')
    expect(key(503, 'ai_unavailable')).toBe('diagnosis.errors.aiUnavailable')
    expect(key(502, 'ai_error')).toBe('diagnosis.errors.aiError')
    expect(key(503, 'storage_unavailable')).toBe('diagnosis.errors.storage')
    expect(key(429, 'rate_limited')).toBe('diagnosis.errors.rateLimited')
    expect(toDiagnosisFailure(new NetworkError()).messageKey).toBe('diagnosis.errors.network')
  })

  it('uses the status for a code the app does not know', () => {
    expect(toDiagnosisFailure(api(413, 'payload_too_large')).messageKey).toBe(
      'diagnosis.errors.photoTooLarge',
    )
    expect(toDiagnosisFailure(api(415, 'unsupported_media_type')).messageKey).toBe(
      'diagnosis.errors.invalidImage',
    )
    expect(toDiagnosisFailure(api(500, 'internal_error')).messageKey).toBe(
      'diagnosis.errors.generic',
    )
  })

  it('maps problems with the prepared file', () => {
    expect(toDiagnosisFailure(new PhotoError('too_large')).messageKey).toBe(
      'diagnosis.errors.photoTooLarge',
    )
    expect(toDiagnosisFailure(new PhotoError('unreadable')).messageKey).toBe(
      'diagnosis.errors.photoUnreadable',
    )
  })

  it('passes on how long to wait when the server says it', () => {
    expect(toDiagnosisFailure(api(429, 'rate_limited', undefined, 30))).toEqual({
      messageKey: 'diagnosis.errors.rateLimited',
      action: 'retry',
      retryAfterSeconds: 30,
    })
    expect(toDiagnosisFailure(api(429, 'rate_limited'))).toEqual({
      messageKey: 'diagnosis.errors.rateLimited',
      action: 'retry',
    })
  })
})
