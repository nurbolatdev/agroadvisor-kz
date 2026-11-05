import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText } from '@/components/ui'
import type { Language } from '@/i18n'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The three languages in the order of the design (screen 01), each with a line in the other languages: a
// person who reads only one of them finds their own. The second lines are fixed texts, the same whatever
// language the app shows.
const OPTIONS: readonly { code: Language; hint: string }[] = [
  { code: 'kk', hint: 'Kazakh' },
  { code: 'ru', hint: 'Russian' },
  { code: 'en', hint: 'Ағылшынша · Английский' },
]

type Props = {
  value: Language
  onSelect: (language: Language) => void
}

// The choice of the language (screen 01): one card, a row per language, a mark on the chosen one. It is
// used by the first launch screen and by the language screen of the profile.
export function LanguageList({ value, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <View accessibilityRole="radiogroup" style={styles.card}>
      {OPTIONS.map(({ code, hint }, index) => {
        const selected = code === value
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${t(`language.${code}`)}. ${hint}`}
            onPress={() => onSelect(code)}
            style={[styles.row, index > 0 && styles.divider, selected && styles.selected]}
          >
            <View style={styles.texts}>
              <AppText variant="h2">{t(`language.${code}`)}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {hint}
              </AppText>
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <Check size={sizes.iconSm} color={colors.white} /> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  selected: { backgroundColor: colors.primarySoft },
  texts: { flex: 1 },
  radio: {
    width: sizes.icon,
    height: sizes.icon,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
})
