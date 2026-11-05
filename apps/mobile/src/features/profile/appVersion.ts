import Constants from 'expo-constants'

// The version of the app from its configuration (app.json), or null when it is not known: the profile
// then shows no version line.
export function appVersion(): string | null {
  const version = Constants.expoConfig?.version
  return version ? version : null
}
