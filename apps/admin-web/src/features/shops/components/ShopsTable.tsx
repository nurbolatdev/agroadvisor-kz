import { EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import type { Shop } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface ShopsTableProps {
  shops: Shop[]
  /** Extra columns on the right, e.g. the edit action. */
  extraColumns?: DataTableColumn<Shop>[]
  empty?: ReactNode
}

const COLUMNS: DataTableColumn<Shop>[] = [
  {
    key: 'name',
    header: 'Магазин',
    render: (shop) => (
      <span className="block">
        <span className="block font-semibold">{shop.name}</span>
        <span className="block text-caption font-normal text-text-muted">{shop.address}</span>
      </span>
    ),
  },
  {
    key: 'district',
    header: 'Район и часы',
    render: (shop) => (
      <span className="block">
        <span className="block">{shop.district}</span>
        <span className="block text-caption font-normal whitespace-nowrap text-text-muted">
          {shop.hours}
        </span>
      </span>
    ),
  },
  {
    key: 'routes30d',
    header: 'Маршрутов',
    align: 'right',
    className: 'whitespace-nowrap',
    render: (shop) => formatNumber(shop.routes30d),
  },
  {
    key: 'status',
    header: 'Статус',
    render: (shop) =>
      shop.status === 'active' ? (
        <Badge tone="success">Активен</Badge>
      ) : (
        <Badge tone="neutral" icon={EyeOff}>
          Скрыт
        </Badge>
      ),
  },
]

export function ShopsTable({ shops, extraColumns = [], empty }: ShopsTableProps) {
  return (
    <DataTable
      columns={[...COLUMNS, ...extraColumns]}
      data={shops}
      getRowKey={(shop) => shop.id}
      empty={empty}
    />
  )
}
