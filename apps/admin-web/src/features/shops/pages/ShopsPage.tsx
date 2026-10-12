import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import { PageHeader } from '@/components/ui/PageHeader'
import { DistrictCoverageCard } from '@/features/shops/components/DistrictCoverageCard'
import { ShopFilters, type ShopFilterValue } from '@/features/shops/components/ShopFilters'
import { ShopFormModal, type ShopFormTarget } from '@/features/shops/components/ShopFormModal'
import { ShopKpis } from '@/features/shops/components/ShopKpis'
import { ShopsTable } from '@/features/shops/components/ShopsTable'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'

export function ShopsPage() {
  const [filters, setFilters] = useState<ShopFilterValue>({
    search: '',
    district: '',
    status: undefined,
  })
  const [formTarget, setFormTarget] = useState<ShopFormTarget>()
  const stats = useApiQuery(() => api.getShopStats(), [])
  // Unfiltered list for the coverage card, independent of the table filters.
  const allShops = useApiQuery(() => api.getShops(), [])
  const shops = useApiQuery(
    () =>
      api.getShops({
        search: filters.search,
        district: filters.district || undefined,
        status: filters.status,
      }),
    [filters.search, filters.district, filters.status],
  )

  return (
    <>
      <PageHeader
        title="Агромагазины"
        subtitle="Справочник магазинов, к которым фермеры строят маршрут в 2GIS и Yandex Maps"
        actions={
          <Button icon={Plus} onClick={() => setFormTarget({})}>
            Добавить магазин
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <ShopKpis stats={stats.data} />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,640fr)_minmax(0,312fr)]">
          <section aria-label="Справочник" className="flex min-w-0 flex-col gap-3">
            <ShopFilters value={filters} onChange={setFilters} />
            {shops.data ? (
              <ShopsTable
                shops={shops.data}
                empty="Магазинов не найдено"
                extraColumns={[
                  {
                    key: 'edit',
                    header: '',
                    align: 'right',
                    render: (shop) => (
                      <Button size="sm" variant="ghost" onClick={() => setFormTarget({ shop })}>
                        Изменить
                      </Button>
                    ),
                  },
                ]}
              />
            ) : (
              <Loader />
            )}
          </section>
          {allShops.data ? <DistrictCoverageCard shops={allShops.data} /> : <Loader />}
        </div>
      </div>

      <ShopFormModal
        key={formTarget ? (formTarget.shop?.id ?? 'new') : 'closed'}
        target={formTarget}
        onClose={() => setFormTarget(undefined)}
        onSaved={() => {
          setFormTarget(undefined)
          shops.reload()
          allShops.reload()
          stats.reload()
        }}
      />
    </>
  )
}
