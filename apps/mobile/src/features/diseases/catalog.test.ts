import { ApiError } from '@/api/errors'
import type { DiseaseApi, DiseaseDetail } from '@/api/diseases'
import type { Language } from '@/i18n'

import { createDiseaseCatalog } from './catalog'

const detail = (code: string): DiseaseDetail => ({
  disease: { code, name: code, kind: 'fungal' },
  treatments: [],
})

function setup() {
  const get = jest.fn(async (code: string, _lang: Language) => detail(code))
  const list = jest.fn(async () => [])
  const api: DiseaseApi = { get, list }
  let lang: Language = 'ru'
  const catalog = createDiseaseCatalog(api, () => lang)
  return {
    catalog,
    get,
    list,
    setLanguage: (next: Language) => {
      lang = next
    },
  }
}

describe('disease catalog', () => {
  it('asks in the language of the app', async () => {
    const { catalog, get, setLanguage } = setup()
    setLanguage('kk')
    await catalog.detail('tomato__late_blight')
    expect(get).toHaveBeenCalledWith('tomato__late_blight', 'kk')
  })

  it('remembers a card for the session', async () => {
    const { catalog, get } = setup()
    await catalog.detail('a')
    await catalog.detail('a')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('shares one request between two asks made at the same time', async () => {
    const { catalog, get } = setup()
    await Promise.all([catalog.detail('a'), catalog.detail('a')])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('drops the cache when the language changes', async () => {
    const { catalog, get, list, setLanguage } = setup()
    await catalog.detail('a')
    await catalog.list('tomato')

    setLanguage('en')
    await catalog.detail('a')
    await catalog.list('tomato')

    expect(get.mock.calls.map((c) => c[1])).toEqual(['ru', 'en'])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failed request, the next ask tries again', async () => {
    const { catalog, get } = setup()
    get.mockRejectedValueOnce(new ApiError(503, 'unavailable', 'down'))

    await expect(catalog.detail('a')).rejects.toBeInstanceOf(ApiError)
    await expect(catalog.detail('a')).resolves.toEqual(detail('a'))

    expect(get).toHaveBeenCalledTimes(2)
  })
})
