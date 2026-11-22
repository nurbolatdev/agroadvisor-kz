import { act, renderHook, waitFor } from '@testing-library/react-native'

import { COMMUNITY_PAGE_SIZE } from '@/api/community'
import type { Question } from '@/api/community'
import { ApiError, NetworkError } from '@/api/errors'

import { useFeed } from './useFeed'
import { useSubscriptions } from './useSubscriptions'

const mockApi = {
  feed: jest.fn(),
  subscriptions: jest.fn(),
  saveSubscriptions: jest.fn(),
}

jest.mock('@/services', () => ({
  communityApi: {
    feed: (...a: unknown[]) => mockApi.feed(...a),
    subscriptions: (...a: unknown[]) => mockApi.subscriptions(...a),
    saveSubscriptions: (...a: unknown[]) => mockApi.saveSubscriptions(...a),
  },
}))

const question = (id: string): Question =>
  ({ id, title: `Question ${id}`, text: 'text', cropCode: 'wheat' }) as unknown as Question

const page = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => question(`q${from + i}`))

const items = (state: ReturnType<typeof useFeed>['state']) =>
  state.status === 'ready' ? state.items.map((q) => q.id) : null

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useFeed', () => {
  it('reads two pages by the id of the last question without duplicates', async () => {
    mockApi.feed
      .mockResolvedValueOnce(page(0, COMMUNITY_PAGE_SIZE))
      // the second page repeats the last question of the first one
      .mockResolvedValueOnce([
        question(`q${COMMUNITY_PAGE_SIZE - 1}`),
        ...page(COMMUNITY_PAGE_SIZE, 3),
      ])
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    await act(async () => result.current.loadMore())
    await waitFor(() => expect(items(result.current.state)).toHaveLength(COMMUNITY_PAGE_SIZE + 3))
    expect(mockApi.feed).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: `q${COMMUNITY_PAGE_SIZE - 1}` }),
    )
    expect(new Set(items(result.current.state)).size).toBe(COMMUNITY_PAGE_SIZE + 3)
    // the short second page ends the feed
    expect(result.current.state).toMatchObject({ end: true })
  })

  it('ends on a short first page', async () => {
    mockApi.feed.mockResolvedValue(page(0, 2))
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready', end: true }))
  })

  it('reads one page at a time', async () => {
    mockApi.feed.mockResolvedValueOnce(page(0, COMMUNITY_PAGE_SIZE))
    mockApi.feed.mockReturnValueOnce(new Promise(() => undefined))
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => {
      result.current.loadMore()
      result.current.loadMore()
    })
    expect(mockApi.feed).toHaveBeenCalledTimes(2)
  })

  it('drops a late answer of an earlier start', async () => {
    let first: (value: Question[]) => void = () => undefined
    mockApi.feed.mockReturnValueOnce(new Promise<Question[]>((resolve) => (first = resolve)))
    mockApi.feed.mockResolvedValueOnce([question('new')])
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await act(async () => result.current.load())
    await waitFor(() => expect(items(result.current.state)).toEqual(['new']))
    await act(async () => first([question('old')]))
    expect(items(result.current.state)).toEqual(['new'])
  })

  it('keeps the list and marks it failed when a refresh does not work', async () => {
    mockApi.feed.mockResolvedValueOnce(page(0, 2)).mockRejectedValueOnce(new Error('boom'))
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => result.current.refresh())
    await waitFor(() => expect(result.current.state).toMatchObject({ failed: true }))
    expect(items(result.current.state)).toHaveLength(2)
  })

  it('reports offline on a first read without a network', async () => {
    mockApi.feed.mockRejectedValue(new NetworkError())
    const { result } = await renderHook(() => useFeed({}))
    await act(async () => result.current.load())
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', reason: 'offline' }),
    )
  })

  it('starts the list over when the query changes', async () => {
    mockApi.feed.mockResolvedValueOnce(page(0, 2)).mockResolvedValueOnce([question('other')])
    const { result, rerender } = await renderHook(
      ({ status }: { status?: 'open' }) => useFeed({ status }),
      { initialProps: {} as { status?: 'open' } },
    )
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await rerender({ status: 'open' })
    await act(async () => result.current.load())
    await waitFor(() => expect(items(result.current.state)).toEqual(['other']))
    expect(mockApi.feed).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'open' }))
  })
})

describe('useSubscriptions', () => {
  it('reads the crops and saves the whole set', async () => {
    mockApi.subscriptions.mockResolvedValue({ crops: ['wheat'] })
    mockApi.saveSubscriptions.mockResolvedValue({ crops: ['wheat', 'tomato'] })
    const { result } = await renderHook(() => useSubscriptions())
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.crops).toEqual(['wheat']))

    let problem: unknown = 'unset'
    await act(async () => {
      problem = await result.current.save(['wheat', 'tomato'])
    })
    expect(problem).toBeNull()
    expect(mockApi.saveSubscriptions).toHaveBeenCalledWith(['wheat', 'tomato'])
    expect(result.current.crops).toEqual(['wheat', 'tomato'])
  })

  it('keeps the earlier set when the save is refused with 400', async () => {
    mockApi.subscriptions.mockResolvedValue({ crops: ['wheat'] })
    mockApi.saveSubscriptions.mockRejectedValue(new ApiError(400, 'validation_failed', 'bad'))
    const { result } = await renderHook(() => useSubscriptions())
    await act(async () => result.current.load())
    await waitFor(() => expect(result.current.crops).toEqual(['wheat']))

    let problem: unknown = null
    await act(async () => {
      problem = await result.current.save(['wheat', 'x'])
    })
    expect(problem).not.toBeNull()
    expect(result.current.crops).toEqual(['wheat'])
  })
})
