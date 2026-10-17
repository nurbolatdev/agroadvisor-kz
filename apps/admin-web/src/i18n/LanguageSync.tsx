import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/shared/settings/settingsContext'

/** Applies the language from the settings to i18next and to `<html lang>`. */
export function LanguageSync() {
  const { settings } = useSettings()
  const { i18n } = useTranslation()

  useEffect(() => {
    if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language)
    document.documentElement.lang = settings.language
  }, [i18n, settings.language])

  return null
}
