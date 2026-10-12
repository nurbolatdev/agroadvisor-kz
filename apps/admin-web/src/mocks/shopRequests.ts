import { daysAgo, hoursAgo, minutesAgo } from '@/mocks/time'
import type { ShopRequest } from '@/shared/types'

/** Requests farmers sent from the app: 2 new shops, 2 data errors, 1 closed shop. */
export const mockShopRequests: ShopRequest[] = [
  {
    id: 'r-1',
    type: 'new_shop',
    payload: {
      name: 'Агромаркет Кеген',
      address: 'с. Кеген, ул. Абая, 15',
      district: 'Кегенский',
      comment: 'В районе нет ни одного магазина, ездим в Шелек за 90 км',
    },
    author: { name: 'Ерлан Т.', district: 'Талгарский р-н' },
    createdAt: hoursAgo(2),
    status: 'new',
  },
  {
    id: 'r-2',
    type: 'new_shop',
    payload: {
      name: 'Береке Семена',
      address: 'с. Каскелен, ул. Наурызбай батыра, 40',
      district: 'Карасайский',
      comment: 'Новый магазин семян, открылся в октябре',
    },
    author: { name: 'Айгерим Н.', district: 'Карасайский р-н' },
    createdAt: hoursAgo(5),
    status: 'new',
  },
  {
    id: 'r-3',
    type: 'wrong_info',
    shopId: 's-6',
    payload: { comment: 'Изменились часы работы: теперь Пн–Вс 08:00–21:00' },
    author: { name: 'Болат М.', district: 'Талгарский р-н' },
    createdAt: hoursAgo(9),
    status: 'new',
  },
  {
    id: 'r-4',
    type: 'wrong_info',
    shopId: 's-10',
    payload: { comment: 'Магазин переехал на ул. Ауэзова, 81 — навигатор ведёт на пустой участок' },
    author: { name: 'Марат С.', district: 'Илийский р-н' },
    createdAt: daysAgo(1),
    status: 'new',
  },
  {
    id: 'r-5',
    type: 'closed',
    shopId: 's-12',
    payload: { comment: 'Магазин закрылся в сентябре, на двери объявление об аренде' },
    author: { name: 'Жанна А.', district: 'Илийский р-н' },
    createdAt: minutesAgo(50),
    status: 'new',
  },
]
