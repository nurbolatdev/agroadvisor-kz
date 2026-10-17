import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import { SHOP_DISTRICTS } from '@/shared/constants/districts'
import type { Shop } from '@/shared/types'
import { cn } from '@/shared/utils/cn'

interface DistrictCoverageCardProps {
  /** All shops of the directory; only active ones count as coverage. */
  shops: Shop[]
}

export function DistrictCoverageCard({ shops }: DistrictCoverageCardProps) {
  const { t } = useTranslation('shops', { keyPrefix: 'coverage' })
  const rows = SHOP_DISTRICTS.map((district) => {
    const active = shops.filter((shop) => shop.district === district && shop.status === 'active')
    return {
      district,
      shops: active.length,
      routes: active.reduce((sum, shop) => sum + shop.routes30d, 0),
    }
  })

  return (
    <Card>
      <CardHeader title={t('title')} subtitle={t('subtitle')} />
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li
            key={row.district}
            className={cn(
              '-mx-2 rounded-lg px-2 py-2',
              row.shops === 0 ? 'bg-danger-soft' : 'border-b border-border last:border-b-0',
            )}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'text-small font-semibold',
                  row.shops === 0 ? 'text-danger' : 'text-text',
                )}
              >
                {row.district}
              </span>
              <span className="text-small text-text-muted">{t('shops', { count: row.shops })}</span>
            </span>
            {row.shops === 0 ? (
              <span className="mt-0.5 block text-caption font-normal text-danger">
                {t('noShops')}
              </span>
            ) : (
              <span className="block text-caption font-normal text-text-muted">
                {t('routes', { count: row.routes })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
