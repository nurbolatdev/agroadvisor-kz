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
  if (agrochemist.status === 'approved') {
    return (
      <span className="text-text-muted">
        Подтверждён {agrochemist.reviewedAt ? formatShortDate(agrochemist.reviewedAt) : ''}
      </span>
    )
  }
  if (agrochemist.status === 'rejected') {
    return <span className="text-danger">{agrochemist.rejectionReason ?? 'Отклонён'}</span>
  }

  const hasDocuments = agrochemist.documents.length > 0
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
        Отклонить
      </Button>
      {hasDocuments ? (
        <Button size="sm" disabled={busy} onClick={onApprove}>
          Подтвердить
        </Button>
      ) : agrochemist.documentsRequestedAt ? (
        <Badge tone="info">Запрошено {formatShortDate(agrochemist.documentsRequestedAt)}</Badge>
      ) : (
        <Button size="sm" variant="soft" disabled={busy} onClick={onRequestDocuments}>
          Запросить
        </Button>
      )}
    </span>
  )
}
