import { useFocusEffect, useRouter } from 'expo-router'
import { Globe, Leaf, LogOut, ShieldCheck } from 'lucide-react-native'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { AppText, Badge, ErrorState, Screen } from '@/components/ui'
import { initials } from '@/features/profile/describeUser'
import { MenuRow } from '@/features/profile/MenuRow'
import { agrochemistApi, useProfile, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { SPECIALIZATIONS } from '../application'
import { useVerification } from '../useVerification'
import { mapVerificationStatus } from '../verificationStatus'

// The profile tab of an agrochemist (frame 21a): the name with the state of the check, the experience, the
// documents, the specialization, the language, sign out. Not drawn, because the data is not there yet: the
// rating and the number of consultations (M14), and the notifications (M15). The documents row opens the
// documents screen: an approved profile only looks at its documents (they are locked), the others can add or
// remove them. An arrow stands only at a row that opens something, so "Specialization" has none (there is no
// screen to change it).
export function AgrochemistProfile() {
  const { t } = useTranslation()
  const router = useRouter()
  const { me, phase, error } = useProfile()
  const language = useSettings((s) => s.language)
  const logout = useSession((s) => s.logout)
  const { state, reload } = useVerification(agrochemistApi)
  const skipFirst = useRef(true)

  useFocusEffect(
    useCallback(() => {
      void useProfile.getState().load()
      // the first read is the hook's own; the next ones follow a document sent meanwhile
      if (skipFirst.current) skipFirst.current = false
      else void reload()
    }, [reload]),
  )

  const view = state.status === 'ready' ? state.view : null
  const ui = view ? mapVerificationStatus(view.status) : null
  const specializations = view
    ? SPECIALIZATIONS.filter((s) => view.specializations.includes(s))
        .map((s) => t(`register.qualification.specializations.${s}`))
        .join(', ')
    : ''
  const documentsValue = !view
    ? undefined
    : view.status === 'approved'
      ? t('agrochemist.profile.documentsChecked')
      : t(`agrochemist.status.${ui?.id ?? 'pending'}.title`)

  return (
    <Screen scroll>
      <AppText variant="h2" style={styles.title}>
        {t('tabs.profile')}
      </AppText>

      <View style={styles.block}>
        {me ? (
          <View style={styles.card}>
            <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
              <AppText variant="h1" color={colors.primaryDark}>
                {initials(me.fullName)}
              </AppText>
            </View>
            <View style={styles.texts}>
              <AppText variant="h2" numberOfLines={2}>
                {me.fullName}
              </AppText>
              {ui ? (
                <View style={styles.badge}>
                  <Badge
                    label={t(`agrochemist.status.${ui.id}.title`)}
                    tone={ui.tone}
                    icon={view?.status === 'approved' ? ShieldCheck : undefined}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ) : phase === 'failed' ? (
          <ErrorState
            message={t(`profile.errors.${error ?? 'server'}`)}
            onRetry={() => void useProfile.getState().load()}
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>

      {state.status === 'error' ? (
        // The state of the check could not be read: say so and offer to try again, the rest of the screen works
        <View style={styles.block}>
          <ErrorState message={t(`profile.errors.${state.reason}`)} onRetry={() => void reload()} />
        </View>
      ) : null}

      {view && view.experienceYears != null ? (
        <View style={[styles.block, styles.tile]}>
          <AppText variant="h1">
            {t('agrochemist.profile.years', { count: view.experienceYears })}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {t('agrochemist.profile.experience')}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.block, styles.menu]}>
        {view ? (
          <>
            <MenuRow
              icon={ShieldCheck}
              label={t('agrochemist.profile.documents')}
              value={documentsValue}
              onPress={() => router.push('/documents')}
            />
            {specializations ? (
              <>
                <View style={styles.divider} />
                <MenuRow
                  icon={Leaf}
                  label={t('agrochemist.profile.specialization')}
                  value={specializations}
                />
              </>
            ) : null}
            <View style={styles.divider} />
          </>
        ) : null}
        <MenuRow
          icon={Globe}
          label={t('language.title')}
          value={t(`language.${language}`)}
          onPress={() => router.push('/settings/language')}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.signOut')}
        onPress={() => void logout()}
        style={({ pressed }) => [styles.block, styles.signOut, pressed && styles.pressed]}
      >
        <LogOut size={sizes.icon} color={colors.danger} />
        <AppText variant="h2" color={colors.danger}>
          {t('auth.signOut')}
        </AppText>
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { textAlign: 'center' },
  block: { marginTop: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  texts: { flex: 1, gap: spacing.xs },
  badge: { alignSelf: 'flex-start' },
  tile: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  menu: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  divider: { height: 1, backgroundColor: colors.border },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
})
