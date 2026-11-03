import { ApiError, NetworkError } from '@/api/errors'

import { toDiagnosisFailure } from './errors'
import { PhotoError } from './photo'

const api = (status: number, code: string, reason?: string) =>
  new ApiError(status, code, code, [], reason)

describe('toDiagnosisFailure', () => {
  it('asks to retry the same request when the server could not be reached', () => {
    expect(toDiagnosisFailure(new NetworkError())).toEqual({
      messageKey: 'diagnosis.errors.network',
      action: 'retry',
    })
  })

  it('tells why a photo of low quality was refused and asks for a new photo', () => {
    expect(toDiagnosisFailure(api(422, 'low_quality', 'blurry'))).toEqual({
      messageKey: 'diagnosis.errors.blurry',
      action: 'newPhoto',
    })
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

  it('asks for a new photo when the file is not an image or the key was reused', () => {
    expect(toDiagnosisFailure(api(400, 'invalid_image')).action).toBe('newPhoto')
    expect(toDiagnosisFailure(api(422, 'idempotency_key_reused', 'photo'))).toEqual({
      messageKey: 'diagnosis.errors.keyReused',
      action: 'newPhoto',
    })
  })

  it('lets the farmer retry when the server side is temporarily down or busy', () => {
    expect(toDiagnosisFailure(api(503, 'ai_unavailable'))).toEqual({
      messageKey: 'diagnosis.errors.aiUnavailable',
      action: 'retry',
    })
    expect(toDiagnosisFailure(api(502, 'ai_error')).action).toBe('retry')
    expect(toDiagnosisFailure(api(503, 'storage_unavailable')).messageKey).toBe(
      'diagnosis.errors.storage',
    )
    expect(toDiagnosisFailure(api(429, 'rate_limited')).messageKey).toBe(
      'diagnosis.errors.rateLimited',
    )
  })

  it('maps problems with the prepared file', () => {
    expect(toDiagnosisFailure(new PhotoError('too_large')).messageKey).toBe(
      'diagnosis.errors.photoTooLarge',
    )
    expect(toDiagnosisFailure(new PhotoError('metadata')).messageKey).toBe(
      'diagnosis.errors.photoMetadata',
    )
    expect(toDiagnosisFailure(new PhotoError('unreadable'))).toEqual({
      messageKey: 'diagnosis.errors.photoUnreadable',
      action: 'newPhoto',
    })
  })

  it('falls back to a generic message that can be retried', () => {
    expect(toDiagnosisFailure(api(500, 'internal_error'))).toEqual({
      messageKey: 'diagnosis.errors.generic',
      action: 'retry',
    })
    expect(toDiagnosisFailure(new Error('boom')).messageKey).toBe('diagnosis.errors.generic')
  })
})
