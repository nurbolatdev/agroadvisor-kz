import { Leaf, TriangleAlert } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
  AppText,
  Badge,
  Button,
  Chip,
  EmptyState,
  GlassCard,
  Input,
  ProgressBar,
  Screen,
} from '@/components/ui'
import { LANGUAGES } from '@/i18n'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

// Placeholder screen: shows the UI kit on device. Replaced by the real navigation in M3.
export default function HomeScreen() {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)
  const [text, setText] = useState('')

  return (
    <Screen scroll>
      <AppText variant="display" color={colors.primaryDark}>
        {t('app.name')}
      </AppText>
      <AppText color={colors.textMuted} style={styles.gap}>
        {t('app.tagline')}
      </AppText>

      <AppText variant="caption" color={colors.textMuted} style={styles.section}>
        {t('language.title')}
      </AppText>
      <View style={styles.row}>
        {LANGUAGES.map((code) => (
          <Chip
            key={code}
            label={t(`language.${code}`)}
            selected={code === language}
            onPress={() => setLanguage(code)}
          />
        ))}
      </View>

      <View style={styles.hero}>
        <GlassCard>
          <View style={styles.row}>
            <Badge label="OK" tone="success" icon={Leaf} />
            <Badge label="!" tone="danger" icon={TriangleAlert} />
          </View>
          <AppText variant="h2" style={styles.gap}>
            87%
          </AppText>
          <ProgressBar value={0.87} />
        </GlassCard>
      </View>

      <View style={styles.stack}>
        <Input label="Input" value={text} onChangeText={setText} placeholder="..." />
        <Input label="Input" error="Error" />
        <Button label="Primary" icon={Leaf} onPress={() => {}} />
        <Button label="Secondary" variant="secondary" onPress={() => {}} />
        <Button label="Danger" variant="danger" onPress={() => {}} />
        <Button label="Ghost" variant="ghost" compact onPress={() => {}} />
        <EmptyState />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  hero: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: spacing.xl,
    backgroundColor: colors.primary,
  },
  stack: { gap: spacing.md, marginTop: spacing.xl },
})
