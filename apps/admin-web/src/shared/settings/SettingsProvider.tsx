import { type ReactNode, useCallback, useMemo, useState } from 'react'
import {
  type AdminSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  storeSettings,
} from '@/shared/settings/settings'
import { SettingsContext } from '@/shared/settings/settingsContext'

/**
 * Admin settings kept on the client for now (React Context + localStorage).
 * Later they move to the API; pages read them through `useSettings` and will not change.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AdminSettings>(loadSettings)

  const updateSettings = useCallback((patch: Partial<AdminSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      storeSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    storeSettings(DEFAULT_SETTINGS)
    setSettings(DEFAULT_SETTINGS)
  }, [])

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
