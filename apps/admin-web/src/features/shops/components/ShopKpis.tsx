import { StatCard } from '@/components/ui/StatCard'
import type { ShopStats } from '@/shared/types'
import { formatNumber, formatSigned } from '@/shared/utils/format'

interface ShopKpisProps {
  stats: ShopStats | undefined
}

export function ShopKpis({ stats }: ShopKpisProps) {
  const value = (number: number | undefined) => (number === undefined ? '—' : formatNumber(number))

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Магазинов в справочнике"
        value={value(stats?.total)}
        change={stats ? `${formatSigned(stats.addedThisMonth)} за месяц` : undefined}
      />
      <StatCard
        label="Маршрутов за 30 дней"
        value={value(stats?.routes30d)}
        change={stats ? `${formatSigned(stats.routesChangePercent)}%` : undefined}
        trend={stats && stats.routesChangePercent < 0 ? 'bad' : 'good'}
      />
      <StatCard
        label="Районов без магазина"
        value={value(stats?.districtsWithoutShop)}
        change={
          stats ? (stats.districtsWithoutShop > 0 ? 'нужно действие' : 'все покрыты') : undefined
        }
        trend={stats && stats.districtsWithoutShop > 0 ? 'bad' : 'good'}
      />
      <StatCard
        label="Заявок на проверке"
        value={value(stats?.pendingRequests)}
        change={stats ? (stats.pendingRequests > 0 ? 'ждут решения' : 'всё обработано') : undefined}
        trend="neutral"
      />
    </div>
  )
}
