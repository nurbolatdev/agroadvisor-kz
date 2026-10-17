import type { BadgeTone } from '@/components/ui/Badge'
import type { Agrochemist, DocumentKind, VerificationStatus } from '@/shared/types'

/** Order of the status tabs; labels are in the `agrochemists` translations. */
export const VERIFICATION_STATUS_TONES: Record<VerificationStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

/** "Диплом, сертификат" — unique document kinds, first letter capitalised. */
export function documentsSummary(agrochemist: Agrochemist, label: (kind: DocumentKind) => string) {
  const kinds = [...new Set(agrochemist.documents.map((document) => label(document.kind)))]
  const text = kinds.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
