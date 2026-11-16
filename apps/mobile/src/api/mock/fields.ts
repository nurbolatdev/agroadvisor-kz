import { ApiError } from '../errors'
import {
  FIELD_NAME_MAX,
  type CreateField,
  type Field,
  type FieldsApi,
  type UpdateField,
} from '../fields'

type Options = { delayMs?: number; now?: () => number }

// 1 sotka = 0.01 ha
const HA_PER_SOTKA = 0.01

const invalid = (field: string, message: string) =>
  new ApiError(400, 'validation_failed', 'Validation failed', [{ field, message }])

// Works without the backend: the same checks, conversion to hectares and 404 as the field endpoints. The
// state lives in memory for the session. The region and the district stay empty: the server sets them
// from the point, and the mock has no outlines.
export function createMockFieldsApi({ delayMs = 400, now = Date.now }: Options = {}): FieldsApi {
  const fields: Field[] = []
  let count = 0
  let tick = 0
  const wait = () =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  const stamp = () => new Date(now() + 1000 * (tick += 1)).toISOString()
  const toHa = (area: number, unit: Field['areaUnit']) =>
    Math.round(area * (unit === 'sotka' ? HA_PER_SOTKA : 1) * 10_000) / 10_000
  const find = (id: string) => {
    const found = fields.find((f) => f.id === id)
    if (!found) throw new ApiError(404, 'field_not_found', 'Field not found')
    return found
  }
  const checkName = (name: string) => {
    const clean = name.trim()
    if (clean.length === 0 || name.length > FIELD_NAME_MAX) {
      throw invalid('name', `size must be between 1 and ${FIELD_NAME_MAX}`)
    }
    return clean
  }
  const checkArea = (area: number) => {
    if (!Number.isFinite(area) || area <= 0) throw invalid('area', 'must be greater than 0')
  }

  return {
    list: async () => {
      await wait()
      return [...fields].reverse().map((f) => ({ ...f }))
    },
    get: async (id) => {
      await wait()
      return { ...find(id) }
    },
    create: async (body: CreateField) => {
      await wait()
      const name = checkName(body.name)
      checkArea(body.area)
      if (!body.crop.trim()) throw invalid('crop', 'must not be blank')
      count += 1
      const at = stamp()
      const created: Field = {
        id: `00000000-0000-4000-d000-${String(count).padStart(12, '0')}`,
        name,
        crop: body.crop,
        area: body.area,
        areaUnit: body.areaUnit,
        areaHa: toHa(body.area, body.areaUnit),
        location: body.location ?? null,
        regionId: null,
        districtId: null,
        createdAt: at,
        updatedAt: at,
      }
      fields.push(created)
      return { ...created }
    },
    update: async (id, body: UpdateField) => {
      await wait()
      const field = find(id)
      if ((body.area === undefined) !== (body.areaUnit === undefined)) {
        throw invalid('area', 'area and areaUnit are sent together')
      }
      if (body.name !== undefined) field.name = checkName(body.name)
      if (body.crop !== undefined) {
        if (!body.crop.trim()) throw invalid('crop', 'must not be blank')
        field.crop = body.crop
      }
      if (body.area !== undefined && body.areaUnit !== undefined) {
        checkArea(body.area)
        field.area = body.area
        field.areaUnit = body.areaUnit
        field.areaHa = toHa(body.area, body.areaUnit)
      }
      // a missing key keeps the point, null removes it
      if (body.location !== undefined) field.location = body.location
      field.updatedAt = stamp()
      return { ...field }
    },
    remove: async (id) => {
      await wait()
      find(id)
      fields.splice(
        fields.findIndex((f) => f.id === id),
        1,
      )
    },
  }
}
