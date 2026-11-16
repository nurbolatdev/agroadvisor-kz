import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'

import { UNREAD_POLL_MS, useUnreadCount } from './useUnreadCount'

const mockUnread = jest.fn()

jest.mock('@/services', () => ({
  consultationsApi: { unreadCount: (...a: unknown[]) => mockUnread(...a) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockUnread.mockResolvedValue({ count: 3 })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('useUnreadCount', () => {
  it('reads the number at the start', async () => {
    const hook = await renderHook(() => useUnreadCount('home', true))

    await waitFor(() => expect(hook.result.current).toBe(3))
  })

  it('reads again when another tab opens', async () => {
    const hook = await renderHook<number, { key: string }>(({ key }) => useUnreadCount(key, true), {
      initialProps: { key: 'home' },
    })
    await waitFor(() => expect(hook.result.current).toBe(3))
    mockUnread.mockResolvedValue({ count: 0 })

    await hook.rerender({ key: 'chats' })

    await waitFor(() => expect(hook.result.current).toBe(0))
  })

  it('reads again every half minute and keeps the number when a read fails', async () => {
    jest.useFakeTimers()
    const hook = await renderHook(() => useUnreadCount('home', true))
    await waitFor(() => expect(hook.result.current).toBe(3))
    mockUnread.mockRejectedValue(new Error('offline'))

    await act(async () => {
      await jest.advanceTimersByTimeAsync(UNREAD_POLL_MS)
    })

    expect(mockUnread).toHaveBeenCalledTimes(2)
    expect(hook.result.current).toBe(3)
  })

  it('stops while the app is in the background and reads at once when it returns', async () => {
    let change: (state: AppStateStatus) => void = () => undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      change = listener
      return { remove: jest.fn() }
    })
    const hook = await renderHook(() => useUnreadCount('home', true))
    await waitFor(() => expect(hook.result.current).toBe(3))
    const reads = mockUnread.mock.calls.length

    await act(async () => change('background'))
    await act(async () => change('active'))

    await waitFor(() => expect(mockUnread.mock.calls.length).toBe(reads + 1))
  })

  it('asks for nothing while the feature is off', async () => {
    const hook = await renderHook(() => useUnreadCount('home', false))

    expect(hook.result.current).toBe(0)
    expect(mockUnread).not.toHaveBeenCalled()
  })
})
