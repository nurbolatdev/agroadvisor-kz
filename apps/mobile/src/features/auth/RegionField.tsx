import { Check, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { RegionsApi } from '@/api/regions'
import { AppText, ErrorState } from '@/components/ui'
import type { Language } from '@/i18n'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { useRegions } from './useRegions'

type Props = {
  api: RegionsApi
  language: Language
  // the chosen region (the name is what the row shows), or null when none is chosen
  value: { id: number; name: string } | null
  onChange: (region: { id: number; name: string } | null) => void
}

// The "Region" row of the registration form (frame 03): the name of the chosen region and an arrow; a tap opens
// a sheet with the list. The field is optional (the backend takes a registration with no region), so the sheet
// also has "Do not say" and a list that cannot be loaded does not stop the form.
export function RegionField({ api, language, value, onChange }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const { state, reload } = useRegions(api, language, open)
  const choose = (region: { id: number; name: string } | null) => {
    onChange(region)
    setOpen(false)
  }
  const shown = value?.name ?? t('register.region.placeholder')

  return (
    <View style={styles.wrapper}>
      <AppText variant="caption" color={colors.textMuted}>
        {t('register.region.label')}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('register.region.label')}. ${shown}`}
        onPress={() => {
          // the keyboard of the field typed in before would cover the list
          Keyboard.dismiss()
          setOpen(true)
        }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <AppText
          variant="body"
          color={value ? colors.text : colors.textMuted}
          style={styles.value}
          numberOfLines={1}
        >
          {shown}
        </AppText>
        <ChevronRight size={sizes.iconMd} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('register.region.close')}
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <AppText variant="h2" style={styles.title}>
            {t('register.region.title')}
          </AppText>
          {state.status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : state.status === 'error' ? (
            <ErrorState
              message={t(`register.region.errors.${state.reason}`)}
              onRetry={() => void reload()}
            />
          ) : (
            <ScrollView>
              <Option
                label={t('register.region.none')}
                selected={value === null}
                onPress={() => choose(null)}
              />
              {state.regions.map((region) => (
                <Option
                  key={region.id}
                  label={region.name}
                  selected={value?.id === region.id}
                  onPress={() => choose({ id: region.id, name: region.name })}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  )
}

function Option({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <AppText variant="body" style={styles.value}>
        {label}
      </AppText>
      {selected ? <Check size={sizes.iconMd} color={colors.primary} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
  value: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.glassScrim },
  sheet: {
    maxHeight: '70%',
    paddingTop: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.bg,
  },
  title: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  center: { minHeight: sizes.listPlaceholder, alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.lg,
  },
})
