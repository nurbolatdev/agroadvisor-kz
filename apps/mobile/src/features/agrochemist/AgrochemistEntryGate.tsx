import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { Screen } from '@/components/ui'
import { agrochemistApi, useProfile, useSession } from '@/services'
import { colors } from '@/theme/tokens'

import { MissingDocumentScreen } from './MissingDocumentScreen'
import { useVerification } from './useVerification'

// What the app opens for an agrochemist whose application was never finished (the app was closed after the
// account was made and before the document was sent): the screen that asks for the document. Everybody else,
// and an agrochemist whose state cannot be read right now (no connection), gets the app as it is: the roles on
// the phone only decide what is shown, and a person must not be shut out of the offline queue or the language
// because the check of the application cannot be read. The backend decides what is allowed.
export function AgrochemistEntryGate({ children }: { children: ReactNode }) {
  const roles = useProfile((s) => s.roles)
  if (!roles?.includes('agrochemist')) return <>{children}</>
  return <VerificationEntry>{children}</VerificationEntry>
}

function VerificationEntry({ children }: { children: ReactNode }) {
  const verification = useVerification(agrochemistApi)
  const logout = useSession((s) => s.logout)
  const { state } = verification

  if (state.status === 'loading') {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    )
  }
  if (
    state.status === 'ready' &&
    state.view.status === 'pending' &&
    state.view.documents.length === 0
  ) {
    return (
      <MissingDocumentScreen
        sending={verification.uploading}
        onSend={(document) => verification.upload(document.file, { kind: 'diploma' })}
        onSignOut={() => void logout()}
      />
    )
  }
  return <>{children}</>
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
