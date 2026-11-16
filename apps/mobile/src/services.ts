import { createAgrochemistApi } from '@/api/agrochemist'
import { createAgrochemistDirectoryApi } from '@/api/agrochemistDirectory'
import { createConsultationsApi } from '@/api/consultations'
import { createAuthApi } from '@/api/auth'
import { createApiClient } from '@/api/client'
import { API_MODE, API_URL } from '@/api/config'
import { createDiagnosisApi } from '@/api/diagnosis'
import { createDiseaseApi } from '@/api/diseases'
import { createMockAgrochemistApi } from '@/api/mock/agrochemist'
import { createMockAgrochemistDirectoryApi } from '@/api/mock/agrochemistDirectory'
import { createMockConsultationsApi } from '@/api/mock/consultations'
import { createMockAuthApi } from '@/api/mock/auth'
import { createMockDiagnosisApi } from '@/api/mock/diagnosis'
import { createMockDiseaseApi } from '@/api/mock/diseases'
import { createMockRegionsApi } from '@/api/mock/regions'
import { createRegionsApi } from '@/api/regions'
import { mockAccount } from '@/api/mock/account'
import { createMockNotificationsApi } from '@/api/mock/notifications'
import { createNotificationsApi } from '@/api/notifications'
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

const mockDiagnosis = API_MODE === 'mock' ? createMockDiagnosisApi() : null
export const diagnosisApi = mockDiagnosis ?? createDiagnosisApi(apiClient)

// The check of an agrochemist and the documents sent for it. In the mock mode the controls put the check
// in any of the four states and make the next upload fail, to try the screens without the backend.
const mockAgrochemist = API_MODE === 'mock' ? createMockAgrochemistApi() : null
export const agrochemistApi = mockAgrochemist?.api ?? createAgrochemistApi(apiClient)
export const agrochemistMockControls = mockAgrochemist?.controls ?? null

// What a farmer sees: the list of approved agrochemists and the request for a consultation.
export const agrochemistDirectoryApi =
  API_MODE === 'mock'
    ? createMockAgrochemistDirectoryApi()
    : createAgrochemistDirectoryApi(apiClient)
// In the mock mode an agrochemist answers by itself (accepts after 5 s, replies after 3 s), and the diagnosis
// a farmer attaches is the one the mock diagnosis made, so the whole chat can be tried without a backend.
export const consultationsApi =
  API_MODE === 'mock'
    ? createMockConsultationsApi({
        diagnosisOf: (id) => mockDiagnosis?.lookup(id),
        // like the backend: a diagnosis the farmer does not have is 404 on the request
        knownDiagnosis: (id) => mockDiagnosis?.lookup(id) !== undefined,
        simulate: {
          acceptAfterMs: 5_000,
          replyAfterMs: 3_000,
          // signed in as the agrochemist, a person answers the requests
          enabled: () => !mockAccount.current().roles.includes('agrochemist'),
        },
      })
    : createConsultationsApi(apiClient)

// The inbox of notifications (docs/api/notifications.md). In the mock mode it starts with a few, to try the
// screen: an answer in a chat, a decision on the profile.
const mockNotifications =
  API_MODE === 'mock'
    ? createMockNotificationsApi({
        seed: [
          {
            id: '00000000-0000-4000-c000-00000000a001',
            // only the types that need no reference (the backend checks the references of the others)
            type: 'verification_documents_requested',
            consultationId: null,
            messageId: null,
            diagnosisId: null,
            count: 1,
            createdAt: '2026-11-16T08:00:00Z',
            updatedAt: '2026-11-16T08:05:00Z',
            readAt: null,
          },
          {
            id: '00000000-0000-4000-c000-00000000a002',
            type: 'verification_approved',
            consultationId: null,
            messageId: null,
            diagnosisId: null,
            count: 1,
            createdAt: '2026-11-15T09:00:00Z',
            updatedAt: '2026-11-15T09:00:00Z',
            readAt: '2026-11-15T10:00:00Z',
          },
        ],
      })
    : null
export const notificationsApi = mockNotifications?.api ?? createNotificationsApi(apiClient)
export const notificationsMockControls = mockNotifications?.controls ?? null

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

// The regions of the registration form (public, asked for before there is an account)
export const regionsApi = API_MODE === 'mock' ? createMockRegionsApi() : createRegionsApi(apiClient)

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
