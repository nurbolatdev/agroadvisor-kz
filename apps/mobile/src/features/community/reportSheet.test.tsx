import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { Answer, Question } from '@/api/community'
import { ApiError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { QuestionScreen } from './QuestionScreen'
import { ReportSheet } from './ReportSheet'

const mockApi = {
  question: jest.fn(),
  answers: jest.fn(),
  diagnosis: jest.fn(),
  report: jest.fn(),
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
  useRegionName: () => () => null,
}))
jest.mock('@/features/diseases/useDiseaseDetail', () => ({
  useDiseaseDetail: () => ({ state: { status: 'loading' } }),
}))
jest.mock('@/services', () => ({
  communityApi: {
    question: (...a: unknown[]) => mockApi.question(...a),
    answers: (...a: unknown[]) => mockApi.answers(...a),
    diagnosis: (...a: unknown[]) => mockApi.diagnosis(...a),
    report: (...a: unknown[]) => mockApi.report(...a),
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
  photoUrls: [],
  diagnosisUrl: null,
  createdAt: '2026-11-22T10:00:00Z',
}

const answer = (id: string, extra: Partial<Answer>): Answer => ({
  id,
  questionId: 'q1',
  authorId: 'u2',
  authorName: 'Автор',
  authorExpert: false,
  text: `Текст ${id}`,
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
  mockApi.report.mockResolvedValue(undefined)
  mockApi.question.mockResolvedValue(question)
  mockApi.answers.mockResolvedValue([answer('a1', {}), answer('a2', { mine: true })])
})

describe('ReportSheet', () => {
  it('keeps the send button off until a reason is picked', async () => {
    await render(<ReportSheet targetType="question" targetId="q1" onClose={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    await fireEvent.press(screen.getByText('Спам'))
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled()
  })

  it('sends the target and the reason, and leaves out an empty comment', async () => {
    await render(<ReportSheet targetType="answer" targetId="a1" onClose={jest.fn()} />)

    await fireEvent.press(screen.getByText('Реклама'))
    await fireEvent.changeText(screen.getByPlaceholderText('Что не так (необязательно)'), '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() =>
      expect(mockApi.report).toHaveBeenCalledWith({
        targetType: 'answer',
        targetId: 'a1',
        reason: 'ads',
      }),
    )
    expect(await screen.findByText('Жалоба отправлена')).toBeOnTheScreen()
  })

  it('sends the trimmed comment', async () => {
    await render(<ReportSheet targetType="question" targetId="q1" onClose={jest.fn()} />)

    await fireEvent.press(screen.getByText('Неверная информация'))
    await fireEvent.changeText(
      screen.getByPlaceholderText('Что не так (необязательно)'),
      '  Это не ржавчина  ',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() =>
      expect(mockApi.report).toHaveBeenCalledWith({
        targetType: 'question',
        targetId: 'q1',
        reason: 'misinformation',
        comment: 'Это не ржавчина',
      }),
    )
  })

  it('asks to try again when the earlier report is still being handled', async () => {
    mockApi.report.mockRejectedValue(new ApiError(409, 'complaint_resolved', 'x'))
    await render(<ReportSheet targetType="question" targetId="q1" onClose={jest.fn()} />)

    await fireEvent.press(screen.getByText('Спам'))
    await fireEvent.press(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Попробуйте ещё раз')).toBeOnTheScreen()
    expect(screen.queryByText('Жалоба отправлена')).not.toBeOnTheScreen()
  })

  it('closes with Done after the report went out', async () => {
    const onClose = jest.fn()
    await render(<ReportSheet targetType="question" targetId="q1" onClose={onClose} />)

    await fireEvent.press(screen.getByText('Оскорбления'))
    await fireEvent.press(screen.getByRole('button', { name: 'Отправить' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Готово' }))

    expect(onClose).toHaveBeenCalled()
  })
})

describe('the flags of a report on the question screen', () => {
  it('draws a flag on the question and on the answers of other people', async () => {
    await render(<QuestionScreen />)

    await screen.findByText('Текст a1')
    // the question and the answer a1; the answer a2 is the person's own
    expect(screen.getAllByRole('button', { name: 'Пожаловаться' })).toHaveLength(2)
  })

  it('has no flag on the own question', async () => {
    mockApi.question.mockResolvedValue({ ...question, mine: true })
    await render(<QuestionScreen />)

    await screen.findByText('Текст a1')
    // only the answer a1
    expect(screen.getAllByRole('button', { name: 'Пожаловаться' })).toHaveLength(1)
  })

  it('opens the sheet for the answer and reports it', async () => {
    await render(<QuestionScreen />)

    await screen.findByText('Текст a1')
    const flags = screen.getAllByRole('button', { name: 'Пожаловаться' })
    await fireEvent.press(flags[1])
    await fireEvent.press(await screen.findByText('Спам'))
    await fireEvent.press(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() =>
      expect(mockApi.report).toHaveBeenCalledWith({
        targetType: 'answer',
        targetId: 'a1',
        reason: 'spam',
      }),
    )
  })
})
