import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, Button, Checkbox, ErrorState, Screen } from '@/components/ui'
import { CROPS } from '@/features/diagnosis/crops'
import { colors, spacing } from '@/theme/tokens'

import type { CommunityProblem } from './helpers'
import { useSubscriptions } from './useSubscriptions'

// The crops the farmer follows (no frame in Figma, laid out like the list with checkboxes of frame 21): the
// four MVP crops are boxes; codes the server holds outside that list are kept as they are when the set is saved.
export function CropsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, crops, load, save } = useSubscriptions()
  const [picked, setPicked] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<CommunityProblem | null>(null)

  useEffect(() => {
    load()
  }, [load])

  const checked = picked ?? crops
  const toggle = (crop: string, on: boolean) => {
    setProblem(null)
    setPicked(on ? [...checked.filter((c) => c !== crop), crop] : checked.filter((c) => c !== crop))
  }

  const submit = async () => {
    setSaving(true)
    const others = crops.filter((code) => !(CROPS as readonly string[]).includes(code))
    const result = await save([...others, ...checked.filter((c) => !others.includes(c))])
    setSaving(false)
    if (result) setProblem(result)
    else router.back()
  }

  return (
    <Screen scroll>
      <BackHeader
        title={t('community.crops.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : state.status === 'error' ? (
        <ErrorState
          title={t(
            state.reason === 'offline'
              ? 'community.problems.offline'
              : 'community.crops.loadFailed',
          )}
          onRetry={load}
        />
      ) : (
        <View style={styles.form}>
          <AppText color={colors.textMuted}>{t('community.crops.hint')}</AppText>
          <View style={styles.list}>
            {CROPS.map((crop) => (
              <Checkbox
                key={crop}
                checked={checked.includes(crop)}
                onChange={(on) => toggle(crop, on)}
                label={t(`diagnosis.crops.${crop}`)}
              />
            ))}
          </View>
          {problem ? (
            <AppText color={colors.danger} accessibilityRole="alert">
              {t(`community.problems.${problem}`)}
            </AppText>
          ) : null}
          <Button
            label={t('community.crops.save')}
            onPress={() => void submit()}
            loading={saving}
          />
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  list: { gap: spacing.sm },
  center: { paddingTop: spacing.xl, alignItems: 'center' },
})
