import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { LANGUAGE_OPTIONS } from '@/shared/settings/settings'
import { useSettings } from '@/shared/settings/settingsContext'

/** Applies right away and is the same setting as the language on the settings page. */
export function LanguageSwitcher() {
  const { t } = useTranslation('layout')
  const { settings, updateSettings } = useSettings()

  return (
    <SegmentedControl
      label={t('language')}
      options={LANGUAGE_OPTIONS}
      value={settings.language}
      onChange={(language) => updateSettings({ language })}
      fullWidth
    />
  )
}
