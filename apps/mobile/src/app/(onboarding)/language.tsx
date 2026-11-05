import { Sprout } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { LanguageList } from '@/features/language/LanguageList'
import { useSettings } from '@/store/settings'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The first launch (screen 01): the person picks the language of the app. The choice is applied with
// "Continue", not on every tap, so the texts do not jump while the person looks around; the row that is
// marked at first is the language of the phone, a guess the person confirms or changes. Once it is
// applied the app is past this screen for good (the root layout) and goes to the sign-in.
export default function LanguageScreen() {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)
  const [selected, setSelected] = useState(language)

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Sprout size={sizes.logoIcon} color={colors.white} />
        </View>
        <AppText variant="display" color={colors.primaryDark} style={styles.name}>
          {t('app.name')}
        </AppText>
        <AppText variant="body" color={colors.textMuted}>
          {t('onboarding.tagline')}
        </AppText>

        <View style={styles.choose}>
          <AppText variant="h2">{t('onboarding.chooseLanguage')}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {t('onboarding.chooseLanguageOthers')}
          </AppText>
        </View>
        <LanguageList value={selected} onSelect={setSelected} />
      </View>

      <View style={styles.bottom}>
        <Button label={t('onboarding.continue')} onPress={() => setLanguage(selected)} />
        <AppText variant="small" color={colors.textMuted} style={styles.later}>
          {t('onboarding.changeLater')}
        </AppText>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: { flex: 1, gap: spacing.lg },
  logo: {
    width: sizes.logo,
    height: sizes.logo,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  name: { marginTop: spacing.sm },
  choose: { marginTop: spacing.lg, gap: spacing.xs },
  bottom: { gap: spacing.md },
  later: { textAlign: 'center' },
})
