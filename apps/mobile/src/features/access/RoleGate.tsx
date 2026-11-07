import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import type { Me } from '@/api/users'
import { Button, ErrorState, Screen } from '@/components/ui'
import { useProfile, useSession } from '@/services'
import { colors, spacing } from '@/theme/tokens'

type Role = Me['roles'][number]

// Wrap the screens whose content depends on the role (the tabs of a farmer or of an agrochemist, the
// screens of an agrochemist). The rest of the app (the offline queue of diagnoses, the history, the
// language, sign-out) does not use this gate and opens without the profile.
//
//  - The roles are known (the answer of the server, or the ones saved on the phone): the children are shown
//    at once; the answer of the server, when it comes, replaces the roles and the children are drawn again.
//  - Neither is known: a wait screen with "Try again" and "Sign out".
//
// A role on the phone only decides what is shown. What a person may do is decided by the backend (403).
export function RoleGate({ children }: { children: (roles: Role[]) => ReactNode }) {
  const { t } = useTranslation()
  const roles = useProfile((s) => s.roles)
  const phase = useProfile((s) => s.phase)
  const error = useProfile((s) => s.error)
  const logout = useSession((s) => s.logout)

  useEffect(() => {
    void useProfile.getState().load()
  }, [])

  if (roles) return <>{children(roles)}</>

  return (
    <Screen>
      {phase === 'failed' ? (
        <View style={styles.failed}>
          <ErrorState
            message={t(`profile.errors.${error ?? 'server'}`)}
            onRetry={() => void useProfile.getState().load()}
          />
          <Button label={t('auth.signOut')} variant="secondary" onPress={() => void logout()} />
        </View>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { flex: 1, justifyContent: 'center', gap: spacing.lg },
})
