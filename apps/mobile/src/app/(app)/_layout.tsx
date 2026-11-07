import { Stack } from 'expo-router'
import { useEffect } from 'react'

import { useProfile } from '@/services'

// The signed-in screens open at once. The profile is asked for in the background: it renews the roles saved
// on the phone. Only the screens that depend on the role wait for them (RoleGate); the offline queue, the
// history, the language and sign-out never do.
export default function AppLayout() {
  useEffect(() => {
    void useProfile.getState().load()
  }, [])
  return <Stack screenOptions={{ headerShown: false }} />
}
