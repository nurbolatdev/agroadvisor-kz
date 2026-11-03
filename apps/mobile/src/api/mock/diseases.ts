import type { DiseaseApi, DiseaseDetail, DiseaseSummary } from '../diseases'

type Options = { delayMs?: number }

// Works without the backend: every code gets a card with one chemical and one biological treatment.
// The texts are plain placeholders, not agronomic advice.
export function createMockDiseaseApi({ delayMs = 300 }: Options = {}): DiseaseApi {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))
  const summary = (code: string): DiseaseSummary => ({
    code,
    name: code,
    kind: code.endsWith('__healthy') ? 'healthy' : 'fungal',
    cropCode: code.split('__')[0],
    severity: code.endsWith('__healthy') ? null : 'medium',
  })

  return {
    list: async ({ crop }) => {
      await wait()
      return crop ? [summary(`${crop}__late_blight`), summary(`${crop}__healthy`)] : []
    },
    get: async (code) => {
      await wait()
      const healthy = code.endsWith('__healthy')
      const detail: DiseaseDetail = {
        disease: summary(code),
        treatments: healthy
          ? []
          : [
              { product: 'Mock fungicide', type: 'chemical', dosage: 'mock', method: 'mock' },
              { product: 'Mock biological agent', type: 'biological', dosage: 'mock' },
            ],
      }
      return detail
    },
  }
}
