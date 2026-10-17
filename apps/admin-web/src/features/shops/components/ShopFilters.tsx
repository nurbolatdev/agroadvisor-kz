import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/Chip'
import { SearchBar } from '@/components/ui/SearchBar'
import { Select } from '@/components/ui/Select'
import { SHOP_DISTRICTS } from '@/shared/constants/districts'
import type { ShopStatus } from '@/shared/types'

export interface ShopFilterValue {
  search: string
  district: string
  status: ShopStatus | undefined
}

interface ShopFiltersProps {
  value: ShopFilterValue
  onChange: (value: ShopFilterValue) => void
}

const STATUS_CHIPS: (ShopStatus | undefined)[] = [undefined, 'active', 'hidden']

export function ShopFilters({ value, onChange }: ShopFiltersProps) {
  const { t } = useTranslation('shops', { keyPrefix: 'filters' })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchBar
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
        <Select
          aria-label={t('district')}
          value={value.district}
          onChange={(event) => onChange({ ...value, district: event.target.value })}
          options={[
            { value: '', label: t('allDistricts') },
            ...SHOP_DISTRICTS.map((district) => ({ value: district, label: district })),
          ]}
          className="h-12"
        />
      </div>
      <div role="toolbar" aria-label={t('status')} className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((status) => (
          <Chip
            key={status ?? 'all'}
            selected={value.status === status}
            onClick={() => onChange({ ...value, status })}
          >
            {t(`statuses.${status ?? 'all'}`)}
          </Chip>
        ))}
      </div>
    </div>
  )
}
