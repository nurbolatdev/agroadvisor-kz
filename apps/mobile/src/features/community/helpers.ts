import {
  COMMUNITY_TEXT_MAX,
  FEED_CROPS_MAX,
  QUESTION_PHOTOS_MAX,
  QUESTION_TITLE_MAX,
  QUESTION_TITLE_MIN,
  QUESTION_UPLOAD_MAX_BYTES,
  type FeedQuery,
  type FeedStatus,
  type Question,
} from '@/api/community'
import { ApiError, NetworkError } from '@/api/errors'
import { CROPS, type Crop } from '@/features/diagnosis/crops'

// The photos of a question and of its diagnosis are behind the access token, so they are fetched with an
// Authorization header, and only from the paths the backend documents: the token never goes to any other
// address, whatever the url says.
const COMMUNITY_PHOTO_PATH =
  /^\/api\/community\/questions\/[0-9A-Za-z-]+\/(photos\/[0-9A-Za-z-]+|diagnosis\/photo)$/

export function communityPhotoSource(
  url: string | null | undefined,
  baseUrl: string,
  accessToken: string | null,
): { uri: string; headers: Record<string, string> } | null {
  if (!url || accessToken === null || !COMMUNITY_PHOTO_PATH.test(url)) return null
  return {
    uri: `${baseUrl.replace(/\/+$/, '')}${url}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  }
}

export type AgoLabel =
  | { kind: 'minutes'; value: number }
  | { kind: 'hours'; value: number }
  | { kind: 'yesterday' }
  | { kind: 'date'; value: string }

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// "5 min ago" / "3 h ago" / "yesterday" / the short date, as the cards of the feed show the age.
export function agoLabel(iso: string, now: Date, language: string): AgoLabel {
  const date = new Date(iso)
  const elapsed = now.getTime() - date.getTime()
  if (elapsed < HOUR_MS)
    return { kind: 'minutes', value: Math.max(1, Math.floor(elapsed / MINUTE_MS)) }
  if (elapsed < DAY_MS) return { kind: 'hours', value: Math.floor(elapsed / HOUR_MS) }
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days <= 1) return { kind: 'yesterday' }
  return {
    kind: 'date',
    value: date.toLocaleDateString(language, { day: 'numeric', month: 'short' }),
  }
}

export type FeedFilters = {
  // 'mine' = the subscribed crops, a crop code = that crop, null = all crops
  crop: 'mine' | Crop | null
  // restrict to the region of the profile
  region: boolean
  status: FeedStatus | null
  // only the questions the caller asked
  mine: boolean
}

export const NO_FILTERS: FeedFilters = { crop: null, region: false, status: null, mine: false }

// The query of the feed for the chosen chips. "My crops" sends up to FEED_CROPS_MAX subscribed MVP crops
// (the backend takes no more); without subscriptions it adds no crop at all.
export function feedQuery(
  filters: FeedFilters,
  subscriptions: string[],
  regionId: number | null | undefined,
): FeedQuery {
  const query: FeedQuery = {}
  if (filters.crop === 'mine') {
    const crops = subscriptions
      .filter((code): code is Crop => (CROPS as readonly string[]).includes(code))
      .slice(0, FEED_CROPS_MAX)
    if (crops.length > 0) query.crop = crops
  } else if (filters.crop !== null) {
    query.crop = [filters.crop]
  }
  if (filters.region && regionId != null) query.regionId = regionId
  if (filters.status) query.status = filters.status
  if (filters.mine) query.mine = true
  return query
}

// The search of the feed runs over the questions already loaded: the backend has no text search yet.
export function matchesSearch(question: Pick<Question, 'title' | 'text'>, text: string): boolean {
  const needle = text.trim().toLocaleLowerCase()
  if (needle === '') return true
  return (
    question.title.toLocaleLowerCase().includes(needle) ||
    question.text.toLocaleLowerCase().includes(needle)
  )
}

// The picture of a card: the first photo of the question, else the photo of the attached diagnosis.
export function thumbnailOf(question: Pick<Question, 'photoUrls' | 'diagnosisUrl'>): string | null {
  if (question.photoUrls.length > 0) return question.photoUrls[0]
  return question.diagnosisUrl ? `${question.diagnosisUrl}/photo` : null
}

export type CommunityProblem =
  | 'offline'
  | 'region_required'
  | 'invalid_image'
  | 'payload_too_large'
  | 'rate_limited'
  | 'storage_unavailable'
  | 'not_found'
  | 'complaint_resolved'
  | 'server'

export function communityProblemOf(error: unknown): CommunityProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    if (error.status === 413) return 'payload_too_large'
    switch (error.code) {
      case 'region_required':
      case 'invalid_image':
      case 'payload_too_large':
      case 'rate_limited':
      case 'storage_unavailable':
      case 'complaint_resolved':
        return error.code
      case 'not_found':
      case 'question_not_found':
      case 'answer_not_found':
      case 'diagnosis_not_found':
        return 'not_found'
      default:
        if (error.status === 429) return 'rate_limited'
        if (error.status === 404) return 'not_found'
    }
  }
  return 'server'
}

export type QuestionDraft = {
  title: string
  text: string
  // the size of every chosen photo in bytes, null when unknown
  photos: { size: number | null }[]
}

export type QuestionErrors = {
  title?: 'required' | 'tooShort' | 'tooLong'
  text?: 'required' | 'tooLong'
  photos?: 'tooMany' | 'tooLarge'
}

// The rules of the backend, checked before the form goes out: a title of 3-120 and a text of 1-2000
// characters after trim, up to 3 photos, the whole form up to 11 MB.
export function validateQuestion(draft: QuestionDraft): QuestionErrors {
  const errors: QuestionErrors = {}
  const title = draft.title.trim()
  if (title.length === 0) errors.title = 'required'
  else if (title.length < QUESTION_TITLE_MIN) errors.title = 'tooShort'
  else if (title.length > QUESTION_TITLE_MAX) errors.title = 'tooLong'
  const text = draft.text.trim()
  if (text.length === 0) errors.text = 'required'
  else if (text.length > COMMUNITY_TEXT_MAX) errors.text = 'tooLong'
  if (draft.photos.length > QUESTION_PHOTOS_MAX) errors.photos = 'tooMany'
  else if (
    draft.photos.reduce((sum, photo) => sum + (photo.size ?? 0), 0) > QUESTION_UPLOAD_MAX_BYTES
  )
    errors.photos = 'tooLarge'
  return errors
}
