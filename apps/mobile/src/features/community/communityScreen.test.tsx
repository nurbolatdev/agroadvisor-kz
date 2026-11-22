import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { COMMUNITY_PAGE_SIZE, type CommunityApi, type Question } from '@/api/community'
import { NetworkError } from '@/api/errors'
import { createMockCommunityApi } from '@/api/mock/community'
import { initI18n } from '@/i18n'

import { CommunityScreen } from './CommunityScreen'

const mockPush = jest.fn()
let mockRoles: string[] | null = ['farmer']
let mockApi: CommunityApi
const mockFeed = jest.fn()
let mockFocusCount = 0

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush }),
    // runs the effect once, as the first show of the tab does
    // `mockFocusCount` stands for coming back to the tab: a render after it runs the effect again
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect, mockFocusCount]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/notifications/NotificationsBell', () => ({ NotificationsBell: () => null }))
jest.mock('@/features/agrochemists/useRegionName', () => ({
  useRegionName: () => (id: number | null | undefined) => (id === 1 ? 'Алматинская обл.' : null),
}))
jest.mock('@/services', () => ({
  communityApi: {
    feed: (...args: unknown[]) => mockFeed(...args),
    subscriptions: () => mockApi.subscriptions(),
  },
  useProfile: (select: (s: unknown) => unknown) =>
    select({ roles: mockRoles, me: { regionId: 1 } }),
  useSession: (select: (s: { accessToken: string | null }) => unknown) =>
    select({ accessToken: 'token-1' }),
}))

const question = (id: number): Question =>
  ({
    id: `q${id}`,
    authorId: 'u1',
    authorName: 'Автор',
    authorExpert: false,
    cropCode: 'wheat',
    regionId: 1,
    title: `Вопрос ${id}`,
    text: 'Текст вопроса',
    status: 'open',
    answerCount: 0,
    mine: false,
    photoUrls: [],
    createdAt: '2026-11-22T10:00:00Z',
  }) as Question

beforeEach(() => {
  jest.clearAllMocks()
  mockFocusCount = 0
  mockRoles = ['farmer']
  mockApi = createMockCommunityApi({
    viewer: () => ({ id: 'viewer', roles: ['farmer'], regionId: 1 }),
    delayMs: 0,
  })
  mockFeed.mockImplementation((query: Parameters<CommunityApi['feed']>[0]) => mockApi.feed(query))
  initI18n('ru')
})

describe('CommunityScreen', () => {
  it('draws the questions of the feed', async () => {
    await render(<CommunityScreen />)

    expect(await screen.findByText('Жёлтые пятна на листьях пшеницы')).toBeOnTheScreen()
    expect(screen.getByText('Коричневые пятна на томатах')).toBeOnTheScreen()
    expect(screen.getByText('Задать вопрос')).toBeOnTheScreen()
  })

  it('asks the feed for the solved questions when the chip is touched', async () => {
    await render(<CommunityScreen />)
    await screen.findByText('Жёлтые пятна на листьях пшеницы')

    await fireEvent.press(screen.getByText('Решённые'))

    await waitFor(() =>
      expect(mockFeed).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'solved' })),
    )
    expect(await screen.findByText('Коричневые пятна на томатах')).toBeOnTheScreen()
    await waitFor(() =>
      expect(screen.queryByText('Жёлтые пятна на листьях пшеницы')).not.toBeOnTheScreen(),
    )
  })

  it('hides the questions that do not match the search', async () => {
    await render(<CommunityScreen />)
    await screen.findByText('Жёлтые пятна на листьях пшеницы')

    await fireEvent.changeText(screen.getByLabelText('Поиск по вопросам'), 'томат')

    expect(screen.getByText('Коричневые пятна на томатах')).toBeOnTheScreen()
    expect(screen.queryByText('Жёлтые пятна на листьях пшеницы')).not.toBeOnTheScreen()

    await fireEvent.changeText(screen.getByLabelText('Поиск по вопросам'), 'нет такого')
    expect(screen.getByText('Ничего не найдено среди загруженных вопросов')).toBeOnTheScreen()
  })

  it('opens a question and the crops of the caller', async () => {
    await render(<CommunityScreen />)
    await fireEvent.press(await screen.findByText('Коричневые пятна на томатах'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/question/[id]',
      params: { id: expect.any(String) },
    })

    await fireEvent.press(screen.getByLabelText('Мои культуры'))
    expect(mockPush).toHaveBeenLastCalledWith('/community-crops')
  })

  it('lets a farmer ask a question', async () => {
    await render(<CommunityScreen />)
    await fireEvent.press(await screen.findByText('Задать вопрос'))
    expect(mockPush).toHaveBeenCalledWith('/question/new')
  })

  it('has no ask button for an agrochemist', async () => {
    mockRoles = ['agrochemist']
    await render(<CommunityScreen />)

    expect(await screen.findByText('Жёлтые пятна на листьях пшеницы')).toBeOnTheScreen()
    expect(screen.queryByText('Задать вопрос')).not.toBeOnTheScreen()
  })

  it('reads the next page at the end of the list', async () => {
    const first = Array.from({ length: COMMUNITY_PAGE_SIZE }, (_, i) => question(i))
    mockFeed.mockResolvedValueOnce(first).mockResolvedValueOnce([question(99)])
    await render(<CommunityScreen />)
    await screen.findByText('Вопрос 0')

    await fireEvent(screen.getByTestId('community-feed'), 'endReached')

    await waitFor(() =>
      expect(mockFeed).toHaveBeenLastCalledWith(
        expect.objectContaining({ before: `q${COMMUNITY_PAGE_SIZE - 1}` }),
      ),
    )
  })

  it('keeps the list when the tab is shown again with the same filters', async () => {
    const first = Array.from({ length: COMMUNITY_PAGE_SIZE }, (_, i) => question(i))
    mockFeed.mockResolvedValueOnce(first).mockResolvedValueOnce([question(99)])
    const view = await render(<CommunityScreen />)
    await screen.findByText('Вопрос 0')
    await fireEvent(screen.getByTestId('community-feed'), 'endReached')
    await waitFor(() => expect(mockFeed).toHaveBeenCalledTimes(2))

    mockFocusCount += 1
    await view.rerender(<CommunityScreen />)

    expect(mockFeed).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Вопрос 0')).toBeOnTheScreen()
  })

  it('reads the first page again when the filters changed', async () => {
    await render(<CommunityScreen />)
    await screen.findByText('Жёлтые пятна на листьях пшеницы')
    const reads = mockFeed.mock.calls.length

    await fireEvent.press(screen.getByText('Решённые'))

    await waitFor(() => expect(mockFeed.mock.calls.length).toBe(reads + 1))
  })

  it('offers to retry when the feed cannot be read', async () => {
    mockFeed.mockRejectedValueOnce(new NetworkError())
    await render(<CommunityScreen />)

    expect(await screen.findByText('Нет связи с сервером. Проверьте интернет')).toBeOnTheScreen()
    await fireEvent.press(screen.getByText('Повторить'))

    expect(await screen.findByText('Жёлтые пятна на листьях пшеницы')).toBeOnTheScreen()
  })
})
