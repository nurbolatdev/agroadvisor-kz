import { Check, Lock } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { useLockedBack } from '@/features/auth/useLockedBack'
import { useApplication } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// Screen 03b: the application of an agrochemist is sent. The session is already open; the router has been
// kept on the registration screens until now, and "Open the app" lets the person into the app. The only way
// out is that button: the registration is over, nothing before this screen can be used again.
export default function ApplicationSentScreen() {
  const { t } = useTranslation()
  const finish = useApplication((s) => s.finish)
  useLockedBack(true)

  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.mark}>
          <Check size={sizes.successIcon} color={colors.primary} strokeWidth={3} />
        </View>
        <AppText variant="h1" style={styles.text}>
          {t('register.sent.title')}
        </AppText>
        <AppText variant="small" color={colors.textMuted} style={styles.text}>
          {t('register.sent.hint')}
        </AppText>

        <View style={styles.card}>
          <AppText variant="h2">{t('register.sent.whileChecking')}</AppText>
          <Line icon="check" label={t('register.sent.canFillProfile')} />
          <Line icon="check" label={t('register.sent.canReadCommunity')} />
          <Line icon="lock" label={t('register.sent.hiddenFromFarmers')} />
        </View>
      </View>

      <Button label={t('register.sent.openApp')} onPress={finish} />
    </Screen>
  )
}

function Line({ icon, label }: { icon: 'check' | 'lock'; label: string }) {
  const Icon = icon === 'check' ? Check : Lock
  return (
    <View style={styles.line}>
      <Icon size={sizes.iconSm} color={icon === 'check' ? colors.primary : colors.textMuted} />
      <AppText variant="small" style={styles.lineText}>
        {label}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: spacing.md },
  mark: {
    alignSelf: 'center',
    width: sizes.successMark,
    height: sizes.successMark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  text: { textAlign: 'center' },
  card: {
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lineText: { flex: 1 },
})
