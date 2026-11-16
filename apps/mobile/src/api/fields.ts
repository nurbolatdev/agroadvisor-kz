import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api).
export type FieldPoint = Schemas['FieldPoint']
// The generator drops the `null` the contract allows for the point ("null when the field has no point", and
// "null removes the point" on a change), so those two keys are written out here.
export type Field = Omit<Schemas['FieldResponse'], 'location'> & { location?: FieldPoint | null }
export type CreateField = Schemas['CreateFieldRequest']
export type UpdateField = Omit<Schemas['UpdateFieldRequest'], 'location'> & {
  location?: FieldPoint | null
}
export type AreaUnit = CreateField['areaUnit']

export const FIELD_NAME_MAX = 80

export type FieldsApi = {
  // the fields of the caller, newest first
  list: () => Promise<Field[]>
  // 404 field_not_found for a missing field and for the field of another user alike
  get: (id: string) => Promise<Field>
  create: (body: CreateField) => Promise<Field>
  // only the keys that are sent change; `area` and `areaUnit` go together; `location: null` removes the point
  update: (id: string, body: UpdateField) => Promise<Field>
  remove: (id: string) => Promise<void>
}

export function createFieldsApi(client: ApiClient): FieldsApi {
  const path = (id: string) => `/api/fields/${encodeURIComponent(id)}`
  return {
    list: () => client.request<Field[]>('/api/fields'),
    get: (id) => client.request<Field>(path(id)),
    create: (body) => client.request<Field>('/api/fields', { method: 'POST', body }),
    update: (id, body) => client.request<Field>(path(id), { method: 'PATCH', body }),
    remove: async (id) => {
      await client.request(path(id), { method: 'DELETE' })
    },
  }
}
