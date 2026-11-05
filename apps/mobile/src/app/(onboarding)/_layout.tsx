import { Stack } from 'expo-router'

// The screens before the sign-in that only a person who has not chosen a language sees (the root layout).
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
