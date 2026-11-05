import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'

import { useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors } from '@/theme/tokens'

void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })
  const status = useSession((s) => s.status)
  const languageChosen = useSettings((s) => s.languageChosen)
  const restore = useSession((s) => s.restore)
  const ready = (fontsLoaded || fontError !== null) && status !== 'restoring'

  useEffect(() => {
    void restore()
  }, [restore])

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* Signed out: a person who has not chosen a language yet sees the language screen first; after
            "Continue" (or any choice of the language) the sign-in takes its place and stays. */}
        <Stack.Protected guard={status === 'signedOut' && !languageChosen}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut' && languageChosen}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
