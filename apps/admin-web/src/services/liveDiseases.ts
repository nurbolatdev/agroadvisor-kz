import type { AdminApi } from '@/services/api'
import { ApiError, type HttpClient } from '@/services/http'
import type { CropId, Disease, DiseaseKind, Severity, Treatment } from '@/shared/types'

/** Answers of the reference `GET /api/diseases` and `/api/diseases/{code}`, already in the language of the request. */
interface Summary {
  code: string
  cropCode: string | null
  kind: string
  severity: string | null
  latinName: string | null
  name: string
}

interface BackendTreatment {
  type: 'chemical' | 'biological'
  product: string
  activeIngredient: string | null
  dosage: string | null
  method: string | null
}

interface Detail {
  disease: Summary
  symptoms: string | string[] | null
  conditions: string | string[] | null
  prevention: string | string[] | null
  treatments: BackendTreatment[]
}

const CROPS: readonly string[] = ['potato', 'tomato', 'corn', 'wheat']

// The screens know four kinds; an oomycete (late blight) is shown with the fungal diseases. Healthy leaves and
// "other" are classes of the model, not diseases to read about.
const KINDS: Record<string, DiseaseKind | undefined> = {
  fungal: 'fungal',
  oomycete: 'fungal',
  bacterial: 'bacterial',
  viral: 'viral',
  pest: 'pest',
}

const list = (value: string | string[] | null): string[] =>
  value === null ? [] : Array.isArray(value) ? value : [value]

function toTreatment(treatment: BackendTreatment): Treatment {
  return {
    name: treatment.product,
    activeIngredient: treatment.activeIngredient ?? undefined,
    dosage: [treatment.dosage, treatment.method].filter(Boolean).join(' · '),
  }
}

/** Null for what is not a disease of the four crops (healthy leaf, unknown class, other). */
function toDisease(detail: Detail): Disease | null {
  const { disease } = detail
  const kind = KINDS[disease.kind]
  if (!kind || !disease.cropCode || !CROPS.includes(disease.cropCode)) return null
  return {
    id: disease.code,
    crop: disease.cropCode as CropId,
    name: disease.name,
    latinName: disease.latinName ?? '',
    kind,
    severity: (disease.severity ?? 'medium') as Severity, // a disease without a rating is shown as medium
    symptoms: list(detail.symptoms),
    conditions: list(detail.conditions).join(' '),
    chemicalTreatment: detail.treatments.filter((t) => t.type === 'chemical').map(toTreatment),
    biologicalTreatment: detail.treatments.filter((t) => t.type === 'biological').map(toTreatment),
    prevention: list(detail.prevention),
  }
}

export type DiseasesApi = Pick<AdminApi, 'getDiseases' | 'getDisease'>

export function createLiveDiseases(client: HttpClient): DiseasesApi {
  const detail = (code: string) => client.request<Detail>(`/api/diseases/${encodeURIComponent(code)}`)

  return {
    getDiseases: async (filters = {}) => {
      const summaries = await client.request<Summary[]>('/api/diseases', { query: { crop: filters.crop } })
      const wanted = summaries.filter((s) => KINDS[s.kind] && s.cropCode && CROPS.includes(s.cropCode))
      // A disease can disappear between the list and its detail; that one is skipped, any other failure stops.
      const settled = await Promise.allSettled(wanted.map((s) => detail(s.code)))
      const details: Detail[] = []
      for (const result of settled) {
        if (result.status === 'fulfilled') details.push(result.value)
        else if (!(result.reason instanceof ApiError && result.reason.status === 404)) throw result.reason
      }
      return details.map(toDisease).filter((d): d is Disease => d !== null)
    },

    getDisease: async (id) => {
      try {
        return toDisease(await detail(id))
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  }
}
