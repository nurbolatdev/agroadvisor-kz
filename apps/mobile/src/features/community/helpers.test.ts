import { QUESTION_UPLOAD_MAX_BYTES } from '@/api/community'
import { ApiError, NetworkError } from '@/api/errors'

import {
  NO_FILTERS,
  agoLabel,
  communityProblemOf,
  communityPhotoSource,
  feedQuery,
  matchesSearch,
  thumbnailOf,
  validateQuestion,
} from './helpers'

const BASE = 'https://api.example.kz/'

describe('communityPhotoSource', () => {
  it('adds the token to a question photo and to the diagnosis photo', () => {
    expect(communityPhotoSource('/api/community/questions/q-1/photos/p-1', BASE, 'tok')).toEqual({
      uri: 'https://api.example.kz/api/community/questions/q-1/photos/p-1',
      headers: { Authorization: 'Bearer tok' },
    })
    expect(
      communityPhotoSource('/api/community/questions/q-1/diagnosis/photo', BASE, 'tok'),
    ).not.toBeNull()
  })

  it('refuses another host, a path with .. and an unknown path', () => {
    expect(
      communityPhotoSource('https://evil.example/api/community/questions/q/photos/1', BASE, 'tok'),
    ).toBeNull()
    expect(
      communityPhotoSource('/api/community/questions/../users/photos/1', BASE, 'tok'),
    ).toBeNull()
    expect(communityPhotoSource('/api/users/me/photo', BASE, 'tok')).toBeNull()
  })

  it('gives nothing without a token or a url', () => {
    expect(communityPhotoSource('/api/community/questions/q-1/photos/p-1', BASE, null)).toBeNull()
    expect(communityPhotoSource(null, BASE, 'tok')).toBeNull()
    expect(communityPhotoSource(undefined, BASE, 'tok')).toBeNull()
  })
})

describe('agoLabel', () => {
  const now = new Date('2026-11-22T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('counts minutes, at least one', () => {
    expect(agoLabel(ago(5 * 60_000), now, 'en')).toEqual({ kind: 'minutes', value: 5 })
    expect(agoLabel(ago(0), now, 'en')).toEqual({ kind: 'minutes', value: 1 })
  })

  it('counts hours within a day', () => {
    expect(agoLabel(ago(3 * 3_600_000), now, 'en')).toEqual({ kind: 'hours', value: 3 })
  })

  it('says yesterday for the previous day', () => {
    expect(
      agoLabel(new Date(2026, 10, 21, 8).toISOString(), new Date(2026, 10, 22, 18), 'en'),
    ).toEqual({
      kind: 'yesterday',
    })
  })

  it('gives the short date for older questions', () => {
    const label = agoLabel(
      new Date(2026, 10, 10, 8).toISOString(),
      new Date(2026, 10, 22, 18),
      'en',
    )
    expect(label.kind).toBe('date')
  })
})

describe('feedQuery', () => {
  it('sends no filter for the default chips', () => {
    expect(feedQuery(NO_FILTERS, ['wheat'], 3)).toEqual({})
  })

  it('"my crops" sends up to 4 subscribed MVP crops and drops the others', () => {
    const query = feedQuery(
      { ...NO_FILTERS, crop: 'mine' },
      ['barley', 'wheat', 'tomato', 'corn', 'potato', 'oats'],
      null,
    )
    expect(query.crop).toEqual(['wheat', 'tomato', 'corn', 'potato'])
  })

  it('"my crops" without subscriptions adds no crop', () => {
    expect(feedQuery({ ...NO_FILTERS, crop: 'mine' }, [], null)).toEqual({})
  })

  it('sends a chosen crop, the region, the status and mine', () => {
    expect(
      feedQuery({ crop: 'tomato', region: true, status: 'solved', mine: true }, [], 7),
    ).toEqual({ crop: ['tomato'], regionId: 7, status: 'solved', mine: true })
  })

  it('skips the region when the profile has none', () => {
    expect(feedQuery({ ...NO_FILTERS, region: true }, [], null)).toEqual({})
  })
})

describe('matchesSearch', () => {
  const question = { title: 'Жёлтые пятна на листьях', text: 'Пшеница, второй неделю' }

  it('matches the title and the text without case', () => {
    expect(matchesSearch(question, ' ПЯТНА ')).toBe(true)
    expect(matchesSearch(question, 'пшеница')).toBe(true)
  })

  it('matches everything for an empty text and nothing for a stranger', () => {
    expect(matchesSearch(question, '  ')).toBe(true)
    expect(matchesSearch(question, 'картофель')).toBe(false)
  })
})

describe('thumbnailOf', () => {
  it('takes the first photo, else the photo of the diagnosis, else nothing', () => {
    expect(thumbnailOf({ photoUrls: ['/a', '/b'], diagnosisUrl: '/q/diagnosis' })).toBe('/a')
    expect(thumbnailOf({ photoUrls: [], diagnosisUrl: '/q/diagnosis' })).toBe('/q/diagnosis/photo')
    expect(thumbnailOf({ photoUrls: [], diagnosisUrl: null })).toBeNull()
  })
})

describe('communityProblemOf', () => {
  const api = (status: number, code: string) => new ApiError(status, code, 'x')

  it('maps the codes of the contract', () => {
    expect(communityProblemOf(new NetworkError())).toBe('offline')
    expect(communityProblemOf(api(400, 'region_required'))).toBe('region_required')
    expect(communityProblemOf(api(400, 'invalid_image'))).toBe('invalid_image')
    expect(communityProblemOf(api(413, 'payload_too_large'))).toBe('payload_too_large')
    expect(communityProblemOf(api(413, 'unknown'))).toBe('payload_too_large')
    expect(communityProblemOf(api(429, 'rate_limited'))).toBe('rate_limited')
    expect(communityProblemOf(api(503, 'storage_unavailable'))).toBe('storage_unavailable')
    expect(communityProblemOf(api(404, 'question_not_found'))).toBe('not_found')
    expect(communityProblemOf(api(400, 'diagnosis_not_found'))).toBe('not_found')
    expect(communityProblemOf(api(409, 'complaint_resolved'))).toBe('complaint_resolved')
  })

  it('falls back to the status and then to server', () => {
    expect(communityProblemOf(api(429, 'unknown'))).toBe('rate_limited')
    expect(communityProblemOf(api(404, 'unknown'))).toBe('not_found')
    expect(communityProblemOf(api(500, 'unknown'))).toBe('server')
    expect(communityProblemOf(new Error('boom'))).toBe('server')
  })
})

describe('validateQuestion', () => {
  const draft = (title: string, text = 'text', photos: { size: number | null }[] = []) => ({
    title,
    text,
    photos,
  })

  it('checks the title length after trim: 2 / 3 / 120 / 121 characters', () => {
    expect(validateQuestion(draft('ab')).title).toBe('tooShort')
    expect(validateQuestion(draft(' abc ')).title).toBeUndefined()
    expect(validateQuestion(draft('a'.repeat(120))).title).toBeUndefined()
    expect(validateQuestion(draft('a'.repeat(121))).title).toBe('tooLong')
    expect(validateQuestion(draft('   ')).title).toBe('required')
  })

  it('checks the text: empty and over 2000', () => {
    expect(validateQuestion(draft('abc', '  ')).text).toBe('required')
    expect(validateQuestion(draft('abc', 'a'.repeat(2000))).text).toBeUndefined()
    expect(validateQuestion(draft('abc', 'a'.repeat(2001))).text).toBe('tooLong')
  })

  it('checks the number and the total size of the photos', () => {
    expect(
      validateQuestion(draft('abc', 'x', [{ size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }]))
        .photos,
    ).toBe('tooMany')
    expect(
      validateQuestion(draft('abc', 'x', [{ size: QUESTION_UPLOAD_MAX_BYTES }, { size: 1 }]))
        .photos,
    ).toBe('tooLarge')
    expect(
      validateQuestion(draft('abc', 'x', [{ size: QUESTION_UPLOAD_MAX_BYTES }, { size: null }]))
        .photos,
    ).toBeUndefined()
  })

  it('is clean for a good form', () => {
    expect(validateQuestion(draft('Title', 'Body', [{ size: 1000 }]))).toEqual({})
  })
})
