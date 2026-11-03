import { isCrop } from './crops'
import { IDEMPOTENCY_KEY_PATTERN, type PendingDiagnosis } from './pending'

// The offline queue: diagnoses the farmer asked for that are not answered yet. It survives a restart of the
// app, so the key and the compressed file stay together until the server has answered. The photo from the
// camera or the gallery lies in the cache, which the system may clear, so the queue keeps its own copy in
// the documents folder. Only the name of the copy is stored, not its address: the address of the documents
// folder on iOS contains an id that changes when the app is updated or installed again, and a stored
// absolute path would then point at nothing although the file is there.

const QUEUE_KEY = 'diagnosis.queue'
const RECORD_VERSION = 1

type StoredRecord = {
  version: typeof RECORD_VERSION
  key: string
  crop: PendingDiagnosis['crop']
  fileName: string
  createdAt: number
}

export type KeyValueStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

export type QueueFiles = {
  // Copies the file into a folder the system does not clean and returns the address of the copy.
  copyIn(uri: string, name: string): Promise<string>
  // the current address of a stored copy, built from its name
  resolve(name: string): string
  exists(uri: string): boolean
  remove(uri: string): void
  // every file the queue's folder holds
  list(): string[]
}

// "ready" can be sent. "fileMissing": the record is there but the copy of the photo is gone, so the entry
// cannot be sent; the farmer sees an error and takes a new photo.
export type QueueEntry = { pending: PendingDiagnosis; status: 'ready' | 'fileMissing' }

export type PendingQueue = {
  add(pending: PendingDiagnosis): Promise<PendingDiagnosis>
  list(): QueueEntry[]
  remove(key: string): void
  // The answer came: the record leaves the queue but the photo stays, for the result screen. Returns the
  // address of the kept photo, or null when the key is not in the queue.
  release(key: string): string | null
  // Deletes photo copies that no record points to and that are not in `keep`. The copy is made before
  // the record is written, so a crash between the two leaves such a file behind; photos of answers of
  // this session are passed in `keep` and the rest (those of a previous run) go.
  sweep(keep?: readonly string[]): void
}

const fileName = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1)

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.version === RECORD_VERSION &&
    typeof record.key === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.test(record.key) &&
    isCrop(record.crop) &&
    typeof record.fileName === 'string' &&
    record.fileName.length > 0 &&
    !record.fileName.includes('/') &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt)
  )
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

  // adds that have copied their file but not yet written the record; sweep must not touch their files
  let adding = 0

  const toPending = (record: StoredRecord): PendingDiagnosis => ({
    key: record.key,
    crop: record.crop,
    fileUri: files.resolve(record.fileName),
    createdAt: record.createdAt,
  })

  return {
    async add(pending) {
      adding += 1
      try {
        const name = `${pending.key}.jpg`
        await files.copyIn(pending.fileUri, name)
        const stored: PendingDiagnosis = { ...pending, fileUri: files.resolve(name) }
        const others = read().filter((record) => record.key !== pending.key)
        write([
          ...others,
          {
            version: RECORD_VERSION,
            key: pending.key,
            crop: pending.crop,
            fileName: name,
            createdAt: pending.createdAt,
          },
        ])
        return stored
      } finally {
        adding -= 1
      }
    },

    sweep(keep = []) {
      if (adding > 0) return
      const referenced = new Set([
        ...read().map((record) => record.fileName),
        ...keep.map(fileName),
      ])
      for (const uri of files.list()) {
        if (!referenced.has(fileName(uri))) files.remove(uri)
      }
    },

    list() {
      return read().map((record) => {
        const pending = toPending(record)
        return {
          pending,
          status: files.exists(pending.fileUri) ? ('ready' as const) : ('fileMissing' as const),
        }
      })
    },

    release(key) {
      const records = read()
      const target = records.find((record) => record.key === key)
      if (!target) return null
      write(records.filter((record) => record.key !== key))
      return files.resolve(target.fileName)
    },

    // Removes the record and the copy of the photo.
    remove(key) {
      const records = read()
      const target = records.find((record) => record.key === key)
      write(records.filter((record) => record.key !== key))
      if (target) files.remove(files.resolve(target.fileName))
    },
  }
}
