import { ApiError, NetworkError } from '@/api/errors'

import { mapApiError, problemKey, toUploadProblem, type UploadProblem } from './errors'

describe('mapApiError', () => {
  it.each([
    ['empty', 'empty'],
    ['too_large', 'too_large'],
    ['unsupported_format', 'unsupported_format'],
    ['corrupted', 'corrupted'],
  ] as const)('invalid_document with the reason %s', (reason, expected) => {
    expect(mapApiError('invalid_document', reason)).toBe(expected)
  })

  it('invalid_document with no reason or an unknown one is the general refusal of the file', () => {
    expect(mapApiError('invalid_document')).toBe('invalid_document')
    expect(mapApiError('invalid_document', 'something_new')).toBe('invalid_document')
  })

  it.each<[string, UploadProblem]>([
    ['invalid_document_fields', 'invalid_fields'],
    ['agrochemist_profile_missing', 'profile_missing'],
    ['agrochemist_already_approved', 'already_approved'],
    ['document_limit_reached', 'limit'],
    ['document_not_found', 'not_found'],
    ['storage_unavailable', 'storage_unavailable'],
  ])('%s', (code, expected) => {
    expect(mapApiError(code)).toBe(expected)
  })

  it('gives the general text to a code it does not know', () => {
    expect(mapApiError('brand_new_code')).toBe('generic')
    expect(mapApiError('unknown')).toBe('generic')
  })
})

describe('toUploadProblem', () => {
  it('no answer from the server is offline', () => {
    expect(toUploadProblem(new NetworkError())).toBe('offline')
  })

  it('reads the code and the reason of an API error', () => {
    const error = new ApiError(400, 'invalid_document', 'bad', [], 'too_large')
    expect(toUploadProblem(error)).toBe('too_large')
  })

  it('a refused body size (413) is too large even with no known code', () => {
    expect(toUploadProblem(new ApiError(413, 'unknown', 'Payload Too Large'))).toBe('too_large')
  })

  it('anything else is the general text', () => {
    expect(toUploadProblem(new ApiError(500, 'unknown', 'oops'))).toBe('generic')
    expect(toUploadProblem(new Error('boom'))).toBe('generic')
    expect(toUploadProblem('text')).toBe('generic')
  })
})

describe('problemKey', () => {
  it('is the i18n key of the problem', () => {
    expect(problemKey('limit')).toBe('agrochemist.errors.limit')
  })
})
