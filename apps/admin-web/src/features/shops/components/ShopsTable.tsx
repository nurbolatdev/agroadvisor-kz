import { EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import type { Shop } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface ShopsTableProps {
  shops: Shop[]
  /** Extra columns on the right, e.g. the edit action. */
  extraColumns?: DataTableColumn<Shop>[]
  empty?: ReactNode
  page?: number
  onPageChange?: (page: number) => void
}

export function ShopsTable({
  shops,
  extraColumns = [],
  empty,
  page,
  onPageChange,
}: ShopsTableProps) {
  const { t } = useTranslation('shops', { keyPrefix: 'table' })
  const columns: DataTableColumn<Shop>[] = [
    {
      key: 'name',
      header: t('shop'),
      render: (shop) => (
        <span className="block">
          <span className="block font-semibold">{shop.name}</span>
          <span className="block text-caption font-normal text-text-muted">{shop.address}</span>
        </span>
      ),
    },
    {
      key: 'district',
      header: t('districtHours'),
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
      header: t('routes'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (shop) => formatNumber(shop.routes30d),
    },
    {
      key: 'status',
      header: t('status'),
      render: (shop) =>
        shop.status === 'active' ? (
          <Badge tone="success">{t('active')}</Badge>
        ) : (
          <Badge tone="neutral" icon={EyeOff}>
            {t('hidden')}
          </Badge>
        ),
    },
  ]

  return (
    <DataTable
      columns={[...columns, ...extraColumns]}
      data={shops}
      getRowKey={(shop) => shop.id}
      empty={empty}
      page={page}
      onPageChange={onPageChange}
    />
  )
}
