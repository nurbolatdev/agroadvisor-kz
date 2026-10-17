import type { BadgeTone } from '@/components/ui/Badge'
import type { Shop, ShopCategory, ShopRequestType } from '@/shared/types'

/** Order of the category chips; labels are in the `shops` translations. */
export const SHOP_CATEGORIES: ShopCategory[] = [
  'fungicides',
  'insecticides',
  'herbicides',
  'fertilizers',
  'seeds',
  'equipment',
]

export const REQUEST_TYPE_TONES: Record<ShopRequestType, BadgeTone> = {
  new_shop: 'info',
  wrong_info: 'warning',
  closed: 'danger',
}

/** Links that open the shop in external navigators, built from coordinates. */
export const navigatorLinks = ({ lat, lng }: Pick<Shop, 'lat' | 'lng'>) => ({
  twoGis: `https://2gis.kz/geo/${lng},${lat}`,
  yandex: `https://yandex.kz/maps/?pt=${lng},${lat}&z=17`,
})
