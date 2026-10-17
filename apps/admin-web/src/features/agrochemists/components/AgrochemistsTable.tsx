import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { documentsSummary } from '@/features/agrochemists/agrochemists'
import type { Agrochemist } from '@/shared/types'
import { formatShortDate } from '@/shared/utils/format'

interface AgrochemistsTableProps {
  agrochemists: Agrochemist[]
  onOpenDocuments: (agrochemist: Agrochemist) => void
  /** Extra columns appended on the right, e.g. actions. */
  extraColumns?: DataTableColumn<Agrochemist>[]
  empty?: ReactNode
  page?: number
  onPageChange?: (page: number) => void
}

export function AgrochemistsTable({
  agrochemists,
  onOpenDocuments,
  extraColumns = [],
  empty,
  page,
  onPageChange,
}: AgrochemistsTableProps) {
  const { t } = useTranslation('agrochemists')
  const columns: DataTableColumn<Agrochemist>[] = [
    {
      key: 'name',
      header: t('table.specialist'),
      render: (row) => (
        <span className="flex items-center gap-3">
          <Avatar name={row.name} size="md" />
          <span className="font-semibold">{row.name}</span>
        </span>
      ),
    },
    { key: 'specialization', header: t('table.specialization') },
    { key: 'region', header: t('table.region') },
    {
      key: 'documents',
      header: t('table.documents'),
      render: (row) =>
        row.documents.length > 0 ? (
          <button
            type="button"
            onClick={() => onOpenDocuments(row)}
            className="inline-flex items-center gap-1.5 rounded-md text-left font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <FileText size={18} aria-hidden="true" className="shrink-0" />
            {documentsSummary(row, (kind) => t(`documentKinds.${kind}`))}
          </button>
        ) : (
          <Badge tone="danger">{t('table.notUploaded')}</Badge>
        ),
    },
    {
      key: 'submittedAt',
      header: t('table.submitted'),
      className: 'whitespace-nowrap text-text-muted',
      render: (row) => formatShortDate(row.submittedAt),
    },
  ]

  return (
    <DataTable
      columns={[...columns, ...extraColumns]}
      data={agrochemists}
      getRowKey={(row) => row.id}
      empty={empty}
      page={page}
      onPageChange={onPageChange}
    />
  )
}
