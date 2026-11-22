import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { Answer, Question } from '@/api/community'
import { ApiError } from '@/api/errors'

import { useQuestion } from './useQuestion'

const mockApi = {
  question: jest.fn(),
  answers: jest.fn(),
  answer: jest.fn(),
  accept: jest.fn(),
  clearAccepted: jest.fn(),
  vote: jest.fn(),
  unvote: jest.fn(),
  diagnosis: jest.fn(),
}

jest.mock('@/services', () => ({
  communityApi: {
    question: (...a: unknown[]) => mockApi.question(...a),
    answers: (...a: unknown[]) => mockApi.answers(...a),
    answer: (...a: unknown[]) => mockApi.answer(...a),
    accept: (...a: unknown[]) => mockApi.accept(...a),
    clearAccepted: (...a: unknown[]) => mockApi.clearAccepted(...a),
    vote: (...a: unknown[]) => mockApi.vote(...a),
    unvote: (...a: unknown[]) => mockApi.unvote(...a),
    diagnosis: (...a: unknown[]) => mockApi.diagnosis(...a),
  },
}))

const question = (extra: Partial<Question> = {}): Question =>
  ({ id: 'q1', title: 'T', status: 'open', answerCount: 1, mine: true, ...extra }) as Question

const answer = (id: string, extra: Partial<Answer> = {}): Answer =>
  ({ id, text: 'a', score: 2, myVote: 0, mine: false, accepted: false, ...extra }) as Answer

const ready = async (q = question(), answers = [answer('a1')]) => {
  mockApi.question.mockResolvedValue(q)
  mockApi.answers.mockResolvedValue(answers)
  const hook = await renderHook(() => useQuestion('q1'))
  await act(async () => hook.result.current.reload())
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
  return hook
}

const answersOf = (state: ReturnType<typeof useQuestion>['state']) =>
  state.status === 'ready' ? state.answers : []

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useQuestion', () => {
  it('reads the question with its answers and no diagnosis when none is attached', async () => {
    const { result } = await ready()
    expect(result.current.state).toMatchObject({ status: 'ready', diagnosis: null })
    expect(mockApi.diagnosis).not.toHaveBeenCalled()
  })

  it('reads the diagnosis when the question has one, and goes on when it is gone', async () => {
    mockApi.diagnosis.mockResolvedValueOnce({ id: 'd1' })
    const first = await ready(question({ diagnosisUrl: '/d' }))
    expect(first.result.current.state).toMatchObject({ diagnosis: { id: 'd1' } })

    mockApi.diagnosis.mockRejectedValueOnce(new ApiError(404, 'diagnosis_not_found', 'none'))
    const second = await ready(question({ diagnosisUrl: '/d' }))
    expect(second.result.current.state).toMatchObject({ status: 'ready', diagnosis: null })
  })

  it('reports a missing question', async () => {
    mockApi.question.mockRejectedValue(new ApiError(404, 'question_not_found', 'gone'))
    mockApi.answers.mockRejectedValue(new ApiError(404, 'question_not_found', 'gone'))
    const { result } = await renderHook(() => useQuestion('q1'))
    await act(async () => result.current.reload())
    await waitFor(() => expect(result.current.state.status).toBe('notFound'))
  })

  it('shows a vote at once and takes the count of the server', async () => {
    const { result } = await ready()
    let finish: (value: unknown) => void = () => undefined
    mockApi.vote.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await act(async () => {
      void result.current.toggleVote(answersOf(result.current.state)[0]!)
    })
    expect(answersOf(result.current.state)[0]).toMatchObject({ myVote: 1, score: 3 })
    expect(result.current.votingIds).toEqual(['a1'])
    await act(async () => finish({ myVote: 1, score: 5 }))
    expect(answersOf(result.current.state)[0]).toMatchObject({ myVote: 1, score: 5 })
    expect(result.current.votingIds).toEqual([])
  })

  it('puts the vote back when the server refuses it', async () => {
    const { result } = await ready()
    mockApi.vote.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'slow down'))
    await act(async () => result.current.toggleVote(answersOf(result.current.state)[0]!))
    expect(answersOf(result.current.state)[0]).toMatchObject({ myVote: 0, score: 2 })
    expect(result.current.problem).toBe('rate_limited')
  })

  it('takes the vote back on a second touch', async () => {
    const { result } = await ready(question(), [answer('a1', { myVote: 1, score: 3 })])
    mockApi.unvote.mockResolvedValueOnce({ myVote: 0, score: 2 })
    await act(async () => result.current.toggleVote(answersOf(result.current.state)[0]!))
    expect(mockApi.unvote).toHaveBeenCalledWith('a1')
    expect(mockApi.vote).not.toHaveBeenCalled()
    expect(answersOf(result.current.state)[0]).toMatchObject({ myVote: 0, score: 2 })
  })

  it('adds an answer and counts it', async () => {
    const { result } = await ready()
    mockApi.answer.mockResolvedValueOnce(answer('a2', { mine: true }))
    let sent = false
    await act(async () => {
      sent = await result.current.sendAnswer('Spray it')
    })
    expect(sent).toBe(true)
    expect(mockApi.answer).toHaveBeenCalledWith('q1', 'Spray it')
    expect(answersOf(result.current.state)).toHaveLength(2)
    expect(result.current.state).toMatchObject({ question: { answerCount: 2 } })
  })

  it('returns false when the answer is not sent', async () => {
    const { result } = await ready()
    mockApi.answer.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'slow down'))
    let sent = true
    await act(async () => {
      sent = await result.current.sendAnswer('Spray it')
    })
    expect(sent).toBe(false)
    expect(answersOf(result.current.state)).toHaveLength(1)
    expect(result.current.problem).toBe('rate_limited')
  })

  it('reads the question again after the best answer is marked', async () => {
    const { result } = await ready()
    mockApi.accept.mockResolvedValueOnce(undefined)
    mockApi.question.mockResolvedValue(question({ status: 'solved' }))
    mockApi.answers.mockResolvedValue([answer('a1', { accepted: true })])
    await act(async () => result.current.accept('a1'))
    expect(mockApi.accept).toHaveBeenCalledWith('q1', 'a1')
    expect(result.current.state).toMatchObject({ question: { status: 'solved' } })
    expect(answersOf(result.current.state)[0]).toMatchObject({ accepted: true })
  })

  it('clears the mark and reads again', async () => {
    const { result } = await ready(question({ status: 'solved' }), [
      answer('a1', { accepted: true }),
    ])
    mockApi.clearAccepted.mockResolvedValueOnce(undefined)
    mockApi.question.mockResolvedValue(question())
    mockApi.answers.mockResolvedValue([answer('a1')])
    await act(async () => result.current.clearAccepted())
    expect(mockApi.clearAccepted).toHaveBeenCalledWith('q1')
    expect(result.current.state).toMatchObject({ question: { status: 'open' } })
  })

  it('does not call a worked action a problem when the read after it fails', async () => {
    const { result } = await ready()
    mockApi.accept.mockResolvedValueOnce(undefined)
    mockApi.question.mockRejectedValue(new ApiError(500, 'server_error', 'down'))
    await act(async () => result.current.accept('a1'))
    expect(result.current.problem).toBeNull()
    expect(result.current.state.status).toBe('ready')
    expect(result.current.accepting).toBe(false)
  })

  it('keeps the state of an action when an earlier read ends after it', async () => {
    const { result } = await ready()
    let finishOld: (value: Question) => void = () => undefined
    mockApi.question.mockReturnValueOnce(new Promise<Question>((resolve) => (finishOld = resolve)))
    mockApi.answers.mockResolvedValueOnce([answer('a1')])
    await act(async () => result.current.reload())
    mockApi.accept.mockResolvedValueOnce(undefined)
    mockApi.question.mockResolvedValue(question({ status: 'solved' }))
    mockApi.answers.mockResolvedValue([answer('a1', { accepted: true })])
    await act(async () => result.current.accept('a1'))
    await act(async () => finishOld(question({ status: 'open' })))
    expect(result.current.state).toMatchObject({ question: { status: 'solved' } })
  })

  it('reports why the mark was refused', async () => {
    const { result } = await ready()
    mockApi.accept.mockRejectedValueOnce(new ApiError(409, 'own_answer', 'own'))
    await act(async () => result.current.accept('a1'))
    expect(result.current.problem).toBe('server')
    expect(result.current.accepting).toBe(false)
  })
})
