import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { documentsSummary } from '@/features/agrochemists/agrochemists'
import type { Agrochemist } from '@/shared/types'
import { formatShortDate } from '@/shared/utils/format'

interface AgrochemistsTableProps {
  agrochemists: Agrochemist[]
  /** Extra columns appended on the right, e.g. actions. */
  extraColumns?: DataTableColumn<Agrochemist>[]
  empty?: ReactNode
}

const COLUMNS: DataTableColumn<Agrochemist>[] = [
  {
    key: 'name',
    header: 'Специалист',
    render: (row) => (
      <span className="flex items-center gap-3">
        <Avatar name={row.name} size="md" />
        <span className="font-semibold">{row.name}</span>
      </span>
    ),
  },
  { key: 'specialization', header: 'Специализация' },
  { key: 'region', header: 'Регион' },
  {
    key: 'documents',
    header: 'Документы',
    render: (row) =>
      row.documents.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <FileText size={18} aria-hidden="true" className="shrink-0" />
          {documentsSummary(row)}
        </span>
      ) : (
        <Badge tone="danger">Не загружены</Badge>
      ),
  },
  {
    key: 'submittedAt',
    header: 'Подана',
    className: 'whitespace-nowrap text-text-muted',
    render: (row) => formatShortDate(row.submittedAt),
  },
]

export function AgrochemistsTable({
  agrochemists,
  extraColumns = [],
  empty,
}: AgrochemistsTableProps) {
  return (
    <DataTable
      columns={[...COLUMNS, ...extraColumns]}
      data={agrochemists}
      getRowKey={(row) => row.id}
      empty={empty}
    />
  )
}
