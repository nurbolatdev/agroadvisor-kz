import type { BadgeTone } from '@/components/ui/Badge'
import type { Shop, ShopCategory, ShopRequestType } from '@/shared/types'

export const SHOP_CATEGORIES: Record<ShopCategory, string> = {
  fungicides: 'Фунгициды',
  insecticides: 'Инсектициды',
  herbicides: 'Гербициды',
  fertilizers: 'Удобрения',
  seeds: 'Семена',
  equipment: 'Инвентарь',
}

export const REQUEST_TYPES: Record<ShopRequestType, { label: string; tone: BadgeTone }> = {
  new_shop: { label: 'Новый магазин', tone: 'info' },
  wrong_info: { label: 'Ошибка в данных', tone: 'warning' },
  closed: { label: 'Магазин закрыт', tone: 'danger' },
}

/** Links that open the shop in external navigators, built from coordinates. */
export const navigatorLinks = ({ lat, lng }: Pick<Shop, 'lat' | 'lng'>) => ({
  twoGis: `https://2gis.kz/geo/${lng},${lat}`,
  yandex: `https://yandex.kz/maps/?pt=${lng},${lat}&z=17`,
})
