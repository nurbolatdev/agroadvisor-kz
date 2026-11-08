import { useFocusEffect, useRouter } from 'expo-router'
import { Globe, History, LogOut } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { AppText, ErrorState, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { AgrochemistProfile } from '@/features/agrochemist/cabinet/AgrochemistProfile'
import { appVersion } from '@/features/profile/appVersion'
import { MenuRow } from '@/features/profile/MenuRow'
import { UserCard } from '@/features/profile/UserCard'
import { useProfile, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The profile tab (screen 21): who is signed in, the language, the history, sign out, the version of the app.
// Only what exists is here; the frame also has counters, notifications, "My fields" and "Help", which come
// with their sections. The profile is asked for when the tab opens; when it cannot be loaded, the rest of
// the screen still works, so a person can still change the language or sign out.
export default function ProfileScreen() {
  const roles = useProfile((s) => s.roles)
  // An agrochemist has his own profile (frame 21a); the tabs wait for the roles, so they are known here
  if (hasAgrochemistRole(roles)) return <AgrochemistProfile />
  return <FarmerProfile />
}

function FarmerProfile() {
  const { t } = useTranslation()
  const router = useRouter()
  const { me, phase, error } = useProfile()
  const language = useSettings((s) => s.language)
  const logout = useSession((s) => s.logout)
  const version = appVersion()

  useFocusEffect(
    useCallback(() => {
      void useProfile.getState().load()
    }, []),
  )

  return (
    <Screen scroll>
      <AppText variant="h2" style={styles.title}>
        {t('tabs.profile')}
      </AppText>

      <View style={styles.block}>
        {me ? (
          <UserCard me={me} />
        ) : phase === 'failed' ? (
          <ErrorState
            message={t(`profile.errors.${error ?? 'server'}`)}
            onRetry={() => void useProfile.getState().load()}
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>

      <View style={[styles.block, styles.menu]}>
        <MenuRow
          icon={Globe}
          label={t('language.title')}
          value={t(`language.${language}`)}
          onPress={() => router.push('/settings/language')}
        />
        <View style={styles.divider} />
        <MenuRow
          icon={History}
          label={t('history.title')}
          onPress={() => router.push('/history')}
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

      {version ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.version}>
          {t('profile.version', { version })}
        </AppText>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { textAlign: 'center' },
  block: { marginTop: spacing.lg },
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
  version: { marginTop: spacing.xl, textAlign: 'center' },
})
