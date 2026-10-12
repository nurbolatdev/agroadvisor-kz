import type { CropId, IsoDateTime } from '@/shared/types/common'
import type { StatsPeriod } from '@/shared/types/stats'

export interface TopDisease {
  name: string
  /** Catalog entry, when the disease is in the reference book. */
  diseaseId?: string
  count: number
}

export interface AiMismatch {
  aiLabel: string
  confirmedLabel: string
  cases: number
}

export interface DistrictOutbreak {
  districtId: string
  disease: string
  cases: number
  /** Growth vs the previous week, e.g. 2 for "×2"; null when there is no history. */
  growth: number | null
}

export interface DiseaseGeography {
  region: string
  days: number
  districts: { id: string; name: string }[]
  outbreaks: DistrictOutbreak[]
}

/** Data for the AI quality screen (admin-02). */
export interface AiQualityStats {
  period: StatsPeriod
  /** Share of diagnoses (%) in 10 confidence buckets: 0–10 %, 10–20 %, … 90–100 %. */
  confidenceHistogram: number[]
  topDiseases: TopDisease[]
  trainingData: { labeled: number; addedThisWeek: number; classes: number }
  mismatches: AiMismatch[]
  geography: DiseaseGeography
}

/** One labeled photo in the retraining dataset export. */
export interface TrainingSample {
  id: string
  crop: CropId
  aiLabel: string
  confirmedLabel: string
  /** Model confidence, 0–1. */
  confidence: number
  confirmedBy: 'agrochemist' | 'community'
  date: IsoDateTime
}
