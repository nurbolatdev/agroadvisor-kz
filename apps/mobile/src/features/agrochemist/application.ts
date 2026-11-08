import { create } from 'zustand'

import type { UploadFile, UploadMeta } from '@/api/agrochemist'
import type { LoginRequest, RegisterBody } from '@/api/auth'
import { ApiError, NetworkError } from '@/api/errors'

import { toUploadProblem, type UploadProblem } from './errors'

export type Specialization = NonNullable<RegisterBody['specializations']>[number]

// The order the frame shows them in, and the order of the enum on the backend.
export const SPECIALIZATIONS: readonly Specialization[] = [
  'plant_protection',
  'agrochemistry',
  'phytopathology',
  'soil_science',
]

// Step 1 of the registration. The password lives here only: this store is never saved to the phone.
export type Account = { fullName: string; login: string; password: string }
// Step 2.
export type Qualification = { specializations: Specialization[]; experienceYears: number }
export type ApplicationDocument = { file: UploadFile; meta: UploadMeta }

// editing: nothing sent yet (or the registration failed); registering/uploading: a call is on its way;
// registered: the account exists, the document is not sent yet; sent: the application is complete.
export type ApplicationPhase = 'editing' | 'registering' | 'registered' | 'uploading' | 'sent'

export type ApplicationFailure =
  { stage: 'register'; error: unknown } | { stage: 'upload'; problem: UploadProblem }

// What one press of "Send for review" came to. The failure is given here, not read from the store afterwards:
// another screen that watches the store could have taken it first.
export type SubmitOutcome =
  | { result: 'sent'; failure: null }
  | { result: 'failed'; failure: ApplicationFailure }
  | { result: 'busy' | 'incomplete'; failure: null }

type ApplicationState = {
  account: Account | null
  qualification: Qualification | null
  document: ApplicationDocument | null
  phase: ApplicationPhase
  failure: ApplicationFailure | null
  setAccount: (account: Account) => void
  setQualification: (qualification: Qualification) => void
  setDocument: (document: ApplicationDocument | null) => void
  // The screen has shown the failure (for example by taking the person back to the field it is about)
  clearFailure: () => void
  // Registers (once) and then sends the document. Safe to press again: see the rules at the top of the store.
  submit: () => Promise<SubmitOutcome>
  // The person left the "application sent" screen: the app opens.
  finish: () => void
  reset: () => void
}

export type ApplicationDeps = {
  // Creates the account and the session, and keeps the router on the registration screens meanwhile.
  register: (body: RegisterBody) => Promise<void>
  // Signs in with the same data and keeps the router the same way; used when the answer to register was lost
  login: (body: LoginRequest) => Promise<void>
  upload: (file: UploadFile, meta: UploadMeta) => Promise<unknown>
  // How many documents the server already has; asked before a retry whose first try got no answer.
  documentCount: () => Promise<number>
  releaseEntry: () => void
  language: () => RegisterBody['language']
}

// A call that ended without a clear answer may have been done by the server all the same: no connection, a
// timeout, an error of the server after the write.
function mayHaveReachedTheServer(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)
}

// The problems of a send after which the document may be on the server (the same list as the one that makes
// the screens read the documents again, see useVerification)
const SEND_UNCONFIRMED: readonly UploadProblem[] = ['offline', 'generic', 'storage_unavailable']

// The rules of the application of an agrochemist (registration at the end of step 2):
//  1. The account is created once. After a successful register the store never calls it again, whatever
//     happens to the document; a retry sends the document only. If the answer to register was lost, the next
//     try signs in first (the account may exist) and registers only when it does not.
//  2. Two presses in a row are one try: the second finds the first still running. After "sent" a press
//     changes nothing.
//  3. A send that got no clear answer may have arrived. Before it is repeated the server is asked how many
//     documents it has, so a retry does not leave a duplicate. (A document chosen again after such a send is
//     not sent either when the server already has one: the application has its document.)
//  4. Everything here is in memory. Nothing is saved, and the password is dropped as soon as the account exists.
//  5. If the app is closed after register, the next start finds a signed-in agrochemist whose profile has no
//     document; the entry gate asks for the document, not this store.
//  6. Another person's session must not meet this store: it is reset when the signed-in user changes or signs
//     out (services.ts).
export function createApplicationStore(deps: ApplicationDeps) {
  let working = false
  let registered = false
  // The last send ended without a clear answer: it may have reached the server.
  let sendUnconfirmed = false
  // The last register ended without a clear answer: the account may exist.
  let registerUnconfirmed = false

  const empty = {
    account: null,
    qualification: null,
    document: null,
    phase: 'editing' as ApplicationPhase,
    failure: null,
  }

  return create<ApplicationState>((set, get) => ({
    ...empty,

    setAccount: (account) => set({ account }),
    setQualification: (qualification) => set({ qualification }),
    setDocument: (document) => set({ document }),
    clearFailure: () => set({ failure: null }),

    async submit() {
      if (working) return { result: 'busy', failure: null }
      if (get().phase === 'sent') return { result: 'sent', failure: null }
      const { account, qualification, document } = get()
      if (!qualification || !document || (!registered && !account)) {
        return { result: 'incomplete', failure: null }
      }
      working = true
      set({ failure: null })
      try {
        if (!registered) {
          set({ phase: 'registering' })
          try {
            const credentials = { login: account!.login.trim(), password: account!.password }
            // The earlier try got no clear answer: the account may be there, so sign in before registering
            // again (a second register would answer "login taken" about the person's own account)
            const signedIn = registerUnconfirmed && (await signInIfTheAccountExists(credentials))
            if (!signedIn) {
              await deps.register({
                fullName: account!.fullName.trim(),
                ...credentials,
                language: deps.language(),
                role: 'agrochemist',
                specializations: qualification.specializations,
                experienceYears: qualification.experienceYears,
              })
            }
          } catch (error) {
            registerUnconfirmed = mayHaveReachedTheServer(error)
            const failure: ApplicationFailure = { stage: 'register', error }
            set({ phase: 'editing', failure })
            return { result: 'failed', failure }
          }
          registered = true
          registerUnconfirmed = false
          // The account exists; the password is not needed any more
          set({ phase: 'registered', account: account && { ...account, password: '' } })
        }

        set({ phase: 'uploading' })
        try {
          if (sendUnconfirmed && (await deps.documentCount()) > 0) {
            // The earlier try had reached the server after all
            sendUnconfirmed = false
            set({ phase: 'sent' })
            return { result: 'sent', failure: null }
          }
          await deps.upload(document.file, document.meta)
        } catch (error) {
          const problem = toUploadProblem(error)
          sendUnconfirmed = SEND_UNCONFIRMED.includes(problem)
          const failure: ApplicationFailure = { stage: 'upload', problem }
          set({ phase: 'registered', failure })
          return { result: 'failed', failure }
        }
        sendUnconfirmed = false
        set({ phase: 'sent' })
        return { result: 'sent', failure: null }
      } finally {
        working = false
      }
    },

    finish() {
      deps.releaseEntry()
      get().reset()
    },

    reset() {
      // Not while a call is on its way: the result would come back to an empty store
      if (working) return
      registered = false
      sendUnconfirmed = false
      registerUnconfirmed = false
      set({ ...empty })
    },
  }))

  // true: signed in, the account was there; false: no such account (the register can go on)
  async function signInIfTheAccountExists(credentials: LoginRequest): Promise<boolean> {
    try {
      await deps.login(credentials)
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false
      throw error
    }
  }
}
