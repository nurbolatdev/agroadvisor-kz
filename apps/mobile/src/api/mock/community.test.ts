import type { DiagnosisResult } from '../diagnosis'
import { ApiError } from '../errors'
import { createMockCommunityApi } from './community'

const FARMER = { id: '00000000-0000-4000-8000-0000000000f1', roles: ['farmer'], regionId: 3 }
const SERIK = '00000000-0000-4000-8000-0000000000c2'
const WHEAT = '00000000-0000-4000-d000-000000000001'
const TOMATO = '00000000-0000-4000-d000-000000000002'
const BEST = '00000000-0000-4000-e000-000000000001'
const REPLY = '00000000-0000-4000-e000-000000000002'

let viewer: { id: string; roles: string[]; regionId: number | null }

function setup(diagnosis?: DiagnosisResult) {
  viewer = { ...FARMER }
  return createMockCommunityApi({
    viewer: () => viewer,
    diagnosisOf: (id) => (diagnosis && diagnosis.id === id ? diagnosis : undefined),
    delayMs: 0,
    now: () => Date.parse('2026-11-22T10:00:00Z'),
  })
}

const draft = {
  title: 'Что с листьями?',
  text: 'Пятна на листьях.',
  cropCode: 'potato',
  photos: [],
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('the call did not fail')
}

describe('mock community: the feed', () => {
  it('starts with the two questions of the mocks, the newest first', async () => {
    const api = setup()
    const feed = await api.feed()
    expect(feed.map((q) => [q.id, q.status, q.answerCount])).toEqual([
      [WHEAT, 'open', 0],
      [TOMATO, 'solved', 2],
    ])
  })

  it('pages with the cursor without a duplicate or a gap', async () => {
    const api = setup()
    await api.ask({ ...draft, title: 'Первый вопрос' })
    await api.ask({ ...draft, title: 'Второй вопрос' })
    await api.ask({ ...draft, title: 'Третий вопрос' })
    const first = await api.feed({ limit: 2 })
    const second = await api.feed({ limit: 2, before: first[1].id })
    const third = await api.feed({ limit: 2, before: second[1].id })
    const ids = [...first, ...second, ...third].map((q) => q.id)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect(first[0].title).toBe('Третий вопрос')
    expect(third).toHaveLength(1)
  })

  it('refuses an unknown cursor with 404 question_not_found', async () => {
    const error = await failure(setup().feed({ before: 'nope' }))
    expect([error.status, error.code]).toEqual([404, 'question_not_found'])
  })

  it('filters by crop, region, status and mine', async () => {
    const api = setup()
    const mine = await api.ask(draft)
    expect((await api.feed({ crop: ['tomato'] })).map((q) => q.id)).toEqual([TOMATO])
    expect((await api.feed({ crop: ['tomato', 'wheat'] })).map((q) => q.id)).toEqual([
      WHEAT,
      TOMATO,
    ])
    expect((await api.feed({ regionId: 3 })).map((q) => q.id)).toEqual([mine.id])
    expect((await api.feed({ status: 'solved' })).map((q) => q.id)).toEqual([TOMATO])
    expect((await api.feed({ status: 'unanswered' })).map((q) => q.id)).toEqual([mine.id, WHEAT])
    expect((await api.feed({ mine: true })).map((q) => q.id)).toEqual([mine.id])
  })

  it('refuses more than four crops with 400 validation_failed', async () => {
    const error = await failure(setup().feed({ crop: ['a', 'b', 'c', 'd', 'e'] }))
    expect([error.status, error.code]).toEqual([400, 'validation_failed'])
  })
})

describe('mock community: asking', () => {
  it('stores the question of the viewer in the region of the profile', async () => {
    const api = setup()
    const asked = await api.ask({ ...draft, title: '  Что с листьями?  ' })
    expect(asked).toMatchObject({
      title: 'Что с листьями?',
      mine: true,
      regionId: 3,
      status: 'open',
      answerCount: 0,
      photoUrls: [],
    })
    await expect(api.question(asked.id)).resolves.toMatchObject({ id: asked.id })
  })

  it('refuses an agrochemist with 403 forbidden', async () => {
    const api = setup()
    viewer.roles = ['agrochemist']
    const error = await failure(api.ask(draft))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('refuses a profile without a region with 400 region_required', async () => {
    const api = setup()
    viewer.regionId = null
    const error = await failure(api.ask(draft))
    expect([error.status, error.code]).toEqual([400, 'region_required'])
  })

  it('refuses a short title, an empty text and a fourth photo', async () => {
    const api = setup()
    expect((await failure(api.ask({ ...draft, title: 'ab' }))).code).toBe('validation_failed')
    expect((await failure(api.ask({ ...draft, text: '   ' }))).code).toBe('validation_failed')
    const photo = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }
    const error = await failure(api.ask({ ...draft, photos: [photo, photo, photo, photo] }))
    expect([error.status, error.code]).toEqual([400, 'invalid_image'])
  })

  it('attaches a known diagnosis of the same crop and answers it on request', async () => {
    const diagnosis = { id: 'diag-1', crop: 'potato' } as DiagnosisResult
    const api = setup(diagnosis)
    const asked = await api.ask({ ...draft, diagnosisId: 'diag-1' })
    expect(asked.diagnosisUrl).toBe(`/api/community/questions/${asked.id}/diagnosis`)
    await expect(api.diagnosis(asked.id)).resolves.toBe(diagnosis)
    expect((await failure(api.diagnosis(WHEAT))).code).toBe('diagnosis_not_found')
    const unknown = await failure(api.ask({ ...draft, diagnosisId: 'other' }))
    expect([unknown.status, unknown.code]).toEqual([404, 'diagnosis_not_found'])
    expect(
      (await failure(api.ask({ ...draft, cropCode: 'tomato', diagnosisId: 'diag-1' }))).code,
    ).toBe('validation_failed')
  })
})

describe('mock community: answers, votes and the best answer', () => {
  it('lists the accepted answer first and adds a new one', async () => {
    const api = setup()
    expect((await api.answers(TOMATO)).map((a) => [a.id, a.accepted])).toEqual([
      [BEST, true],
      [REPLY, false],
    ])
    const added = await api.answer(WHEAT, '  Это ржавчина  ')
    expect(added).toMatchObject({ text: 'Это ржавчина', mine: true, accepted: false, score: 0 })
    expect((await api.question(WHEAT)).answerCount).toBe(1)
    expect((await failure(api.answer(WHEAT, ' '))).code).toBe('validation_failed')
    expect((await failure(api.answer('nope', 'text'))).code).toBe('question_not_found')
  })

  it('replaces a repeated vote and clears it', async () => {
    const api = setup()
    expect(await api.vote(REPLY)).toEqual({ myVote: 1, score: 2 })
    expect(await api.vote(REPLY)).toEqual({ myVote: 1, score: 2 })
    expect((await api.answers(TOMATO)).find((a) => a.id === REPLY)).toMatchObject({
      myVote: 1,
      score: 2,
    })
    expect(await api.unvote(REPLY)).toEqual({ myVote: 0, score: 1 })
    expect((await failure(api.vote('nope'))).code).toBe('answer_not_found')
  })

  it('refuses a vote and a report on the own answer or question', async () => {
    const api = setup()
    const asked = await api.ask(draft)
    const own = await api.answer(asked.id, 'Сам отвечу')
    const vote = await failure(api.vote(own.id))
    expect([vote.status, vote.code]).toEqual([409, 'own_answer'])
    const report = await failure(
      api.report({ targetType: 'answer', targetId: own.id, reason: 'spam' }),
    )
    expect([report.status, report.code]).toEqual([409, 'own_content'])
    const own2 = await failure(
      api.report({ targetType: 'question', targetId: asked.id, reason: 'spam' }),
    )
    expect(own2.code).toBe('own_content')
  })

  it('accepts an answer, which makes the question solved, and clears it', async () => {
    const api = setup()
    const asked = await api.ask(draft)
    const reply = await api.answer(asked.id, 'ответ')
    viewer.id = SERIK
    const other = await api.answer(asked.id, 'ещё ответ')
    expect(other.mine).toBe(true)
    viewer = { ...FARMER }
    await api.accept(asked.id, other.id)
    expect((await api.question(asked.id)).status).toBe('solved')
    expect((await api.answers(asked.id))[0].id).toBe(other.id)
    await api.clearAccepted(asked.id)
    expect((await api.question(asked.id)).status).toBe('open')
    expect(reply.id).not.toBe(other.id)
  })

  it('refuses the best answer to a stranger and on the own answer', async () => {
    const api = setup()
    const stranger = await failure(api.accept(TOMATO, REPLY))
    expect([stranger.status, stranger.code]).toEqual([403, 'not_question_author'])
    expect((await failure(api.clearAccepted(TOMATO))).code).toBe('not_question_author')

    const asked = await api.ask(draft)
    const own = await api.answer(asked.id, 'свой')
    const error = await failure(api.accept(asked.id, own.id))
    expect([error.status, error.code]).toEqual([409, 'own_answer'])
    expect((await failure(api.accept(asked.id, REPLY))).code).toBe('answer_not_found')
  })

  it('reports another person content and answers 404 for a missing one', async () => {
    const api = setup()
    await expect(
      api.report({ targetType: 'question', targetId: WHEAT, reason: 'ads', comment: 'реклама' }),
    ).resolves.toBeUndefined()
    const missing = await failure(
      api.report({ targetType: 'answer', targetId: 'nope', reason: 'ads' }),
    )
    expect([missing.status, missing.code]).toEqual([404, 'answer_not_found'])
    const noQuestion = await failure(
      api.report({ targetType: 'question', targetId: 'nope', reason: 'ads' }),
    )
    expect([noQuestion.status, noQuestion.code]).toEqual([404, 'question_not_found'])
  })
})

describe('mock community: subscriptions', () => {
  it('keeps the set of crops of the viewer without a repeat', async () => {
    const api = setup()
    expect(await api.subscriptions()).toEqual({ crops: [] })
    expect(await api.saveSubscriptions(['wheat', 'tomato', 'wheat'])).toEqual({
      crops: ['wheat', 'tomato'],
    })
    expect(await api.subscriptions()).toEqual({ crops: ['wheat', 'tomato'] })
  })

  it('refuses more than 20 crops with 400 validation_failed', async () => {
    const api = setup()
    const many = Array.from({ length: 21 }, (_, i) => `crop-${i}`)
    expect((await failure(api.saveSubscriptions(many))).code).toBe('validation_failed')
  })
})
