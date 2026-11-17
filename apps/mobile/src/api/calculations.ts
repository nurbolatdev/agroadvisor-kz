import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api). The server keeps what the app sends and does not
// recalculate it: `costs` are the season totals, `results` is what the app calculated.
export type Calculation = Schemas['CalculationResponse']
export type CreateCalculation = Schemas['CreateCalculationRequest']

export type CalculationsApi = {
  // the saved seasons of the caller, newest first
  list: () => Promise<Calculation[]>
  // 404 calculation_not_found for a missing one and for one of another user alike
  get: (id: string) => Promise<Calculation>
  // 409 when the limit of 100 seasons is reached; there is no change, a season is saved again and the old one deleted
  create: (body: CreateCalculation) => Promise<Calculation>
  remove: (id: string) => Promise<void>
}

export function createCalculationsApi(client: ApiClient): CalculationsApi {
  const path = (id: string) => `/api/calculations/${encodeURIComponent(id)}`
  return {
    list: () => client.request<Calculation[]>('/api/calculations'),
    get: (id) => client.request<Calculation>(path(id)),
    create: (body) => client.request<Calculation>('/api/calculations', { method: 'POST', body }),
    remove: async (id) => {
      await client.request(path(id), { method: 'DELETE' })
    },
  }
}
