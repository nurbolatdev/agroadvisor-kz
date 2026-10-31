import { createAuthApi } from '@/api/auth'
import { createApiClient } from '@/api/client'
import { API_MODE, API_URL } from '@/api/config'
import { createMockAuthApi } from '@/api/mock/auth'
import { tokenStorage } from '@/lib/tokenStorage'
import { createSessionStore } from '@/store/session'

// Wiring of the real objects: API client <-> session. Screens import from here.
// The client needs the session (token, refresh) and the session needs the auth API, which uses
// the client without a token, so the session is created first and the client reads it lazily.
const authClient = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
})

export const authApi = API_MODE === 'mock' ? createMockAuthApi() : createAuthApi(authClient)

export const useSession = createSessionStore({ authApi, tokens: tokenStorage })

export const apiClient = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => useSession.getState().accessToken,
  refreshAccessToken: () => useSession.getState().refreshAccessToken(),
})
