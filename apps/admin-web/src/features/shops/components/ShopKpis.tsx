import { useTranslation } from 'react-i18next'
import { StatCard } from '@/components/ui/StatCard'
import type { ShopStats } from '@/shared/types'
import { formatNumber, formatSigned } from '@/shared/utils/format'

interface ShopKpisProps {
  stats: ShopStats | undefined
}

export function ShopKpis({ stats }: ShopKpisProps) {
  const { t } = useTranslation('shops', { keyPrefix: 'kpi' })
  const value = (number: number | undefined) => (number === undefined ? '—' : formatNumber(number))
  // While the stats load the card is shown as a placeholder; it is hidden only when the source has no routes.
  const hasRoutes = !stats || stats.routes30d !== undefined

  return (
    <div
      className={`grid gap-4 sm:grid-cols-2 ${hasRoutes ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}
    >
      <StatCard
        label={t('total')}
        value={value(stats?.total)}
        change={stats ? t('addedMonth', { change: formatSigned(stats.addedThisMonth) }) : undefined}
      />
      {hasRoutes ? (
        <StatCard
          label={t('routes')}
          value={value(stats?.routes30d)}
          change={
            stats?.routesChangePercent !== undefined
              ? `${formatSigned(stats.routesChangePercent)}%`
              : undefined
          }
          trend={stats && (stats.routesChangePercent ?? 0) < 0 ? 'bad' : 'good'}
        />
      ) : null}
      <StatCard
        label={t('withoutShop')}
        value={value(stats?.districtsWithoutShop)}
        change={
          stats ? (stats.districtsWithoutShop > 0 ? t('actionNeeded') : t('allCovered')) : undefined
        }
        trend={stats && stats.districtsWithoutShop > 0 ? 'bad' : 'good'}
      />
      <StatCard
        label={t('pending')}
        value={value(stats?.pendingRequests)}
        change={stats ? (stats.pendingRequests > 0 ? t('awaiting') : t('allDone')) : undefined}
        trend="neutral"
      />
    </div>
  )
}
