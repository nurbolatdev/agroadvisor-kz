import type { DiagnosisHistoryApi, DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'

import { createHistoryStore, filterByCrop, toHistoryError } from './history'

function diagnosis(n: number, crop = 'tomato'): DiagnosisResult {
  const top1 = { code: `${crop}__healthy`, confidence: 0.9 }
  return {
    id: `d${n}`,
    crop,
    status: 'ok',
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    photoUrl: `/api/diagnoses/d${n}/photo`,
    createdAt: '2026-11-04T10:00:00Z',
  }
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => diagnosis(from + i))

function setup(pages: (DiagnosisResult[] | Error)[], pageSize = 3) {
  let calls = 0
  const list = jest.fn(async (page: number) => {
    calls += 1
    const answer = pages[page] ?? []
    if (answer instanceof Error) throw answer
    return answer
  })
  const api: DiagnosisHistoryApi = { list, get: jest.fn() }
  const store = createHistoryStore({ api, pageSize })
  return { store, list, calls: () => calls }
}

describe('history store', () => {
  it('loads the first page and knows that a full page may have a next one', async () => {
    const { store, list } = setup([range(1, 4)])

    await store.getState().load()

    expect(list).toHaveBeenCalledWith(0, 3)
    expect(store.getState().items.map((d) => d.id)).toEqual(['d1', 'd2', 'd3'])
    expect(store.getState().phase).toBe('ready')
    expect(store.getState().hasMore).toBe(true)
  })

  it('a page shorter than a full one is the last one', async () => {
    const { store } = setup([range(1, 3)])

    await store.getState().load()

    expect(store.getState().hasMore).toBe(false)
  })

  it('an empty history is ready with no items', async () => {
    const { store } = setup([[]])

    await store.getState().load()

    expect(store.getState()).toMatchObject({ items: [], phase: 'ready', hasMore: false })
  })

  it('does not send a second request while the first page is on its way', async () => {
    const { store, list } = setup([range(1, 4)])

    await Promise.all([store.getState().load(), store.getState().load()])

    expect(list).toHaveBeenCalledTimes(1)
  })

  it('does not load again when there is something to show', async () => {
    const { store, list } = setup([range(1, 4)])
    await store.getState().load()

    await store.getState().load()

    expect(list).toHaveBeenCalledTimes(1)
  })

  it('a failed first load is failed with the reason, and load tries again', async () => {
    const { store } = setup([new NetworkError()])
    await store.getState().load()
    expect(store.getState()).toMatchObject({ phase: 'failed', error: 'offline', items: [] })

    const retry = setup([range(1, 3)])
    await retry.store.getState().load()
    expect(retry.store.getState().phase).toBe('ready')
  })

  it('load after a failure asks the server again', async () => {
    let fail = true
    const api: DiagnosisHistoryApi = {
      list: async () => {
        if (fail) throw new ApiError(500, 'internal_error', 'boom')
        return range(1, 3)
      },
      get: jest.fn(),
    }
    const store = createHistoryStore({ api, pageSize: 3 })
    await store.getState().load()
    expect(store.getState()).toMatchObject({ phase: 'failed', error: 'server' })

    fail = false
    await store.getState().load()

    expect(store.getState()).toMatchObject({ phase: 'ready', error: null })
    expect(store.getState().items).toHaveLength(2)
  })

  it('appends the next page without duplicates when a new diagnosis moved the pages', async () => {
    const { store, list } = setup([range(1, 4), [diagnosis(3), diagnosis(4)]])
    await store.getState().load()

    await store.getState().loadMore()

    expect(list).toHaveBeenLastCalledWith(1, 3)
    expect(store.getState().items.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4'])
    expect(store.getState().hasMore).toBe(false)
  })

  it('does not ask for more after the last page, before the first load or while one is loading', async () => {
    const { store, list } = setup([range(1, 3)])
    await store.getState().loadMore() // idle
    await store.getState().load()
    await store.getState().loadMore() // last page already

    expect(list).toHaveBeenCalledTimes(1)
  })

  it('a failed "load more" keeps the list, shows the error and can be tried again', async () => {
    let offline = false
    const api: DiagnosisHistoryApi = {
      list: async (page) => {
        if (page === 1 && offline) throw new NetworkError()
        return page === 0 ? range(1, 4) : range(4, 6)
      },
      get: jest.fn(),
    }
    const store = createHistoryStore({ api, pageSize: 3 })
    await store.getState().load()

    offline = true
    await store.getState().loadMore()
    expect(store.getState()).toMatchObject({ phase: 'ready', error: 'offline', hasMore: true })
    expect(store.getState().items).toHaveLength(3)

    offline = false
    await store.getState().loadMore() // the same page again
    expect(store.getState().items.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'])
    expect(store.getState().error).toBeNull()
  })

  it('refresh replaces the list with the first page when the answer comes', async () => {
    const answers = [
      [diagnosis(1), diagnosis(2), diagnosis(3)],
      [diagnosis(9), diagnosis(1), diagnosis(2)],
    ]
    const api: DiagnosisHistoryApi = { list: async () => answers.shift() ?? [], get: jest.fn() }
    const store = createHistoryStore({ api, pageSize: 3 })
    await store.getState().load()

    await store.getState().refresh()

    expect(store.getState().items.map((d) => d.id)).toEqual(['d9', 'd1', 'd2'])
    expect(store.getState().phase).toBe('ready')
  })

  it('a failed refresh keeps the list that was shown', async () => {
    let fail = false
    const api: DiagnosisHistoryApi = {
      list: async () => {
        if (fail) throw new NetworkError()
        return range(1, 4)
      },
      get: jest.fn(),
    }
    const store = createHistoryStore({ api, pageSize: 3 })
    await store.getState().load()

    fail = true
    await store.getState().refresh()

    expect(store.getState()).toMatchObject({ phase: 'ready', error: 'offline' })
    expect(store.getState().items).toHaveLength(3)
  })

  it('refresh on a store that never loaded does the first load', async () => {
    const { store, list } = setup([range(1, 3)])

    await store.getState().refresh()

    expect(list).toHaveBeenCalledTimes(1)
    expect(store.getState().phase).toBe('ready')
  })

  it('drops the answer of a request that was started before a reset (another farmer signed in)', async () => {
    let release: (page: DiagnosisResult[]) => void = () => {}
    const api: DiagnosisHistoryApi = {
      list: () => new Promise((resolve) => (release = resolve)),
      get: jest.fn(),
    }
    const store = createHistoryStore({ api, pageSize: 3 })
    const loading = store.getState().load()

    store.getState().reset()
    release(range(1, 4)) // the previous farmer's diagnoses arrive late
    await loading

    expect(store.getState()).toMatchObject({ items: [], phase: 'idle' })
  })

  it('a late "load more" cannot put an old page after a refreshed list', async () => {
    let releaseMore: (page: DiagnosisResult[]) => void = () => {}
    let calls = 0
    const api: DiagnosisHistoryApi = {
      list: (page) => {
        calls += 1
        if (page === 1) return new Promise((resolve) => (releaseMore = resolve))
        return Promise.resolve(
          calls > 2 ? [diagnosis(20), diagnosis(21), diagnosis(22)] : range(1, 4),
        )
      },
      get: jest.fn(),
    }
    const store = createHistoryStore({ api, pageSize: 3 })
    await store.getState().load()
    const more = store.getState().loadMore()

    await store.getState().refresh()
    releaseMore([diagnosis(98), diagnosis(99), diagnosis(97)])
    await more

    expect(store.getState().items.map((d) => d.id)).toEqual(['d20', 'd21', 'd22'])
  })

  it('reset clears the list, the error and the filter', async () => {
    const { store } = setup([range(1, 4)])
    await store.getState().load()
    store.getState().setCrop('corn')

    store.getState().reset()

    expect(store.getState()).toMatchObject({
      items: [],
      phase: 'idle',
      error: null,
      crop: null,
      hasMore: true,
    })
  })
})

describe('filter by crop', () => {
  const items = [diagnosis(1, 'tomato'), diagnosis(2, 'corn'), diagnosis(3, 'tomato')]

  it('keeps the order and only the chosen crop', () => {
    expect(filterByCrop(items, 'tomato').map((d) => d.id)).toEqual(['d1', 'd3'])
    expect(filterByCrop(items, 'wheat')).toEqual([])
  })

  it('no crop means everything', () => {
    expect(filterByCrop(items, null)).toBe(items)
  })
})

describe('history errors', () => {
  it('tells offline, an ended session and a server fault apart', () => {
    expect(toHistoryError(new NetworkError())).toBe('offline')
    expect(toHistoryError(new ApiError(401, 'unauthorized', 'x'))).toBe('session')
    expect(toHistoryError(new ApiError(403, 'forbidden', 'x'))).toBe('session')
    expect(toHistoryError(new ApiError(500, 'internal_error', 'x'))).toBe('server')
    expect(toHistoryError(new Error('?'))).toBe('server')
  })
})
