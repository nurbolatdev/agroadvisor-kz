import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'

import { Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { agrochemistApi, useProfile, useSession } from '@/services'
import { colors } from '@/theme/tokens'

import { MissingDocumentScreen } from './MissingDocumentScreen'
import { useVerification } from './useVerification'

// How long the app waits behind a neutral cover for the state of the application, so an agrochemist whose
// application was never finished does not see the tabs flash by before the screen that asks for the document.
// After that the app is shown as it is: the offline queue, the language and sign-out never wait for the network.
export const ENTRY_COVER_MS = 1500

// What the app opens for an agrochemist whose application was never finished (the app was closed after the
// account was made and before the document was sent): the screen that asks for the document, over the app.
// Everybody else, and an agrochemist whose state cannot be read right now (no connection), gets the app as it
// is. The roles on the phone only decide what is shown, and the backend decides what is allowed.
//
// The app (the navigator in `children`) is always drawn in the same place of the tree and never rebuilt when
// the cover or the document screen comes and goes: the screens, and the place the person had reached, stay.
export function AgrochemistEntryGate({ children }: { children: ReactNode }) {
  const roles = useProfile((s) => s.roles)
  const agrochemist = hasAgrochemistRole(roles)
  const [covered, setCovered] = useState(false)

  return (
    <View style={styles.fill}>
      {/* under a cover the app must not be reached by a screen reader either */}
      <View
        style={styles.fill}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {agrochemist ? <VerificationCover onCovered={setCovered} /> : null}
    </View>
  )
}

function VerificationCover({ onCovered }: { onCovered: (covered: boolean) => void }) {
  const verification = useVerification(agrochemistApi)
  const logout = useSession((s) => s.logout)
  const { state, reload } = verification
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), ENTRY_COVER_MS)
    return () => clearTimeout(timer)
  }, [])

  // The state is read again when the person comes back to the app: an application that could not be asked
  // about at the start (no connection) is found out then
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reload()
    })
    return () => subscription.remove()
  }, [reload])

  const missing =
    state.status === 'ready' && state.view.status === 'pending' && state.view.documents.length === 0
  const waiting = state.status === 'loading' && !waited
  const covered = missing || waiting

  useEffect(() => {
    onCovered(covered)
  }, [covered, onCovered])

  if (!covered) return null
  return (
    <View style={StyleSheet.absoluteFill}>
      {missing ? (
        <MissingDocumentScreen
          sending={verification.uploading}
          onSend={(document) => verification.upload(document.file, { kind: 'diploma' })}
          onSignOut={() => void logout()}
        />
      ) : (
        <Screen>
          <View testID="entry-cover" style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </Screen>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
