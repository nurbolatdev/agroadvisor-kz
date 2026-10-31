import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { LANGUAGES } from '@/i18n'
import { useSettings } from '@/store/settings'
import { colors, radii, sizes, spacing, typography } from '@/theme/tokens'

// Placeholder screen: proves theme, fonts, i18n and persisted language work.
// Replaced by the real navigation in M3.
export default function HomeScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{t('app.name')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
      <Text style={styles.status}>{t('home.scaffoldReady')}</Text>

      <Text style={styles.label}>{t('language.title')}</Text>
      <View style={styles.row}>
        {LANGUAGES.map((code) => {
          const selected = code === language
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setLanguage(code)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(`language.${code}`)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  title: { ...typography.display, color: colors.primaryDark },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  status: { ...typography.h2, color: colors.primary, marginTop: spacing.xl },
  label: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    minHeight: sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.small, color: colors.text },
  chipTextSelected: { color: colors.white },
})
