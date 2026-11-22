import {
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_TEXT_MAX,
  FEED_CROPS_MAX,
  QUESTION_PHOTOS_MAX,
  QUESTION_TITLE_MAX,
  QUESTION_TITLE_MIN,
  REPORT_COMMENT_MAX,
} from '../community'
import type { Answer, CommunityApi, Question } from '../community'
import type { DiagnosisResult } from '../diagnosis'
import { ApiError } from '../errors'

type Viewer = { id: string; roles: string[]; regionId: number | null }

type Options = {
  // who the mock answers for; asked on every call, so a change of account is seen at once
  viewer: () => Viewer
  // what GET .../diagnosis answers for an attached diagnosis; an id it does not know is 400 diagnosis_not_found
  diagnosisOf?: (id: string) => DiagnosisResult | undefined
  delayMs?: number
  now?: () => number
}

type StoredQuestion = Omit<Question, 'mine' | 'answerCount' | 'status'> & {
  acceptedAnswerId: string | null
  diagnosisId: string | null
}
// `base` is the sum of the votes of other people; the votes of the viewer are kept apart
type StoredAnswer = Omit<Answer, 'mine' | 'myVote' | 'score' | 'accepted'> & { base: number }

const FARMER_ID = '00000000-0000-4000-8000-0000000000c1'
const EXPERT_ID = '00000000-0000-4000-8000-0000000000c2'
const WHEAT_ID = '00000000-0000-4000-d000-000000000001'
const TOMATO_ID = '00000000-0000-4000-d000-000000000002'
const BEST_ID = '00000000-0000-4000-e000-000000000001'
const REPLY_ID = '00000000-0000-4000-e000-000000000002'

// control characters other than a new line and a tab are refused, like on the backend
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const SUBSCRIPTIONS_MAX = 20
const HOUR = 3_600_000

const invalid = (field: string, message: string) =>
  new ApiError(400, 'validation_failed', 'Validation failed', [{ field, message }])
const questionNotFound = () => new ApiError(404, 'question_not_found', 'Question not found')
const answerNotFound = () => new ApiError(404, 'answer_not_found', 'Answer not found')

// Works without the backend: the same rules, statuses, cursors and errors as /api/community. The state lives
// in memory for the session; it starts with the two questions of screens 24 and 25.
export function createMockCommunityApi({
  viewer,
  diagnosisOf = () => undefined,
  delayMs = 400,
  now = Date.now,
}: Options): CommunityApi {
  const start = now()
  const questions: StoredQuestion[] = [
    {
      id: WHEAT_ID,
      authorId: FARMER_ID,
      authorName: 'Аскар Б.',
      authorExpert: false,
      cropCode: 'wheat',
      regionId: 1,
      districtId: null,
      title: 'Жёлтые пятна на листьях пшеницы',
      text: 'На краях листьев появились жёлтые пятна, за неделю их стало больше. Что это может быть?',
      photoUrls: [],
      diagnosisUrl: null,
      createdAt: new Date(start - 2 * HOUR).toISOString(),
      acceptedAnswerId: null,
      diagnosisId: null,
    },
    {
      id: TOMATO_ID,
      authorId: FARMER_ID,
      authorName: 'Аскар Б.',
      authorExpert: false,
      cropCode: 'tomato',
      regionId: 1,
      districtId: null,
      title: 'Коричневые пятна на томатах',
      text: 'На листьях томата коричневые пятна с жёлтой каймой, снизу белый налёт. Чем обработать?',
      photoUrls: [],
      diagnosisUrl: null,
      createdAt: new Date(start - 26 * HOUR).toISOString(),
      acceptedAnswerId: BEST_ID,
      diagnosisId: null,
    },
  ]
  const answers: StoredAnswer[] = [
    {
      id: BEST_ID,
      questionId: TOMATO_ID,
      authorId: EXPERT_ID,
      authorName: 'Агрохимик Серик',
      authorExpert: true,
      text: 'Похоже на фитофтороз. Уберите поражённые листья и обработайте посадки фунгицидом на основе меди.',
      createdAt: new Date(start - 24 * HOUR).toISOString(),
      base: 5,
    },
    {
      id: REPLY_ID,
      questionId: TOMATO_ID,
      authorId: FARMER_ID,
      authorName: 'Аскар Б.',
      authorExpert: false,
      text: 'Спасибо, попробую. Через сколько дней повторить обработку?',
      createdAt: new Date(start - 23 * HOUR).toISOString(),
      base: 1,
    },
  ]
  const votes = new Map<string, number>() // `${viewer id}:${answer id}` -> 1
  const subscriptions = new Map<string, string[]>() // by viewer id
  let tick = 0
  let counter = 0

  const wait = () =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  const stamp = () => new Date(now() + 1000 * (tick += 1)).toISOString()
  const nextId = (group: string) =>
    `00000000-0000-4000-${group}-${String((counter += 1)).padStart(12, '0')}`
  const myVote = (answerId: string) => votes.get(`${viewer().id}:${answerId}`) ?? 0

  const countOf = (id: string) => answers.filter((a) => a.questionId === id).length
  const questionOut = (q: StoredQuestion): Question => ({
    id: q.id,
    authorId: q.authorId,
    authorName: q.authorName,
    authorExpert: q.authorExpert,
    cropCode: q.cropCode,
    regionId: q.regionId,
    districtId: q.districtId,
    title: q.title,
    text: q.text,
    photoUrls: [...q.photoUrls],
    diagnosisUrl: q.diagnosisUrl,
    createdAt: q.createdAt,
    mine: q.authorId === viewer().id,
    answerCount: countOf(q.id),
    status: q.acceptedAnswerId ? 'solved' : 'open',
  })
  const answerOut = (a: StoredAnswer, accepted: string | null): Answer => ({
    id: a.id,
    questionId: a.questionId,
    authorId: a.authorId,
    authorName: a.authorName,
    authorExpert: a.authorExpert,
    text: a.text,
    createdAt: a.createdAt,
    mine: a.authorId === viewer().id,
    accepted: a.id === accepted,
    myVote: myVote(a.id),
    score: a.base + myVote(a.id),
  })

  const find = (id: string) => {
    const found = questions.find((q) => q.id === id)
    if (!found) throw questionNotFound()
    return found
  }
  const findAnswer = (id: string) => {
    const found = answers.find((a) => a.id === id)
    if (!found) throw answerNotFound()
    return found
  }
  const checkText = (raw: string, field: string) => {
    const text = raw.trim()
    if (text.length === 0 || raw.length > COMMUNITY_TEXT_MAX || CONTROL_CHARACTERS.test(raw)) {
      throw invalid(field, `size must be between 1 and ${COMMUNITY_TEXT_MAX}`)
    }
    return text
  }
  const requireAuthor = (question: StoredQuestion) => {
    if (question.authorId !== viewer().id) {
      throw new ApiError(403, 'not_question_author', 'Only the author may do this')
    }
  }
  const voteOut = (answer: StoredAnswer) => ({
    myVote: myVote(answer.id),
    score: answer.base + myVote(answer.id),
  })

  return {
    feed: async (query = {}) => {
      await wait()
      const crops = query.crop ?? []
      if (crops.length > FEED_CROPS_MAX) {
        throw invalid('crop', `at most ${FEED_CROPS_MAX} crops`)
      }
      const limit = Math.min(50, Math.max(1, query.limit ?? COMMUNITY_PAGE_SIZE))
      const newestFirst = [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      let older = newestFirst
      if (query.before !== undefined) {
        const at = newestFirst.findIndex((q) => q.id === query.before)
        if (at === -1) throw questionNotFound()
        older = newestFirst.slice(at + 1)
      }
      return older
        .map(questionOut)
        .filter(
          (q) =>
            (crops.length === 0 || crops.includes(q.cropCode)) &&
            (query.regionId === undefined || q.regionId === query.regionId) &&
            (query.status === undefined ||
              (query.status === 'unanswered' ? q.answerCount === 0 : q.status === query.status)) &&
            (!query.mine || q.mine),
        )
        .slice(0, limit)
    },
    question: async (id) => {
      await wait()
      return questionOut(find(id))
    },
    ask: async (body) => {
      await wait()
      const who = viewer()
      if (who.roles.includes('agrochemist')) {
        throw new ApiError(403, 'forbidden', 'Only a farmer may ask')
      }
      if (who.regionId === null) {
        throw new ApiError(400, 'region_required', 'Set a region in the profile first')
      }
      const title = body.title.trim()
      if (title.length < QUESTION_TITLE_MIN || title.length > QUESTION_TITLE_MAX) {
        throw invalid(
          'title',
          `size must be between ${QUESTION_TITLE_MIN} and ${QUESTION_TITLE_MAX}`,
        )
      }
      const text = checkText(body.text, 'text')
      if (body.photos.length > QUESTION_PHOTOS_MAX) {
        throw new ApiError(400, 'invalid_image', 'Too many photos')
      }
      let diagnosisUrl: string | null = null
      if (body.diagnosisId) {
        const diagnosis = diagnosisOf(body.diagnosisId)
        if (!diagnosis) throw new ApiError(400, 'diagnosis_not_found', 'Diagnosis not found')
        if (diagnosis.crop !== body.cropCode) {
          throw invalid('cropCode', 'the diagnosis is of another crop')
        }
      }
      const id = nextId('a100')
      if (body.diagnosisId) diagnosisUrl = `/api/community/questions/${id}/diagnosis`
      const stored: StoredQuestion = {
        id,
        authorId: who.id,
        authorName: 'Mock Farmer',
        authorExpert: false,
        cropCode: body.cropCode,
        regionId: who.regionId,
        districtId: null,
        title,
        text,
        photoUrls: body.photos.map((_, i) => `/api/community/questions/${id}/photos/${i + 1}`),
        diagnosisUrl,
        createdAt: stamp(),
        acceptedAnswerId: null,
        diagnosisId: body.diagnosisId ?? null,
      }
      questions.push(stored)
      return questionOut(stored)
    },
    answers: async (questionId) => {
      await wait()
      const question = find(questionId)
      return answers
        .filter((a) => a.questionId === questionId)
        .map((a) => answerOut(a, question.acceptedAnswerId))
        .sort(
          (a, b) =>
            Number(b.accepted) - Number(a.accepted) ||
            b.score - a.score ||
            a.createdAt.localeCompare(b.createdAt),
        )
    },
    answer: async (questionId, raw) => {
      await wait()
      const question = find(questionId)
      const text = checkText(raw, 'text')
      const who = viewer()
      const stored: StoredAnswer = {
        id: nextId('a200'),
        questionId,
        authorId: who.id,
        authorName: 'Mock User',
        authorExpert: who.roles.includes('agrochemist'),
        text,
        createdAt: stamp(),
        base: 0,
      }
      answers.push(stored)
      return answerOut(stored, question.acceptedAnswerId)
    },
    accept: async (questionId, answerId) => {
      await wait()
      const question = find(questionId)
      requireAuthor(question)
      const answer = findAnswer(answerId)
      if (answer.questionId !== questionId) throw answerNotFound()
      if (answer.authorId === viewer().id) {
        throw new ApiError(409, 'own_answer', 'Your own answer cannot be the best')
      }
      question.acceptedAnswerId = answerId
    },
    clearAccepted: async (questionId) => {
      await wait()
      const question = find(questionId)
      requireAuthor(question)
      question.acceptedAnswerId = null
    },
    vote: async (answerId) => {
      await wait()
      const answer = findAnswer(answerId)
      if (answer.authorId === viewer().id) {
        throw new ApiError(409, 'own_answer', 'Your own answer cannot be voted')
      }
      votes.set(`${viewer().id}:${answerId}`, 1)
      return voteOut(answer)
    },
    unvote: async (answerId) => {
      await wait()
      const answer = findAnswer(answerId)
      votes.delete(`${viewer().id}:${answerId}`)
      return voteOut(answer)
    },
    diagnosis: async (questionId) => {
      await wait()
      const question = find(questionId)
      const found = question.diagnosisId ? diagnosisOf(question.diagnosisId) : undefined
      if (!found) throw new ApiError(404, 'diagnosis_not_found', 'Diagnosis not found')
      return found
    },
    subscriptions: async () => {
      await wait()
      return { crops: [...(subscriptions.get(viewer().id) ?? [])] }
    },
    saveSubscriptions: async (crops) => {
      await wait()
      const unique = [...new Set(crops)]
      if (unique.length > SUBSCRIPTIONS_MAX) {
        throw invalid('crops', `at most ${SUBSCRIPTIONS_MAX} crops`)
      }
      subscriptions.set(viewer().id, unique)
      return { crops: [...unique] }
    },
    report: async (body) => {
      await wait()
      if ((body.comment ?? '').length > REPORT_COMMENT_MAX) {
        throw invalid('comment', `size must be at most ${REPORT_COMMENT_MAX}`)
      }
      const target =
        body.targetType === 'question'
          ? questions.find((q) => q.id === body.targetId)
          : answers.find((a) => a.id === body.targetId)
      if (!target) throw new ApiError(404, 'not_found', 'Nothing to report')
      if (target.authorId === viewer().id) {
        throw new ApiError(409, 'own_content', 'You cannot report your own content')
      }
    },
  }
}
