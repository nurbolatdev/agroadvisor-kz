import type { PendingDiagnosis } from './pending'
import type { QueueEntry } from './pendingQueue'
import { queueRow, queueRows } from './queueView'

const pending = (key: string): PendingDiagnosis => ({
  key,
  crop: 'tomato',
  fileUri: `file:///documents/${key}.jpg`,
  createdAt: 1_700_000_000_000,
})
const ready = (key: string): QueueEntry => ({ pending: pending(key), status: 'ready' })
const idle = { phase: 'idle', pending: null, failure: null } as const

describe('queue rows', () => {
  it('an entry nobody works on waits and can be retried or removed', () => {
    expect(queueRow(ready('key-00000001'), idle)).toMatchObject({
      status: 'waiting',
      actions: ['retry', 'discard'],
    })
  })

  it('the entry being sent is "sending" and has no buttons', () => {
    const row = queueRow(ready('key-00000001'), {
      phase: 'sending',
      pending: pending('key-00000001'),
      failure: null,
    })
    expect(row).toMatchObject({ status: 'sending', actions: [] })
  })

  it('the entry that failed shows why and can be retried or removed', () => {
    const row = queueRow(ready('key-00000001'), {
      phase: 'failed',
      pending: pending('key-00000001'),
      failure: { messageKey: 'diagnosis.errors.network', action: 'retry' },
    })
    expect(row).toEqual({
      pending: pending('key-00000001'),
      status: 'error',
      messageKey: 'diagnosis.errors.network',
      actions: ['retry', 'discard'],
    })
  })

  it('an entry whose photo is gone offers a new photo instead of a retry', () => {
    const row = queueRow({ pending: pending('key-00000001'), status: 'fileMissing' }, idle)
    expect(row).toMatchObject({ status: 'photoLost', actions: ['newPhoto', 'discard'] })
    expect(row.actions).not.toContain('retry')
  })

  it('the state of one entry does not leak to the others', () => {
    const rows = queueRows([ready('key-00000001'), ready('key-00000002')], {
      phase: 'sending',
      pending: pending('key-00000002'),
      failure: null,
    })
    expect(rows.map((r) => r.status)).toEqual(['waiting', 'sending'])
  })
})
