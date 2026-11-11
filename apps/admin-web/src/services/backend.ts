import { API_BASE_URL } from '@/services/config'
import { createHttpClient, type HttpClient } from '@/services/http'
import { createAuthApi, createBrowserTokenStorage, createSession } from '@/services/session'

/**
 * The one session and HTTP client of the app. They depend on each other (the client takes tokens from the
 * session, the session calls the auth endpoints through the client), hence the late binding.
 */
let client: HttpClient

export const session = createSession({
  api: createAuthApi(() => client),
  storage: createBrowserTokenStorage(),
})

export const httpClient: HttpClient = (client = createHttpClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => session.getAccessToken(),
  refreshAccessToken: () => session.refresh(),
  onSessionExpired: () => session.expire(),
}))
