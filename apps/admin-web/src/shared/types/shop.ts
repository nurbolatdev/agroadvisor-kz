import type { IsoDateTime } from '@/shared/types/common'

export type ShopCategory =
  'fungicides' | 'insecticides' | 'herbicides' | 'fertilizers' | 'seeds' | 'equipment'

export type ShopStatus = 'active' | 'hidden'

export interface Shop {
  id: string
  name: string
  district: string
  address: string
  lat: number
  lng: number
  /** Free text, e.g. "Пн–Сб 08:00–19:00". */
  hours: string
  /** Visible to admins only; farmers have no call button. */
  phone: string
  categories: ShopCategory[]
  /** Hidden shops stay in the directory but are not shown in the app. */
  status: ShopStatus
  /** Routes farmers built to this shop in the last 30 days. */
  routes30d: number
  updatedAt: IsoDateTime
}

/** Fields the admin edits in the shop form. */
export type ShopInput = Pick<
  Shop,
  'name' | 'district' | 'address' | 'lat' | 'lng' | 'hours' | 'phone' | 'categories'
>

export type ShopRequestType = 'new_shop' | 'wrong_info' | 'closed'
export type ShopRequestStatus = 'new' | 'done' | 'rejected'

/** Request a farmer sent from the mobile app. */
export interface ShopRequest {
  id: string
  type: ShopRequestType
  /** The shop the request is about; absent for `new_shop`. */
  shopId?: string
  payload: { name?: string; address?: string; district?: string; comment: string }
  author: { name: string; district: string }
  createdAt: IsoDateTime
  status: ShopRequestStatus
}

export interface ShopStats {
  total: number
  addedThisMonth: number
  routes30d: number
  routesChangePercent: number
  districtsWithoutShop: number
  pendingRequests: number
}
