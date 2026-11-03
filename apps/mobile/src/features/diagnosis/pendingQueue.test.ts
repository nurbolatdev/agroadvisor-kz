import { createPendingQueue, type KeyValueStore, type QueueFiles } from './pendingQueue'
import type { PendingDiagnosis } from './pending'

function fakeStore(initial?: string): KeyValueStore & { raw(): string | undefined } {
  let value = initial
  return {
    getString: () => value,
    set: (_key, next) => {
      value = next
    },
    raw: () => value,
  }
}

function fakeFiles(present: string[] = []) {
  const files = new Set(present)
  const api: QueueFiles = {
    copyIn: async (_uri, name) => {
      const target = `file:///documents/${name}`
      files.add(target)
      return target
    },
    exists: (uri) => files.has(uri),
    remove: (uri) => {
      files.delete(uri)
    },
    list: () => [...files],
  }
  return { api, files }
}

const pending = (key: string): PendingDiagnosis => ({
  key,
  crop: 'tomato',
  fileUri: 'file:///cache/photo.jpg',
  createdAt: 1_700_000_000_000,
})

describe('pending queue', () => {
  it('copies the photo out of the cache and keeps the path to the copy', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })

    const stored = await queue.add(pending('key-12345678'))

    expect(stored.fileUri).toBe('file:///documents/key-12345678.jpg')
    expect(queue.list()).toEqual([{ pending: stored, status: 'ready' }])
  })

  it('survives a restart: a new queue over the same store sees the entry', async () => {
    const store = fakeStore()
    const files = fakeFiles()
    await createPendingQueue({ store, files: files.api }).add(pending('key-12345678'))

    const after = createPendingQueue({ store, files: files.api }).list()

    expect(after).toHaveLength(1)
    expect(after[0].pending.key).toBe('key-12345678')
  })

  it('keeps one entry per key', async () => {
    const queue = createPendingQueue({ store: fakeStore(), files: fakeFiles().api })
    await queue.add(pending('key-12345678'))
    await queue.add(pending('key-12345678'))
    expect(queue.list()).toHaveLength(1)
  })

  it('remove deletes both the record and the copy of the photo', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const stored = await queue.add(pending('key-12345678'))

    queue.remove('key-12345678')

    expect(queue.list()).toEqual([])
    expect(files.files.has(stored.fileUri)).toBe(false)
  })

  it('remove of an unknown key changes nothing', async () => {
    const queue = createPendingQueue({ store: fakeStore(), files: fakeFiles().api })
    await queue.add(pending('key-12345678'))
    queue.remove('other-key-1234')
    expect(queue.list()).toHaveLength(1)
  })

  it('removing an entry whose photo copy is already gone does not fail', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const stored = await queue.add(pending('key-12345678'))
    files.files.delete(stored.fileUri)

    expect(() => queue.remove('key-12345678')).not.toThrow()
    expect(queue.list()).toEqual([])
  })

  it('sweep deletes photo copies without a record and keeps the ones with a record', async () => {
    const files = fakeFiles(['file:///documents/orphan.jpg'])
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const stored = await queue.add(pending('key-12345678'))

    queue.sweep()
    queue.sweep() // calling it again changes nothing

    expect([...files.files]).toEqual([stored.fileUri])
    expect(queue.list()).toHaveLength(1)
  })

  it('release drops the record and keeps the photo', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const stored = await queue.add(pending('key-12345678'))

    expect(queue.release('key-12345678')).toBe(stored.fileUri)

    expect(queue.list()).toEqual([])
    expect(files.files.has(stored.fileUri)).toBe(true)
    expect(queue.release('key-12345678')).toBeNull()
  })

  it('sweep keeps the photos it is told to keep and deletes a released photo otherwise', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const kept = (await queue.add(pending('key-12345678'))).fileUri
    const other = (await queue.add(pending('key-87654321'))).fileUri
    queue.release('key-12345678')
    queue.release('key-87654321')

    queue.sweep([kept])

    expect([...files.files]).toEqual([kept])
    expect(files.files.has(other)).toBe(false)
  })

  it('sweep leaves alone a file whose record is still being written', async () => {
    const files = fakeFiles()
    let finishCopy: () => void = () => undefined
    const slow: QueueFiles = {
      ...files.api,
      copyIn: (uri, name) =>
        new Promise((resolve) => {
          finishCopy = () => resolve(files.api.copyIn(uri, name))
        }),
    }
    const queue = createPendingQueue({ store: fakeStore(), files: slow })

    const adding = queue.add(pending('key-12345678'))
    files.files.add('file:///documents/key-12345678.jpg') // the copy exists, the record does not yet
    queue.sweep()
    finishCopy()
    await adding

    expect(files.files.has('file:///documents/key-12345678.jpg')).toBe(true)
  })

  it('marks an entry whose photo copy is gone instead of failing', async () => {
    const files = fakeFiles()
    const queue = createPendingQueue({ store: fakeStore(), files: files.api })
    const stored = await queue.add(pending('key-12345678'))
    files.files.delete(stored.fileUri)

    expect(queue.list()).toEqual([{ pending: stored, status: 'fileMissing' }])
  })
})

describe('pending queue with broken data', () => {
  const warn = jest.fn()
  beforeEach(() => warn.mockClear())

  it('ignores a broken JSON and logs it', () => {
    const queue = createPendingQueue({
      store: fakeStore('{not json'),
      files: fakeFiles().api,
      warn,
    })
    expect(queue.list()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('ignores a value that is not a list', () => {
    const queue = createPendingQueue({
      store: fakeStore('{"a":1}'),
      files: fakeFiles().api,
      warn,
    })
    expect(queue.list()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drops broken records but keeps the good one', () => {
    const good = { version: 1, ...pending('key-12345678'), fileUri: 'file:///documents/a.jpg' }
    const raw = JSON.stringify([
      good,
      { ...good, key: 'key-87654321', version: 2 },
      { ...good, key: 'short' },
      { ...good, key: 'key-11111111', crop: 'banana' },
      { ...good, key: 'key-22222222', createdAt: 'yesterday' },
      null,
    ])
    const queue = createPendingQueue({
      store: fakeStore(raw),
      files: fakeFiles(['file:///documents/a.jpg']).api,
      warn,
    })

    const entries = queue.list()

    expect(entries.map((entry) => entry.pending.key)).toEqual(['key-12345678'])
    expect(warn).toHaveBeenCalledWith('[diagnosis] dropped 5 broken pending record(s)')
  })

  it('adds a new entry after a broken queue was dropped', async () => {
    const store = fakeStore('{not json')
    const queue = createPendingQueue({ store, files: fakeFiles().api, warn })
    await queue.add(pending('key-12345678'))
    expect(queue.list()).toHaveLength(1)
  })
})
