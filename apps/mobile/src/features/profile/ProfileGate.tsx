import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { ErrorState, Screen } from '@/components/ui'
import { useProfile } from '@/services'
import { colors } from '@/theme/tokens'

// Lets the signed-in screens through only when the profile (GET /api/users/me) is there. The roles come
// from the profile alone, so until it is loaded nothing can say whether the person is a farmer or an
// agrochemist: a screen shown earlier would show the farmer's screens to an agrochemist for a moment.
// The cost: with no connection to the server the app does not open past this screen; the person can retry.
export function ProfileGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { phase, error } = useProfile()

  useEffect(() => {
    void useProfile.getState().load()
  }, [])

  if (phase === 'ready') return <>{children}</>

  return (
    <Screen>
      {phase === 'failed' ? (
        <ErrorState
          message={t(`profile.errors.${error ?? 'server'}`)}
          onRetry={() => void useProfile.getState().load()}
        />
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
})
