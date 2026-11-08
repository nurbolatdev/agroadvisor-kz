import { createAgrochemistApi } from '@/api/agrochemist'
import { createAuthApi } from '@/api/auth'
import { createApiClient } from '@/api/client'
import { API_MODE, API_URL } from '@/api/config'
import { createDiagnosisApi } from '@/api/diagnosis'
import { createDiseaseApi } from '@/api/diseases'
import { createMockAgrochemistApi } from '@/api/mock/agrochemist'
import { createMockAuthApi } from '@/api/mock/auth'
import { createMockDiagnosisApi } from '@/api/mock/diagnosis'
import { createMockDiseaseApi } from '@/api/mock/diseases'
import { createMockUsersApi } from '@/api/mock/users'
import { createUsersApi } from '@/api/users'
import { createApplicationStore } from '@/features/agrochemist/application'
import { shouldResetApplication } from '@/features/agrochemist/applicationLifecycle'
import { createDiseaseCatalog } from '@/features/diseases/catalog'
import { createPendingQueue } from '@/features/diagnosis/pendingQueue'
import { preparePhoto } from '@/features/diagnosis/photo'
import { expoPhotoToolkit } from '@/features/diagnosis/photoToolkit'
import { expoQueueFiles } from '@/features/diagnosis/queueFiles'
import { onSignedIn } from '@/lib/languageOnSignIn'
import { createRolesCache } from '@/lib/rolesCache'
import { storage } from '@/lib/storage'
import { tokenStorage } from '@/lib/tokenStorage'
import { onUserChange } from '@/lib/userChange'
import { createDiagnosisStore } from '@/store/diagnosis'
import { createHistoryStore } from '@/store/history'
import { createProfileStore } from '@/store/profile'
import { createSessionStore } from '@/store/session'
import { useSettings } from '@/store/settings'
import { createVerificationStore } from '@/store/verification'

// Wiring of the real objects: API client <-> session. Screens import from here.
// The client needs the session (token, refresh) and the session needs the auth API, which uses
// the client without a token, so the session is created first and the client reads it lazily.
const authClient = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
  getLanguage: () => useSettings.getState().language,
})

export const authApi = API_MODE === 'mock' ? createMockAuthApi() : createAuthApi(authClient)

const USER_ID_KEY = 'session.userId'

export const useSession = createSessionStore({
  authApi,
  tokens: tokenStorage,
  // the id of the user is not a secret; it is kept so the app knows whose queue to show while offline
  userIds: {
    get: () => storage.getString(USER_ID_KEY) ?? null,
    set: (userId) => {
      if (userId === null) storage.remove(USER_ID_KEY)
      else storage.set(USER_ID_KEY, userId)
    },
  },
})

export const apiClient = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => useSession.getState().accessToken,
  refreshAccessToken: () => useSession.getState().refreshAccessToken(),
  getLanguage: () => useSettings.getState().language,
})

export const diagnosisApi =
  API_MODE === 'mock' ? createMockDiagnosisApi() : createDiagnosisApi(apiClient)

// The check of an agrochemist and the documents sent for it. In the mock mode the controls put the check
// in any of the four states and make the next upload fail, to try the screens without the backend.
const mockAgrochemist = API_MODE === 'mock' ? createMockAgrochemistApi() : null
export const agrochemistApi = mockAgrochemist?.api ?? createAgrochemistApi(apiClient)
export const agrochemistMockControls = mockAgrochemist?.controls ?? null

// The state of that check, one for the whole app: the entry gate and the screens of an agrochemist read it
// from here, so the server is asked once. Reset together with the profile (see onUserChange).
export const useVerificationStore = createVerificationStore({ api: agrochemistApi })

// The application of an agrochemist (registration at the end of step 2, then the document). In memory only.
// The session is opened with "hold": the router keeps the registration screens until the person leaves
// the "application sent" screen.
export const useApplication = createApplicationStore({
  register: (body) => useSession.getState().register(body, { hold: true }),
  login: (body) => useSession.getState().login(body, { hold: true }),
  upload: (file, meta) => agrochemistApi.upload(file, meta),
  documentCount: async () => (await agrochemistApi.verification()).documents.length,
  releaseEntry: () => useSession.getState().releaseEntry(),
  language: () => useSettings.getState().language,
})

// An application belongs to the session it was made in (see shouldResetApplication)
useSession.subscribe((state, previous) => {
  if (shouldResetApplication(state, previous)) useApplication.getState().reset()
})

export const diseaseApi = API_MODE === 'mock' ? createMockDiseaseApi() : createDiseaseApi(apiClient)

// The reference of diseases in the language the farmer chose; the cache follows a change of language.
export const diseaseCatalog = createDiseaseCatalog(
  diseaseApi,
  () => useSettings.getState().language,
)

// The offline queue belongs to the signed-in user: another farmer on the same phone does not see it.
const pendingQueue = createPendingQueue({
  store: storage,
  files: expoQueueFiles,
  currentUser: () => useSession.getState().userId,
})

// The flow of one diagnosis: crop, photo, compression once, send with a stable Idempotency-Key.
export const useDiagnosis = createDiagnosisStore({
  api: diagnosisApi,
  queue: pendingQueue,
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

// The history of the signed-in farmer: pages of GET /api/diagnoses. Reset together with the answers below.
export const useHistory = createHistoryStore({ api: diagnosisApi })

export const usersApi = API_MODE === 'mock' ? createMockUsersApi() : createUsersApi(apiClient)

// The profile of the signed-in user: GET /api/users/me. Reset together with the history.
// The last roles are kept on the phone (stale while revalidate), so the app knows them before the answer.
export const useProfile = createProfileStore({
  api: usersApi,
  rolesCache: createRolesCache(storage),
  currentUser: () => useSession.getState().userId,
})

// Another farmer may sign in on the same phone: see onUserChange for what happens then.
useSession.subscribe((state, previous) =>
  onUserChange(state, previous, {
    diagnosis: useDiagnosis.getState(),
    history: useHistory.getState(),
    profile: useProfile.getState(),
    verification: useVerificationStore.getState(),
  }),
)

// A signed-in person who never picked a language is not asked for one after signing out: see onSignedIn.
useSession.subscribe((state, previous) => onSignedIn(state, previous, useSettings.getState()))

// Diagnoses that were not answered before the app was closed wait in the queue; the store learns of them now.
useDiagnosis.getState().restore()
