import type { Treatment } from '@/api/diseases'

export type TreatmentType = Treatment['type']

export const TREATMENT_TYPES: readonly TreatmentType[] = ['chemical', 'biological']

export type TreatmentPlan = Record<TreatmentType, Treatment[]>

// Splits the treatments of a disease into the two tabs of the plan, keeping the order of the reference.
export function groupTreatments(treatments: readonly Treatment[]): TreatmentPlan {
  const plan: TreatmentPlan = { chemical: [], biological: [] }
  for (const treatment of treatments) plan[treatment.type].push(treatment)
  return plan
}

// The tab that opens first: chemical, unless it is empty and the biological one is not.
export function defaultTab(plan: TreatmentPlan): TreatmentType {
  return plan.chemical.length === 0 && plan.biological.length > 0 ? 'biological' : 'chemical'
}
