import { daysAgo } from '@/mocks/time'
import type { Shop, ShopCategory } from '@/shared/types'

/**
 * More shops for a realistic directory size. Kegen district still has none.
 * Format: id; name; district; address; lat; lng; hours; categories; routes in 30 days; a/h(idden).
 */
const ROWS = `
s-19;Агро Алтын;Карасайский;с. Жандосово, ул. Абая, 27;43.1902;76.4983;Пн–Сб 08:00–18:00;fertilizers,seeds;19;a
s-20;Бидай;Карасайский;с. Умтыл, ул. Школьная, 6;43.2588;76.5472;Пн–Сб 09:00–18:00;seeds;6;a
s-21;Талгар Агросервис;Талгарский;г. Талгар, ул. Рыскулова, 15;43.2962;77.2311;Ежедневно 08:00–20:00;fungicides,insecticides;16;a
s-22;Жасыл Ел;Талгарский;с. Туздыбастау, ул. Жибек жолы, 41;43.3329;77.1924;Пн–Сб 09:00–19:00;seeds,fertilizers;4;a
s-23;АгроЛайн;Илийский;пос. Боралдай, ул. Сатпаева, 12;43.3449;76.8662;Пн–Сб 08:00–19:00;herbicides,fungicides;14;a
s-24;Дихан;Илийский;с. Байсерке, ул. Центральная, 22;43.4511;77.0398;Пн–Сб 09:00–18:00;equipment,seeds;8;a
s-25;Шелек Агро;Енбекшиказахский;с. Шелек, ул. Рыскулова, 3;43.5921;78.2462;Ежедневно 08:00–19:00;fertilizers,fungicides;12;a
s-26;Есик Тұқым;Енбекшиказахский;г. Есик, ул. Абая, 101;43.3612;77.4622;Пн–Сб 08:00–18:00;seeds;9;a
s-27;Байсерке Агро;Енбекшиказахский;с. Байсерке-Агро, ул. Жамбыла, 5;43.4103;77.6219;Пн–Пт 09:00–18:00;insecticides;3;a
s-28;Узынагаш Химпром;Жамбылский;с. Узынагаш, ул. Суюнбая, 18;43.2268;76.3154;Пн–Сб 08:00–19:00;fungicides,herbicides,insecticides;11;a
s-29;Самсы Агро;Жамбылский;с. Самсы, ул. Абая, 2;43.2876;75.6712;Пн–Сб 09:00–17:00;fertilizers;5;a
s-30;Кастек Тұқым;Жамбылский;с. Кастек, ул. Райымбека, 9;43.1155;76.0631;Пн–Сб 09:00–18:00;seeds,equipment;7;a
s-31;Агро Старт;Талгарский;с. Бельбулак, ул. Садовая, 14;43.2723;77.2865;Пн–Сб 09:00–18:00;seeds;0;h
s-32;Илийский Агроцентр;Илийский;с. Первомайский, ул. Мира, 7;43.4302;76.9218;Пн–Сб 08:00–17:00;fertilizers;0;h
`

export const extraShops: Shop[] = ROWS.trim()
  .split('\n')
  .map((row) => {
    const [id, name, district, address, lat, lng, hours, categories, routes, status] =
      row.split(';')
    const number = Number(id.slice(2))
    return {
      id,
      name,
      district,
      address,
      lat: Number(lat),
      lng: Number(lng),
      hours,
      phone: `+7 727 ${200 + number} 45 ${String(number).padStart(2, '0')}`,
      categories: categories.split(',') as ShopCategory[],
      status: status === 'h' ? 'hidden' : 'active',
      routes30d: Number(routes),
      updatedAt: daysAgo(number * 2),
    }
  })
