import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { BackHeader, Screen } from '@/components/ui'
import { LanguageList } from '@/features/language/LanguageList'
import { useSettings } from '@/store/settings'
import { spacing } from '@/theme/tokens'

// The language of the app, opened from the profile. A tap applies it at once (the texts of this screen
// change under the finger), and the arrow goes back. It is the same setting as on the first launch screen
// and on the sign-in screen, not a copy.
export default function LanguageSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)

  return (
    <Screen>
      <BackHeader
        title={t('language.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      <View style={{ marginTop: spacing.lg }}>
        <LanguageList value={language} onSelect={setLanguage} />
      </View>
    </Screen>
  )
}
