import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Agrochemist } from '@/shared/types'
import { formatShortDate } from '@/shared/utils/format'

interface DecisionCellProps {
  agrochemist: Agrochemist
  busy: boolean
  onApprove: () => void
  onReject: () => void
  onRequestDocuments: () => void
}

/** Right-most table cell: decision buttons for pending applications, the outcome otherwise. */
export function DecisionCell({
  agrochemist,
  busy,
  onApprove,
  onReject,
  onRequestDocuments,
}: DecisionCellProps) {
  const { t } = useTranslation(['agrochemists', 'common'])
  if (agrochemist.status === 'approved') {
    return (
      <span className="text-text-muted">
        {agrochemist.reviewedAt
          ? t('decision.approvedOn', { date: formatShortDate(agrochemist.reviewedAt) })
          : t('decision.approved')}
      </span>
    )
  }
  if (agrochemist.status === 'rejected') {
    return (
      <span className="text-danger">{agrochemist.rejectionReason ?? t('decision.rejected')}</span>
    )
  }

  const hasDocuments = agrochemist.documents.length > 0
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
        {t('common:actions.reject')}
      </Button>
      {hasDocuments ? (
        <Button size="sm" disabled={busy} onClick={onApprove}>
          {t('common:actions.approve')}
        </Button>
      ) : agrochemist.documentsRequestedAt ? (
        <Badge tone="info">
          {t('decision.requestedOn', { date: formatShortDate(agrochemist.documentsRequestedAt) })}
        </Badge>
      ) : (
        <Button size="sm" variant="soft" disabled={busy} onClick={onRequestDocuments}>
          {t('decision.request')}
        </Button>
      )}
    </span>
  )
}
