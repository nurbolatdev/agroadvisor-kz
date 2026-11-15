import type { AgrochemistCard, AgrochemistDirectoryApi } from '../agrochemistDirectory'
import { clampPaging } from '../agrochemistDirectory'
import { ApiError } from '../errors'

type Options = { delayMs?: number }

// Sorted like the backend sorts: the most experienced first.
export const MOCK_AGROCHEMISTS: AgrochemistCard[] = [
  {
    id: '00000000-0000-4000-9000-000000000003',
    fullName: 'Динара Ким',
    crops: ['potato', 'tomato'],
    specializations: ['phytopathology'],
    regionId: 7,
    experienceYears: 15,
    verifiedAt: '2026-10-01T09:00:00Z',
  },
  {
    id: '00000000-0000-4000-9000-000000000001',
    fullName: 'Айгуль Сарсенова',
    crops: ['corn', 'tomato'],
    specializations: ['plant_protection'],
    regionId: 7,
    experienceYears: 12,
    verifiedAt: '2026-10-02T09:00:00Z',
  },
  {
    id: '00000000-0000-4000-9000-000000000002',
    fullName: 'Бауыржан Оспанов',
    crops: ['corn', 'wheat'],
    specializations: ['agrochemistry', 'soil_science'],
    regionId: 3,
    experienceYears: 8,
    verifiedAt: '2026-10-03T09:00:00Z',
  },
]

// Works without the backend: the same filters, paging and 404 as GET /api/agrochemists.
export function createMockAgrochemistDirectoryApi({
  delayMs = 400,
}: Options = {}): AgrochemistDirectoryApi {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))

  return {
    list: async (query = {}) => {
      await wait()
      const { page, size } = clampPaging(query.page, query.size)
      // a blank crop means no filter, like on the backend
      const crop = query.crop?.trim()
      const matching = MOCK_AGROCHEMISTS.filter(
        (a) =>
          (!crop || a.crops.includes(crop)) &&
          (query.regionId === undefined || a.regionId === query.regionId),
      )
      return matching.slice(page * size, page * size + size)
    },
    get: async (id) => {
      await wait()
      const found = MOCK_AGROCHEMISTS.find((a) => a.id === id)
      if (!found) throw new ApiError(404, 'agrochemist_not_found', 'Agrochemist not found')
      return found
    },
  }
}
