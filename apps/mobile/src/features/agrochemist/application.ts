import { create } from 'zustand'

import type { UploadFile, UploadMeta } from '@/api/agrochemist'
import type { RegisterBody } from '@/api/auth'

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

export type SubmitResult = 'sent' | 'failed' | 'busy' | 'incomplete'

type ApplicationState = {
  account: Account | null
  qualification: Qualification | null
  document: ApplicationDocument | null
  phase: ApplicationPhase
  failure: ApplicationFailure | null
  setAccount: (account: Account) => void
  setQualification: (qualification: Qualification) => void
  setDocument: (document: ApplicationDocument | null) => void
  // Registers (once) and then sends the document. Safe to press again: see the rules at the top of the store.
  submit: () => Promise<SubmitResult>
  // The person left the "application sent" screen: the app opens.
  finish: () => void
  reset: () => void
}

export type ApplicationDeps = {
  // Creates the account and the session, and keeps the router on the registration screens meanwhile.
  register: (body: RegisterBody) => Promise<void>
  upload: (file: UploadFile, meta: UploadMeta) => Promise<unknown>
  // How many documents the server already has; asked before a retry whose first try got no answer.
  documentCount: () => Promise<number>
  releaseEntry: () => void
  language: () => RegisterBody['language']
}

// The rules of the application of an agrochemist (registration at the end of step 2):
//  1. The account is created once. After a successful register the store never calls it again, whatever
//     happens to the document; a retry sends the document only.
//  2. Two presses in a row are one try: the second finds the first still running.
//  3. A send that got no answer (no connection) may have arrived. Before it is repeated the server is asked
//     how many documents it has, so a retry does not leave a duplicate.
//  4. Everything here is in memory. Nothing is saved, and the password is dropped as soon as the account exists.
//  5. If the app is closed after register, the next start finds a signed-in agrochemist whose profile has no
//     document; the profile status leads to the upload screen, not to this store.
export function createApplicationStore(deps: ApplicationDeps) {
  let working = false
  let registered = false
  // The last send ended without an answer: it may have reached the server.
  let sendUnconfirmed = false

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

    async submit() {
      if (working) return 'busy'
      const { account, qualification, document } = get()
      if (!qualification || !document || (!registered && !account)) return 'incomplete'
      working = true
      set({ failure: null })
      try {
        if (!registered) {
          set({ phase: 'registering' })
          try {
            await deps.register({
              fullName: account!.fullName.trim(),
              login: account!.login.trim(),
              password: account!.password,
              language: deps.language(),
              role: 'agrochemist',
              specializations: qualification.specializations,
              experienceYears: qualification.experienceYears,
            })
          } catch (error) {
            set({ phase: 'editing', failure: { stage: 'register', error } })
            return 'failed'
          }
          registered = true
          // The account exists; the password is not needed any more
          set({ phase: 'registered', account: account && { ...account, password: '' } })
        }

        set({ phase: 'uploading' })
        try {
          if (sendUnconfirmed && (await deps.documentCount()) > 0) {
            // The earlier try had reached the server after all
            sendUnconfirmed = false
            set({ phase: 'sent' })
            return 'sent'
          }
          await deps.upload(document.file, document.meta)
        } catch (error) {
          const problem = toUploadProblem(error)
          sendUnconfirmed = problem === 'offline'
          set({ phase: 'registered', failure: { stage: 'upload', problem } })
          return 'failed'
        }
        sendUnconfirmed = false
        set({ phase: 'sent' })
        return 'sent'
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
      set({ ...empty })
    },
  }))
}
