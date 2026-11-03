import { isCrop } from './crops'
import { IDEMPOTENCY_KEY_PATTERN, type PendingDiagnosis } from './pending'

// The offline queue: diagnoses the farmer asked for that are not answered yet. It survives a restart of the
// app, so the key and the compressed file stay together until the server has answered. The photo from the
// camera or the gallery lies in the cache, which the system may clear, so the queue keeps its own copy in
// the documents folder and stores the path to that copy.

const QUEUE_KEY = 'diagnosis.queue'
const RECORD_VERSION = 1

type StoredRecord = { version: typeof RECORD_VERSION } & PendingDiagnosis

export type KeyValueStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

export type QueueFiles = {
  // Copies the file into a folder the system does not clean and returns the address of the copy.
  copyIn(uri: string, name: string): Promise<string>
  exists(uri: string): boolean
  remove(uri: string): void
}

// "ready" can be sent. "fileMissing": the record is there but the copy of the photo is gone, so the entry
// cannot be sent; the farmer sees an error and takes a new photo.
export type QueueEntry = { pending: PendingDiagnosis; status: 'ready' | 'fileMissing' }

export type PendingQueue = {
  add(pending: PendingDiagnosis): Promise<PendingDiagnosis>
  list(): QueueEntry[]
  remove(key: string): void
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.version === RECORD_VERSION &&
    typeof record.key === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.test(record.key) &&
    isCrop(record.crop) &&
    typeof record.fileUri === 'string' &&
    record.fileUri.length > 0 &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt)
  )
}

function toPending(record: StoredRecord): PendingDiagnosis {
  return {
    key: record.key,
    crop: record.crop,
    fileUri: record.fileUri,
    createdAt: record.createdAt,
  }
}

export function createPendingQueue(deps: {
  store: KeyValueStore
  files: QueueFiles
  warn?: (message: string, detail?: unknown) => void
}): PendingQueue {
  const { store, files } = deps
  const warn = deps.warn ?? ((message, detail) => console.warn(message, detail))

  // A broken record is thrown away with a log line and never stops the start of the app.
  function read(): StoredRecord[] {
    const raw = store.getString(QUEUE_KEY)
    if (raw === undefined) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      warn('[diagnosis] pending queue is not valid JSON, dropped', error)
      return []
    }
    if (!Array.isArray(parsed)) {
      warn('[diagnosis] pending queue is not a list, dropped')
      return []
    }
    const valid = parsed.filter(isStoredRecord)
    if (valid.length !== parsed.length) {
      warn(`[diagnosis] dropped ${parsed.length - valid.length} broken pending record(s)`)
    }
    return valid
  }

  function write(records: StoredRecord[]): void {
    store.set(QUEUE_KEY, JSON.stringify(records))
  }

  return {
    async add(pending) {
      const copy = await files.copyIn(pending.fileUri, `${pending.key}.jpg`)
      const stored: PendingDiagnosis = { ...pending, fileUri: copy }
      const others = read().filter((record) => record.key !== pending.key)
      write([...others, { version: RECORD_VERSION, ...stored }])
      return stored
    },

    list() {
      return read().map((record) => ({
        pending: toPending(record),
        status: files.exists(record.fileUri) ? ('ready' as const) : ('fileMissing' as const),
      }))
    },

    // Removes the record and the copy of the photo.
    remove(key) {
      const records = read()
      const target = records.find((record) => record.key === key)
      write(records.filter((record) => record.key !== key))
      if (target) files.remove(target.fileUri)
    },
  }
}
