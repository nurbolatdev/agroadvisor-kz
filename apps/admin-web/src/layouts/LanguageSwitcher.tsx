import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { LANGUAGE_OPTIONS } from '@/shared/settings/settings'
import { useSettings } from '@/shared/settings/settingsContext'

/** Applies right away and is the same setting as "Язык" on the settings page. */
export function LanguageSwitcher() {
  const { settings, updateSettings } = useSettings()

  return (
    <SegmentedControl
      label="Язык интерфейса"
      options={LANGUAGE_OPTIONS}
      value={settings.language}
      onChange={(language) => updateSettings({ language })}
      fullWidth
    />
  )
}
