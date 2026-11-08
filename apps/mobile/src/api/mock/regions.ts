import type { Language } from '@/i18n'

import type { Region, RegionsApi } from '../regions'

type Options = { delayMs?: number }

// The ten regions the backend has (migration V16), in the same order as the backend sorts them for each language.
const ENTRIES: { id: number; code: string; names: Record<Language, string> }[] = [
  {
    id: 1,
    code: 'akmola',
    names: { ru: 'Акмолинская область', kk: 'Ақмола облысы', en: 'Akmola Region' },
  },
  {
    id: 2,
    code: 'aktobe',
    names: { ru: 'Актюбинская область', kk: 'Ақтөбе облысы', en: 'Aktobe Region' },
  },
  {
    id: 3,
    code: 'almaty',
    names: { ru: 'Алматинская область', kk: 'Алматы облысы', en: 'Almaty Region' },
  },
  {
    id: 4,
    code: 'east_kazakhstan',
    names: {
      ru: 'Восточно-Казахстанская область',
      kk: 'Шығыс Қазақстан облысы',
      en: 'East Kazakhstan Region',
    },
  },
  {
    id: 5,
    code: 'zhambyl',
    names: { ru: 'Жамбылская область', kk: 'Жамбыл облысы', en: 'Zhambyl Region' },
  },
  {
    id: 6,
    code: 'karaganda',
    names: { ru: 'Карагандинская область', kk: 'Қарағанды облысы', en: 'Karaganda Region' },
  },
  {
    id: 7,
    code: 'kostanay',
    names: { ru: 'Костанайская область', kk: 'Қостанай облысы', en: 'Kostanay Region' },
  },
  {
    id: 8,
    code: 'pavlodar',
    names: { ru: 'Павлодарская область', kk: 'Павлодар облысы', en: 'Pavlodar Region' },
  },
  {
    id: 9,
    code: 'north_kazakhstan',
    names: {
      ru: 'Северо-Казахстанская область',
      kk: 'Солтүстік Қазақстан облысы',
      en: 'North Kazakhstan Region',
    },
  },
  {
    id: 10,
    code: 'turkistan',
    names: { ru: 'Туркестанская область', kk: 'Түркістан облысы', en: 'Turkistan Region' },
  },
]

// Sorted as the backend sorts (the Russian and English lists are the order above; Kazakh puts its own letters
// in their places), so the screen is tried on the real order.
const KAZAKH_ORDER = [
  'akmola',
  'aktobe',
  'almaty',
  'zhambyl',
  'karaganda',
  'kostanay',
  'pavlodar',
  'north_kazakhstan',
  'turkistan',
  'east_kazakhstan',
]

export function createMockRegionsApi({ delayMs = 300 }: Options = {}): RegionsApi {
  return {
    async list(lang) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const sorted =
        lang === 'kk'
          ? KAZAKH_ORDER.map((code) => ENTRIES.find((entry) => entry.code === code)!)
          : lang === 'en'
            ? [...ENTRIES].sort((a, b) => a.names.en.localeCompare(b.names.en, 'en'))
            : ENTRIES
      return sorted.map<Region>((entry) => ({
        id: entry.id,
        code: entry.code,
        name: entry.names[lang],
      }))
    },
  }
}
