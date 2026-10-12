import { useState } from 'react'
import type { AdminSettings } from '@/shared/settings/settings'
import { useSettings } from '@/shared/settings/settingsContext'

/**
 * Unsaved edits on top of the saved settings. Only changed fields are kept, so a change
 * made elsewhere (e.g. the language switcher in the sidebar) shows up here immediately.
 */
export function useSettingsDraft() {
  const { settings, updateSettings } = useSettings()
  const [patch, setPatch] = useState<Partial<AdminSettings>>({})

  const draft: AdminSettings = { ...settings, ...patch }
  const isDirty = (Object.keys(patch) as (keyof AdminSettings)[]).some(
    (key) => JSON.stringify(patch[key]) !== JSON.stringify(settings[key]),
  )

  return {
    draft,
    isDirty,
    change: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) =>
      setPatch((current) => ({ ...current, [key]: value })),
    save: () => {
      updateSettings(patch)
      setPatch({})
    },
    discard: () => setPatch({}),
  }
}
