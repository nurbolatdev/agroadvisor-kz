import { useTranslation } from 'react-i18next'

import { AppText, Screen } from '@/components/ui'
import { colors } from '@/theme/tokens'

// The list of earlier diagnoses; the content comes in the next commits of M6.
export default function HistoryScreen() {
  const { t } = useTranslation()

  return (
    <Screen>
      <AppText variant="display" color={colors.primaryDark}>
        {t('history.title')}
      </AppText>
    </Screen>
  )
}
