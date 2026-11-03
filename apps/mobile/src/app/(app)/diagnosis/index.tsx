import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { CROPS } from '@/features/diagnosis/crops'
import { useDiagnosis } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// Screen 08, step 1: the crop is chosen before the photo.
export default function ChooseCropScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const crop = useDiagnosis((s) => s.crop)
  const selectCrop = useDiagnosis((s) => s.selectCrop)

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.chooseCrop')}
      </AppText>
      <AppText color={colors.textMuted} style={styles.hint}>
        {t('diagnosis.chooseCropHint')}
      </AppText>

      <View style={styles.grid}>
        {CROPS.map((code) => {
          const selected = code === crop
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => selectCrop(code)}
              style={[styles.tile, selected && styles.tileSelected]}
            >
              <AppText variant="h2" color={selected ? colors.white : colors.text}>
                {t(`diagnosis.crops.${code}`)}
              </AppText>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.actions}>
        <Button
          label={t('diagnosis.next')}
          disabled={crop === null}
          onPress={() => router.push('/diagnosis/camera')}
        />
        <Button label={t('diagnosis.result.home')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hint: { marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: sizes.control * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tileSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
})
