import { describe, expect, it, vi } from 'vitest'

import { ApiError, type HttpClient } from './http'
import { createLiveDiseases } from './liveDiseases'

const summary = (code: string, over: object = {}) => ({
  code,
  cropCode: 'potato',
  kind: 'oomycete',
  severity: 'high',
  latinName: 'Phytophthora infestans',
  name: 'Фитофтороз',
  ...over,
})

const detail = (code: string, over: object = {}, disease: object = {}) => ({
  disease: summary(code, disease),
  symptoms: ['Бурые пятна', 'Белый налёт'],
  conditions: 'Влажная погода',
  prevention: 'Севооборот',
  treatments: [
    { type: 'chemical', product: 'Ридомил', activeIngredient: 'металаксил', dosage: '2,5 кг/га', method: null },
    { type: 'biological', product: 'Фитоспорин', activeIngredient: null, dosage: null, method: 'Опрыскивание' },
  ],
  ...over,
})

function setup(routes: Record<string, unknown | Error>) {
  const requests: { path: string; query?: Record<string, unknown> }[] = []
  const client = {
    request: vi.fn(async (path: string, opts: { query?: Record<string, unknown> } = {}) => {
      requests.push({ path, query: opts.query })
      const answer = routes[path]
      if (answer instanceof Error) throw answer
      return answer
    }),
  } as unknown as HttpClient
  return { api: createLiveDiseases(client), requests }
}

describe('live diseases', () => {
  it('maps a disease of the reference to the shape of the pages', async () => {
    const { api, requests } = setup({
      '/api/diseases': [summary('potato__late_blight')],
      '/api/diseases/potato__late_blight': detail('potato__late_blight'),
    })

    const [disease] = await api.getDiseases({ crop: 'potato' })

    expect(requests[0].query).toEqual({ crop: 'potato' })
    expect(disease).toEqual({
      id: 'potato__late_blight',
      crop: 'potato',
      name: 'Фитофтороз',
      latinName: 'Phytophthora infestans',
      kind: 'fungal', // an oomycete is shown with the fungal diseases
      severity: 'high',
      symptoms: ['Бурые пятна', 'Белый налёт'],
      conditions: 'Влажная погода',
      prevention: ['Севооборот'],
      chemicalTreatment: [{ name: 'Ридомил', activeIngredient: 'металаксил', dosage: '2,5 кг/га' }],
      biologicalTreatment: [{ name: 'Фитоспорин', activeIngredient: undefined, dosage: 'Опрыскивание' }],
    })
  })

  it('leaves out healthy leaves, other classes and crops the app does not know', async () => {
    const { api, requests } = setup({
      '/api/diseases': [
        summary('potato__healthy', { kind: 'healthy' }),
        summary('unknown', { cropCode: null, kind: 'other' }),
        summary('apple__scab', { cropCode: 'apple', kind: 'fungal' }),
        summary('wheat__rust', { cropCode: 'wheat', kind: 'fungal' }),
      ],
      '/api/diseases/wheat__rust': detail('wheat__rust', {}, { cropCode: 'wheat', kind: 'fungal' }),
    })

    const diseases = await api.getDiseases()

    expect(diseases.map((d) => d.id)).toEqual(['wheat__rust'])
    expect(requests.map((r) => r.path)).toEqual(['/api/diseases', '/api/diseases/wheat__rust'])
  })

  it('keeps both the dosage and the method of a treatment', async () => {
    const both = {
      treatments: [{ type: 'chemical', product: 'X', activeIngredient: null, dosage: '2 л/га', method: 'Опрыскивание' }],
    }
    const { api } = setup({ '/api/diseases/x': detail('x', both) })

    const disease = await api.getDisease('x')

    expect(disease?.chemicalTreatment[0].dosage).toBe('2 л/га · Опрыскивание')
  })

  it('shows a disease without a rating as medium', async () => {
    const { api } = setup({ '/api/diseases/x': detail('x', {}, { severity: null, kind: 'pest' }) })

    expect(await api.getDisease('x')).toMatchObject({ severity: 'medium', kind: 'pest' })
  })

  it('returns null for an unknown disease and passes other errors on', async () => {
    const { api } = setup({
      '/api/diseases/none': new ApiError(404, 'disease_not_found', 'x'),
      '/api/diseases/boom': new ApiError(500, 'internal_error', 'x'),
    })

    expect(await api.getDisease('none')).toBeNull()
    await expect(api.getDisease('boom')).rejects.toMatchObject({ status: 500 })
  })
})
