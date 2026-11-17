import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronRight, CloudSun, Plus, Sprout } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import type { Field } from '@/api/fields'
import { AppText, BackHeader, EmptyState, ErrorState, Screen } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { isCrop } from '@/features/diagnosis/crops'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { formatArea } from './helpers'
import { useFields } from './useFields'

// The fields of a farmer (screen 06): a card each with the crop, the area and the name; "+" adds one. The
// frame also shows a map piece, a status chip (disease, check, watering) and the district: the server has
// no such data for a field yet, so they are not drawn.
export function FieldsScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { state, load } = useFields()
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const cropName = (field: Field) =>
    isCrop(field.crop) ? t(`diagnosis.crops.${field.crop}`) : field.crop
  const line = (field: Field) =>
    `${cropName(field)} · ${formatArea(field.area, i18n.language)} ${t(`fields.units.${field.areaUnit}`)}`

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.back}>
          <BackHeader
            title={t('fields.title')}
            backLabel={t('common.back')}
            onBack={() => router.back()}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('fields.add')}
          hitSlop={spacing.sm}
          onPress={() => router.push('/fields/new')}
          style={styles.add}
        >
          <Plus size={sizes.icon} color={colors.primary} />
        </Pressable>
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : state.status === 'error' ? (
        <ErrorState message={t(`fields.errors.${state.reason}`)} onRetry={load} />
      ) : state.items.length === 0 ? (
        <EmptyState
          title={t('fields.none')}
          message={t('fields.noneHint')}
          actionLabel={t('fields.add')}
          onAction={() => router.push('/fields/new')}
        />
      ) : (
        <ScrollView testID="fields-list" contentContainerStyle={styles.content}>
          {state.failed ? (
            <AppText variant="small" color={colors.danger}>
              {t('fields.refreshFailed')}
            </AppText>
          ) : null}
          {state.items.map((field) => (
            <View key={field.id} style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${field.name}, ${line(field)}`}
                onPress={() => router.push({ pathname: '/fields/[id]', params: { id: field.id } })}
                style={({ pressed }) => [styles.open, pressed && styles.pressed]}
              >
                <View style={styles.icon}>
                  <Sprout size={sizes.icon} color={colors.primary} />
                </View>
                <View style={styles.text}>
                  <AppText variant="h2" numberOfLines={1}>
                    {field.name}
                  </AppText>
                  <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                    {line(field)}
                  </AppText>
                </View>
                <ChevronRight size={sizes.icon} color={colors.textMuted} />
              </Pressable>
              {field.location && isFeatureEnabled('weather') ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('fields.weather')}: ${field.name}`}
                  hitSlop={spacing.sm}
                  onPress={() =>
                    router.push({ pathname: '/weather', params: { fieldId: field.id } })
                  }
                  style={({ pressed }) => [styles.weather, pressed && styles.pressed]}
                >
                  <CloudSun size={sizes.icon} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { flex: 1 },
  add: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: spacing.xl },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weather: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  icon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xs },
})
