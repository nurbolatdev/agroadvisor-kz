import { regionsApi } from '@/services'
import { useSettings } from '@/store/settings'
import { useRegions } from '@/features/auth/useRegions'

// The name of a region by its id, in the language of the app. The cards carry only the id; the list of regions
// is the one of the registration form. Until it is read, or if it cannot be, there is no name and the line
// is drawn without it: the region is an extra here, never a reason to fail.
export function useRegionName(): (id: number | null | undefined) => string | null {
  const language = useSettings((s) => s.language)
  const { state } = useRegions(regionsApi, language, true)

  return (id) => {
    if (id === null || id === undefined || state.status !== 'ready') return null
    return state.regions.find((region) => region.id === id)?.name ?? null
  }
}
