import { useTranslation } from 'react-i18next'

import { agoLabel } from './helpers'

// "40 min ago", "yesterday" or a short date for the time of a question or an answer
export function useAgeLabel(): (iso: string, now?: Date) => string {
  const { t, i18n } = useTranslation()
  return (iso, now = new Date()) => {
    const ago = agoLabel(iso, now, i18n.language)
    switch (ago.kind) {
      case 'minutes':
        return t('community.ago.minutes', { count: ago.value })
      case 'hours':
        return t('community.ago.hours', { count: ago.value })
      case 'yesterday':
        return t('community.ago.yesterday')
      default:
        return ago.value
    }
  }
}
