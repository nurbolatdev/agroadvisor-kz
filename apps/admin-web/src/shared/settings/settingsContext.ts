import { createContext, useContext } from 'react'
import type { AdminSettings } from '@/shared/settings/settings'

export interface SettingsContextValue {
  settings: AdminSettings
  /** Applies and persists changes right away. */
  updateSettings: (patch: Partial<AdminSettings>) => void
  resetSettings: () => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside SettingsProvider')
  return value
}
