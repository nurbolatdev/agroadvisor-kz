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

const STATUS_CHIPS: { value: ShopStatus | undefined; label: string }[] = [
  { value: undefined, label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'hidden', label: 'Скрытые' },
]

export function ShopFilters({ value, onChange }: ShopFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchBar
          label="Поиск магазина"
          placeholder="Название или адрес"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
        <Select
          aria-label="Район"
          value={value.district}
          onChange={(event) => onChange({ ...value, district: event.target.value })}
          options={[
            { value: '', label: 'Все районы' },
            ...SHOP_DISTRICTS.map((district) => ({ value: district, label: district })),
          ]}
          className="h-12"
        />
      </div>
      <div role="toolbar" aria-label="Статус магазина" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <Chip
            key={chip.label}
            selected={value.status === chip.value}
            onClick={() => onChange({ ...value, status: chip.value })}
          >
            {chip.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
