import * as SecureStore from 'expo-secure-store'

const REFRESH_KEY = 'auth.refreshToken'

// The refresh token is the long-lived credential, so it lives in the Keychain / Keystore.
// The access token stays in memory only.
export const tokenStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_KEY),
}
