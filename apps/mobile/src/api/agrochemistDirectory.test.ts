import { createAgrochemistDirectoryApi, directoryPath } from './agrochemistDirectory'
import type { ApiClient } from './client'
import { createMockAgrochemistDirectoryApi, MOCK_AGROCHEMISTS } from './mock/agrochemistDirectory'

describe('directoryPath', () => {
  it('always sends the page and the size, defaults 0 and 20', () => {
    expect(directoryPath()).toBe('/api/agrochemists?page=0&size=20')
  })

  it('adds the crop and the region and keeps the page inside the limits of the backend', () => {
    expect(directoryPath({ crop: 'tomato', regionId: 7, page: 2, size: 500 })).toBe(
      '/api/agrochemists?crop=tomato&regionId=7&page=2&size=50',
    )
    expect(directoryPath({ page: -3, size: 0 })).toBe('/api/agrochemists?page=0&size=1')
  })

  it('leaves out a blank crop', () => {
    expect(directoryPath({ crop: '' })).toBe('/api/agrochemists?page=0&size=20')
  })
})

describe('createAgrochemistDirectoryApi', () => {
  it('asks the list and one agrochemist from the backend', async () => {
    const request = jest.fn().mockResolvedValue([])
    const api = createAgrochemistDirectoryApi({ request } as unknown as ApiClient)

    await api.list({ crop: 'corn' })
    await api.get('a/b')

    expect(request).toHaveBeenNthCalledWith(1, '/api/agrochemists?crop=corn&page=0&size=20')
    expect(request).toHaveBeenNthCalledWith(2, '/api/agrochemists/a%2Fb')
  })
})

describe('mock directory', () => {
  const api = createMockAgrochemistDirectoryApi({ delayMs: 0 })

  it('filters by crop and region and pages the answer', async () => {
    expect((await api.list({ crop: 'tomato' })).map((a) => a.fullName)).toEqual([
      'Динара Ким',
      'Айгуль Сарсенова',
    ])
    expect(await api.list({ crop: 'wheat', regionId: 7 })).toEqual([])
    expect(await api.list({ page: 1, size: 2 })).toHaveLength(1)
    expect(await api.list({ page: 5 })).toEqual([])
  })

  it('reads one card and answers 404 for an unknown id', async () => {
    expect(await api.get(MOCK_AGROCHEMISTS[0].id)).toBe(MOCK_AGROCHEMISTS[0])
    await expect(api.get('nope')).rejects.toMatchObject({
      status: 404,
      code: 'agrochemist_not_found',
    })
  })
})
