import type { ApiClient } from './client'
import { createMockRegionsApi } from './mock/regions'
import { createRegionsApi } from './regions'

describe('regions api', () => {
  it('asks in the language of the app, with no access token (there is no account yet)', async () => {
    const request = jest.fn(async () => [])
    const api = createRegionsApi({ request } as unknown as ApiClient)

    await api.list('kk')

    expect(request).toHaveBeenCalledWith('/api/regions?lang=kk', { auth: false })
  })
})

describe('mock regions api', () => {
  it('answers with the ten regions in the language asked, as the backend orders them', async () => {
    const api = createMockRegionsApi({ delayMs: 0 })

    const ru = await api.list('ru')
    const kk = await api.list('kk')
    const en = await api.list('en')

    expect(ru).toHaveLength(10)
    expect(ru[0]).toEqual({ id: 1, code: 'akmola', name: 'Акмолинская область' })
    // Kazakh puts Қ after К, so Karaganda follows Zhambyl, and "Shyghys" (East) comes last
    expect(kk.map((r) => r.code)).toEqual([
      'akmola',
      'aktobe',
      'almaty',
      'zhambyl',
      'karaganda',
      'kostanay',
      'pavlodar',
      'north_kazakhstan',
      'turkistan',
      'east_kazakhstan',
    ])
    expect(en.map((r) => r.name)).toEqual([...en.map((r) => r.name)].sort())
  })
})
