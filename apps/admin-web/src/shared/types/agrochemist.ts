import type { IsoDateTime } from '@/shared/types/common'

export type VerificationStatus = 'pending' | 'approved' | 'rejected'
export type DocumentKind = 'diploma' | 'certificate'

export interface AgrochemistDocument {
  kind: DocumentKind
  title: string
  issuer: string
  year: number
  fileUrl: string
}

export interface Agrochemist {
  id: string
  name: string
  specialization: string
  region: string
  experienceYears: number
  /** Average farmer rating of consultations, 1–5; only for approved agrochemists. */
  rating?: number
  documents: AgrochemistDocument[]
  status: VerificationStatus
  submittedAt: IsoDateTime
  reviewedAt?: IsoDateTime
  rejectionReason?: string
  /** When the admin asked the applicant to upload documents. */
  documentsRequestedAt?: IsoDateTime
}
