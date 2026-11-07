import { Stack } from 'expo-router'

import { ProfileGate } from '@/features/profile/ProfileGate'

// The signed-in screens open only after the profile is loaded (see ProfileGate): the role decides what
// a person sees, and the role is known from the profile alone.
export default function AppLayout() {
  return (
    <ProfileGate>
      <Stack screenOptions={{ headerShown: false }} />
    </ProfileGate>
  )
}
