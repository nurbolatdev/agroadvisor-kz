import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { Answer, Question } from '@/api/community'
import type { DiagnosisResult } from '@/api/diagnosis'
import { ApiError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { QuestionScreen } from './QuestionScreen'

const mockApi = {
  question: jest.fn(),
  answers: jest.fn(),
  diagnosis: jest.fn(),
  answer: jest.fn(),
  vote: jest.fn(),
  unvote: jest.fn(),
  accept: jest.fn(),
  clearAccepted: jest.fn(),
}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'q1' }),
  useRouter: () => ({ back: jest.fn() }),
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/agrochemists/useRegionName', () => ({
  useRegionName: () => (id: number | null | undefined) => (id === 1 ? 'Алматинская обл.' : null),
}))
jest.mock('@/features/diseases/useDiseaseDetail', () => ({
  useDiseaseDetail: () => ({
    state: { status: 'ready', detail: { disease: { name: 'Жёлтая ржавчина' } } },
  }),
}))
jest.mock('@/services', () => ({
  communityApi: {
    question: (...a: unknown[]) => mockApi.question(...a),
    answers: (...a: unknown[]) => mockApi.answers(...a),
    diagnosis: (...a: unknown[]) => mockApi.diagnosis(...a),
    answer: (...a: unknown[]) => mockApi.answer(...a),
    vote: (...a: unknown[]) => mockApi.vote(...a),
    unvote: (...a: unknown[]) => mockApi.unvote(...a),
    accept: (...a: unknown[]) => mockApi.accept(...a),
    clearAccepted: (...a: unknown[]) => mockApi.clearAccepted(...a),
  },
  useSession: (select: (s: { accessToken: string | null }) => unknown) =>
    select({ accessToken: 'token-1' }),
}))

const question: Question = {
  id: 'q1',
  authorId: 'u1',
  authorName: 'Бауыржан К.',
  authorExpert: false,
  cropCode: 'wheat',
  regionId: 1,
  title: 'Жёлтые полосы на листьях',
  text: 'Появились после недели жары.',
  status: 'open',
  answerCount: 2,
  mine: false,
  photoUrls: ['/api/community/questions/q1/photos/p1'],
  diagnosisUrl: '/api/community/questions/q1/diagnosis',
  createdAt: '2026-11-22T10:00:00Z',
}

const answer = (id: string, extra: Partial<Answer>): Answer => ({
  id,
  questionId: 'q1',
  authorId: 'u2',
  authorName: 'Автор',
  authorExpert: false,
  text: 'Текст',
  score: 0,
  myVote: 0,
  mine: false,
  accepted: false,
  createdAt: '2026-11-22T10:00:00Z',
  ...extra,
})

beforeEach(() => {
  jest.clearAllMocks()
  initI18n('ru')
  mockApi.question.mockResolvedValue(question)
  mockApi.answers.mockResolvedValue([
    answer('a1', {
      authorName: 'Айгуль С.',
      authorExpert: true,
      accepted: true,
      score: 8,
      text: 'Это жёлтая ржавчина.',
    }),
    answer('a2', { authorName: 'Ерлан Т.', text: 'У меня было в прошлом году.' }),
  ])
  mockApi.diagnosis.mockResolvedValue({ top1: { code: 'wheat__yellow_rust', confidence: 0.62 } })
})

describe('QuestionScreen', () => {
  it('draws the question with the photo, the result of the model and the answers', async () => {
    await render(<QuestionScreen />)

    expect(await screen.findByText('Жёлтые полосы на листьях')).toBeOnTheScreen()
    expect(screen.getByText('Открыт')).toBeOnTheScreen()
    expect(screen.getByText('Пшеница · Алматинская обл.', { exact: false })).toBeOnTheScreen()
    expect(screen.getByTestId('question-photo')).toBeOnTheScreen()
    expect(screen.getByTestId('question-ai-result')).toHaveTextContent(
      'Результат ИИ: Жёлтая ржавчина · 62%',
    )
    expect(screen.getByText('2 ответа')).toBeOnTheScreen()
  })

  it('shows the best answer first, with its mark', async () => {
    await render(<QuestionScreen />)

    expect(await screen.findByText('Это жёлтая ржавчина.')).toBeOnTheScreen()
    expect(screen.getAllByText('Лучший ответ')).toHaveLength(1)
    expect(screen.getByText('Агрохимик')).toBeOnTheScreen()
    expect(screen.getByText('У меня было в прошлом году.')).toBeOnTheScreen()
    expect(screen.getByText('8')).toBeOnTheScreen()
  })

  it('does not ask for the result of the model when there is none', async () => {
    mockApi.question.mockResolvedValue({ ...question, diagnosisUrl: null })
    await render(<QuestionScreen />)

    await screen.findByText('Жёлтые полосы на листьях')
    expect(screen.queryByTestId('question-ai-result')).not.toBeOnTheScreen()
    expect(mockApi.diagnosis).not.toHaveBeenCalled()
  })

  it('says so when the question is gone', async () => {
    mockApi.question.mockRejectedValue(new ApiError(404, 'question_not_found', 'x'))
    await render(<QuestionScreen />)

    await waitFor(() => expect(screen.getByText('Вопрос удалён или скрыт')).toBeOnTheScreen())
  })
})

describe('QuestionScreen actions', () => {
  it('adds the answer and clears the field', async () => {
    mockApi.answer.mockResolvedValue(
      answer('a3', { authorName: 'Я', mine: true, text: 'Попробуйте фунгицид.' }),
    )
    await render(<QuestionScreen />)
    await screen.findByText('Жёлтые полосы на листьях')

    const field = screen.getByPlaceholderText('Ваш ответ…')
    await fireEvent.changeText(field, 'Попробуйте фунгицид.')
    await fireEvent.press(screen.getByLabelText('Отправить ответ'))

    expect(await screen.findByText('3 ответа')).toBeOnTheScreen()
    expect(screen.getAllByText('Попробуйте фунгицид.')).toHaveLength(1)
    expect(mockApi.answer).toHaveBeenCalledWith('q1', 'Попробуйте фунгицид.')
    expect(field.props.value).toBe('')
    expect(screen.queryByLabelText('Прикрепить фото')).not.toBeOnTheScreen()
  })

  it('changes the score with the thumb', async () => {
    mockApi.vote.mockResolvedValue({ score: 1, myVote: 1 })
    await render(<QuestionScreen />)
    await screen.findByText('У меня было в прошлом году.')

    await fireEvent.press(screen.getByLabelText('Полезно: 0 людям'))

    await waitFor(() => expect(screen.getByLabelText('Полезно: 1 человеку')).toBeOnTheScreen())
    expect(screen.getByLabelText('Полезно: 1 человеку')).toBeSelected()
    expect(mockApi.vote).toHaveBeenCalledWith('a2')
  })

  it('lets the author of the question mark the best answer', async () => {
    mockApi.question
      .mockResolvedValueOnce({ ...question, mine: true })
      .mockResolvedValue({ ...question, mine: true, status: 'solved' })
    mockApi.answers
      .mockResolvedValueOnce([answer('a2', { authorName: 'Ерлан Т.', text: 'Совет.' })])
      .mockResolvedValue([answer('a2', { authorName: 'Ерлан Т.', text: 'Совет.', accepted: true })])
    mockApi.accept.mockResolvedValue(undefined)
    await render(<QuestionScreen />)
    await screen.findByText('Совет.')
    expect(screen.getByText('Открыт')).toBeOnTheScreen()

    await fireEvent.press(screen.getByLabelText('Отметить лучшим'))

    expect(await screen.findByText('Решён')).toBeOnTheScreen()
    expect(screen.getByText('Лучший ответ')).toBeOnTheScreen()
    expect(mockApi.accept).toHaveBeenCalledWith('q1', 'a2')
    expect(screen.getByLabelText('Снять отметку')).toBeOnTheScreen()
  })

  it('has no thumb action and no mark button on the own answer', async () => {
    mockApi.question.mockResolvedValue({ ...question, mine: true })
    mockApi.answers.mockResolvedValue([answer('a2', { mine: true, text: 'Мой ответ.' })])
    await render(<QuestionScreen />)
    await screen.findByText('Мой ответ.')

    expect(screen.queryByLabelText('Отметить лучшим')).not.toBeOnTheScreen()
    expect(screen.getByLabelText('Полезно: 0 людям')).toBeDisabled()
  })

  it('shows the problem of a refused action under the answers', async () => {
    mockApi.vote.mockRejectedValue(new ApiError(429, 'rate_limited', 'x'))
    await render(<QuestionScreen />)
    await screen.findByText('У меня было в прошлом году.')

    await fireEvent.press(screen.getByLabelText('Полезно: 0 людям'))

    expect(await screen.findByText('Слишком много действий. Подождите немного')).toBeOnTheScreen()
  })
})
