import type { BadgeTone } from '@/components/ui/Badge'
import type { Agrochemist, DocumentKind, VerificationStatus } from '@/shared/types'

export const DOCUMENT_KINDS: Record<DocumentKind, string> = {
  diploma: 'диплом',
  certificate: 'сертификат',
}

export const VERIFICATION_STATUSES: Record<
  VerificationStatus,
  { label: string; badge: string; tone: BadgeTone }
> = {
  pending: { label: 'Ожидают проверки', badge: 'Нужно действие', tone: 'warning' },
  approved: { label: 'Подтверждены', badge: 'Активны', tone: 'success' },
  rejected: { label: 'Отклонены за месяц', badge: 'Архив', tone: 'danger' },
}

/** "Диплом, сертификат" — unique document kinds, first letter capitalised. */
export function documentsSummary(agrochemist: Agrochemist) {
  const kinds = [...new Set(agrochemist.documents.map((document) => DOCUMENT_KINDS[document.kind]))]
  const text = kinds.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
