import { fireEvent, render, screen } from '@testing-library/react-native'

import type { Question } from '@/api/community'
import { initI18n } from '@/i18n'

import { QuestionCard } from './QuestionCard'

let mockToken: string | null = 'token-1'

jest.mock('@/services', () => ({
  useSession: (select: (s: { accessToken: string | null }) => unknown) =>
    select({ accessToken: mockToken }),
}))

const NOW = new Date('2026-11-22T12:00:00Z')

const question = (extra: Partial<Question> = {}): Question => ({
  id: 'q1',
  authorId: 'u1',
  authorName: 'Бауыржан К.',
  authorExpert: false,
  cropCode: 'wheat',
  regionId: 1,
  title: 'Жёлтые полосы на листьях',
  text: 'ИИ показал ржавчину 62%. Кто сталкивался?',
  status: 'open',
  answerCount: 3,
  mine: false,
  photoUrls: [],
  createdAt: '2026-11-22T10:00:00Z',
  ...extra,
})

const card = (q: Question, regionName: string | null = null, onPress = jest.fn()) => (
  <QuestionCard question={q} regionName={regionName} now={NOW} onPress={onPress} />
)

beforeEach(() => {
  mockToken = 'token-1'
  initI18n('ru')
})

describe('QuestionCard', () => {
  it('shows an open question as the design does', async () => {
    await render(card(question(), 'Алматинская обл.'))
    expect(screen.getByText('Бауыржан К.')).toBeTruthy()
    expect(screen.getByText('БК', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Алматинская обл. · 2 ч назад')).toBeTruthy()
    expect(screen.getByText('Открыт')).toBeTruthy()
    expect(screen.getByText('Жёлтые полосы на листьях')).toBeTruthy()
    expect(screen.getByText('Пшеница')).toBeTruthy()
    expect(screen.getByText('3 ответа')).toBeTruthy()
  })

  it('shows a solved question and the mark of an agrochemist', async () => {
    await render(
      card(
        question({
          status: 'solved',
          authorExpert: true,
          createdAt: '2026-11-21T09:00:00Z',
          cropCode: 'tomato',
        }),
      ),
    )
    expect(screen.getByText('Решён')).toBeTruthy()
    expect(screen.getByText('Агрохимик')).toBeTruthy()
    expect(screen.getByText('вчера')).toBeTruthy()
    expect(screen.getByText('Томат')).toBeTruthy()
  })

  it.each([
    [1, '1 ответ'],
    [3, '3 ответа'],
    [5, '5 ответов'],
  ])('writes %i answers in Russian', async (count, text) => {
    await render(card(question({ answerCount: count })))
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('draws a leaf when the question has no picture', async () => {
    await render(card(question()))
    expect(screen.getByTestId('question-photo-placeholder')).toBeTruthy()
    expect(screen.queryByTestId('question-photo')).toBeNull()
  })

  it('loads the first photo with the token', async () => {
    await render(card(question({ photoUrls: ['/api/community/questions/q1/photos/p1'] })))
    expect(screen.getByTestId('question-photo').props.source.headers).toEqual({
      Authorization: 'Bearer token-1',
    })
  })

  it('opens the question on press', async () => {
    const onPress = jest.fn()
    await render(card(question(), null, onPress))
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledWith('q1')
  })
})
