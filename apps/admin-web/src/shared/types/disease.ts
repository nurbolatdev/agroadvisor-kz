import type { CropId } from '@/shared/types/common'

export type DiseaseKind = 'fungal' | 'bacterial' | 'viral' | 'pest'
export type Severity = 'low' | 'medium' | 'high'

export interface Treatment {
  /** Product or method name. */
  name: string
  activeIngredient?: string
  dosage: string
}

export interface Disease {
  /** URL slug, used in `/diseases/:id`. */
  id: string
  crop: CropId
  name: string
  latinName: string
  kind: DiseaseKind
  severity: Severity
  symptoms: string[]
  /** Weather and field conditions that favour the disease. */
  conditions: string
  chemicalTreatment: Treatment[]
  biologicalTreatment: Treatment[]
  prevention: string[]
}
