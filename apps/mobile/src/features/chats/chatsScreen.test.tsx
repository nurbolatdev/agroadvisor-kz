import { fireEvent, render, screen } from '@testing-library/react-native'

import type { Consultation } from '@/api/consultations'
import { NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { ChatsScreen } from './ChatsScreen'

const mockList = jest.fn()
const mockPush = jest.fn()
let mockRoles: string[] | null = ['farmer']

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush }),
    // runs the effect once, as the first show of the tab does
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  consultationsApi: { list: (...args: unknown[]) => mockList(...args) },
  useProfile: (select: (s: { roles: string[] | null }) => unknown) => select({ roles: mockRoles }),
}))

const chat = (
  id: string,
  agrochemist: string,
  extra: Partial<Consultation> = {},
): Consultation => ({
  id,
  status: 'active',
  unreadCount: 0,
  createdAt: '2026-11-15T08:00:00Z',
  farmer: { id: 'f1', fullName: 'Farmer One' },
  agrochemist: { id: `a-${id}`, fullName: agrochemist },
  lastMessage: {
    id: `m-${id}`,
    senderId: 'f1',
    hasPhoto: false,
    text: `hello ${agrochemist}`,
    createdAt: '2026-11-15T08:00:00Z',
  },
  ...extra,
})

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['farmer']
  mockList.mockResolvedValue([
    chat('1', 'Aigul Sarsenova', { unreadCount: 120 }),
    chat('2', 'Dinara Kim'),
  ])
})

describe('chats screen', () => {
  it('reads the list once on the first show and draws the other side of each chat', async () => {
    await render(<ChatsScreen />)

    expect(await screen.findByText('Aigul Sarsenova')).toBeTruthy()
    expect(screen.getByText('Dinara Kim')).toBeTruthy()
    expect(screen.queryByText('Farmer One')).toBeNull()
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('draws a chat once when a page shift brings it twice', async () => {
    const full = Array.from({ length: 50 }, (_, i) => chat(`c${i}`, `Agro ${i}`))
    // the last chat of page 0 comes again at the head of page 1
    mockList.mockResolvedValueOnce(full).mockResolvedValueOnce([full[49]])
    await render(<ChatsScreen />)

    expect(await screen.findByText('Agro 49')).toBeTruthy()
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('shows 99+ for a large number of unread messages', async () => {
    await render(<ChatsScreen />)
    await screen.findByText('Aigul Sarsenova')

    // the counter is hidden from a screen reader (the row says it in its label), so look at hidden text too
    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeTruthy()
  })

  it('keeps only the unread chats under the filter', async () => {
    await render(<ChatsScreen />)
    await screen.findByText('Dinara Kim')

    await fireEvent.press(screen.getByText('Unread'))

    expect(screen.getByText('Aigul Sarsenova')).toBeTruthy()
    expect(screen.queryByText('Dinara Kim')).toBeNull()
  })

  it('shows the way to a new chat to a farmer only', async () => {
    await render(<ChatsScreen />)
    await screen.findByText('Dinara Kim')
    fireEvent.press(screen.getByText('Find an agrochemist'))
    expect(mockPush).toHaveBeenCalledWith('/agrochemists')
  })

  it('shows an agrochemist the farmers and no way to find an agrochemist', async () => {
    mockRoles = ['agrochemist']
    mockList.mockResolvedValue([
      { ...chat('1', 'Aigul Sarsenova'), farmer: { id: 'f9', fullName: 'Farmer Nine' } },
    ])
    await render(<ChatsScreen />)

    expect(await screen.findByText('Farmer Nine')).toBeTruthy()
    expect(screen.queryByText('Find an agrochemist')).toBeNull()
  })

  it('tells an agrochemist the right words when there are no chats', async () => {
    mockRoles = ['agrochemist']
    mockList.mockResolvedValue([])
    await render(<ChatsScreen />)

    expect(
      await screen.findByText('A chat appears once you accept a request of a farmer'),
    ).toBeTruthy()
  })

  it('shows the error with a retry that reads again', async () => {
    mockList.mockRejectedValueOnce(new NetworkError())
    await render(<ChatsScreen />)

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    fireEvent.press(screen.getByText('Try again'))

    expect(await screen.findByText('Aigul Sarsenova')).toBeTruthy()
  })
})
