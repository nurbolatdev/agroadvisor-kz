import { createAuthApi } from '@/api/auth'
import { createApiClient } from '@/api/client'
import { API_MODE, API_URL } from '@/api/config'
import { createDiagnosisApi } from '@/api/diagnosis'
import { createMockAuthApi } from '@/api/mock/auth'
import { createMockDiagnosisApi } from '@/api/mock/diagnosis'
import { preparePhoto } from '@/features/diagnosis/photo'
import { expoPhotoToolkit } from '@/features/diagnosis/photoToolkit'
import { tokenStorage } from '@/lib/tokenStorage'
import { createDiagnosisStore } from '@/store/diagnosis'
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

export const diagnosisApi =
  API_MODE === 'mock' ? createMockDiagnosisApi() : createDiagnosisApi(apiClient)

// The flow of one diagnosis: crop, photo, compression once, send with a stable Idempotency-Key.
export const useDiagnosis = createDiagnosisStore({
  api: diagnosisApi,
  prepare: async (photo) => {
    const prepared = await preparePhoto(photo, expoPhotoToolkit)
    if (__DEV__) {
      // Whether the platform's manipulator writes metadata is learned from this line on real phones;
      // it does not block anything, the metadata is cut out either way.
      console.log(
        '[diagnosis] photo prepared:',
        `${prepared.width}x${prepared.height}, ${prepared.bytes} bytes,`,
        prepared.removedMetadata.length > 0
          ? `metadata written by the manipulator and cut out: ${prepared.removedMetadata.join(', ')}`
          : 'the manipulator wrote no metadata',
      )
    }
    return prepared
  },
})
