import type { ApiClient } from './client'
import { createDiseaseApi } from './diseases'

function setup() {
  const request = jest.fn(async () => [])
  return { api: createDiseaseApi({ request } as unknown as ApiClient), request }
}

describe('disease api', () => {
  it('lists with the language and the crop', async () => {
    const { api, request } = setup()
    await api.list({ crop: 'tomato', lang: 'kk' })
    expect(request).toHaveBeenCalledWith('/api/diseases?lang=kk&crop=tomato')
  })

  it('lists without a crop', async () => {
    const { api, request } = setup()
    await api.list({ lang: 'ru' })
    expect(request).toHaveBeenCalledWith('/api/diseases?lang=ru')
  })

  it('reads one card in the language and escapes the code', async () => {
    const { api, request } = setup()
    await api.get('tomato__late blight', 'en')
    expect(request).toHaveBeenCalledWith('/api/diseases/tomato__late%20blight?lang=en')
  })
})
