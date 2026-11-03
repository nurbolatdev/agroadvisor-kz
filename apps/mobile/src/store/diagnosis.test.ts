import { createApiClient } from '@/api/client'
import { type DiagnosisApi, type DiagnosisResult, createDiagnosisApi } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { PhotoError, type PickedPhoto } from '@/features/diagnosis/photo'
import type { PendingDiagnosis } from '@/features/diagnosis/pending'
import { createPendingQueue } from '@/features/diagnosis/pendingQueue'

import { createDiagnosisStore } from './diagnosis'

const PHOTO: PickedPhoto = { uri: 'file:///camera/IMG_1.jpg', width: 4000, height: 3000 }

function result(status: DiagnosisResult['status'] = 'ok'): DiagnosisResult {
  const top1 = { code: 'tomato__late_blight', confidence: 0.8 }
  return {
    id: 'd1',
    crop: 'tomato',
    status,
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    createdAt: '2026-11-03T10:00:00Z',
  }
}

// The real queue over memory instead of MMKV and the documents folder.
function memoryQueue() {
  let raw: string | undefined
  const files = new Set<string>()
  const queue = createPendingQueue({
    store: {
      getString: () => raw,
      set: (_key, value) => {
        raw = value
      },
    },
    files: {
      copyIn: async (_uri, name) => {
        const copy = `file:///documents/${name}`
        files.add(copy)
        return copy
      },
      exists: (uri) => files.has(uri),
      remove: (uri) => {
        files.delete(uri)
      },
      list: () => [...files],
    },
    warn: () => undefined,
  })
  return { queue, files }
}

function setup(outcomes: (DiagnosisResult | Error)[]) {
  const sent: PendingDiagnosis[] = []
  const memory = memoryQueue()
  const api: DiagnosisApi = {
    create: jest.fn(async (pending) => {
      sent.push(pending)
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      return next ?? result()
    }),
  }
  const prepare = jest.fn(async (photo: PickedPhoto) => ({ uri: `${photo.uri}.prepared.jpg` }))
  let keys = 0
  const useDiagnosis = createDiagnosisStore({
    api,
    prepare,
    queue: memory.queue,
    newKey: () => `key-0000000${(keys += 1)}`,
    now: () => 1_700_000_000_000,
  })
  return { useDiagnosis, sent, prepare, ...memory }
}

async function start(useDiagnosis: ReturnType<typeof setup>['useDiagnosis']) {
  useDiagnosis.getState().selectCrop('tomato')
  useDiagnosis.getState().setPhoto(PHOTO)
  await useDiagnosis.getState().analyze()
}

describe('diagnosis flow', () => {
  it('prepares the photo, creates one pending diagnosis and sends it', async () => {
    const { useDiagnosis, sent, prepare } = setup([result()])

    await start(useDiagnosis)

    const s = useDiagnosis.getState()
    expect(s.phase).toBe('done')
    expect(s.result?.status).toBe('ok')
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(1)
    expect(s.pending).toEqual({
      key: 'key-00000001',
      crop: 'tomato',
      // the queue keeps its own copy of the prepared file
      fileUri: 'file:///documents/key-00000001.jpg',
      createdAt: 1_700_000_000_000,
    })
  })

  it('after a timeout the retry button sends the same key and the same file', async () => {
    // one automatic retry fails as well, so the farmer sees the error and presses "Retry"
    const { useDiagnosis, sent, prepare } = setup([
      new NetworkError(),
      new NetworkError(),
      result(),
    ])

    await start(useDiagnosis)
    expect(useDiagnosis.getState().phase).toBe('failed')
    expect(useDiagnosis.getState().failure).toEqual({
      messageKey: 'diagnosis.errors.network',
      action: 'retry',
    })

    await useDiagnosis.getState().retry()

    expect(useDiagnosis.getState().phase).toBe('done')
    expect(sent).toHaveLength(3)
    expect(new Set(sent.map((p) => p.key))).toEqual(new Set(['key-00000001']))
    expect(new Set(sent.map((p) => p.fileUri))).toEqual(
      new Set(['file:///documents/key-00000001.jpg']),
    )
    expect(prepare).toHaveBeenCalledTimes(1) // the original is not compressed again
  })

  it('retries a lost connection once by itself with the same key and file', async () => {
    const { useDiagnosis, sent } = setup([new NetworkError(), result()])

    await start(useDiagnosis)

    expect(useDiagnosis.getState().phase).toBe('done')
    expect(useDiagnosis.getState().attempts).toBe(2)
    expect(sent[0]).toBe(sent[1])
  })

  it('does not retry by itself when the server answered with an error', async () => {
    const { useDiagnosis, sent } = setup([
      new ApiError(503, 'ai_unavailable', 'AI is down'),
      result(),
    ])

    await start(useDiagnosis)

    expect(useDiagnosis.getState().phase).toBe('failed')
    expect(useDiagnosis.getState().failure?.messageKey).toBe('diagnosis.errors.aiUnavailable')
    expect(sent).toHaveLength(1)
  })

  it('treats unknown, crop_mismatch and low_confidence as answers, not errors', async () => {
    for (const status of ['unknown', 'crop_mismatch', 'low_confidence'] as const) {
      const { useDiagnosis } = setup([result(status)])

      await start(useDiagnosis)

      expect(useDiagnosis.getState().phase).toBe('done')
      expect(useDiagnosis.getState().failure).toBeNull()
      expect(useDiagnosis.getState().result?.status).toBe(status)
    }
  })

  it('pressing Analyze again after a failure is a resend, not a new diagnosis', async () => {
    const { useDiagnosis, sent, prepare } = setup([
      new ApiError(502, 'ai_error', 'bad answer'),
      result(),
    ])

    await start(useDiagnosis)
    await useDiagnosis.getState().analyze()

    expect(useDiagnosis.getState().phase).toBe('done')
    expect(sent.map((p) => p.key)).toEqual(['key-00000001', 'key-00000001'])
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('a refused photo needs a new photo, and a new photo gets a new key and a new file', async () => {
    const { useDiagnosis, sent, prepare } = setup([
      new ApiError(422, 'low_quality', 'blurry', [], 'blurry'),
      result(),
    ])

    await start(useDiagnosis)
    expect(useDiagnosis.getState().failure).toEqual({
      messageKey: 'diagnosis.errors.blurry',
      action: 'newPhoto',
    })

    useDiagnosis.getState().setPhoto({ ...PHOTO, uri: 'file:///camera/IMG_2.jpg' })
    expect(useDiagnosis.getState().pending).toBeNull()
    await useDiagnosis.getState().analyze()

    expect(sent.map((p) => p.key)).toEqual(['key-00000001', 'key-00000002'])
    expect(sent[1].fileUri).toBe('file:///documents/key-00000002.jpg')
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('stops with a message and sends nothing when the photo cannot be prepared', async () => {
    const { useDiagnosis, sent, prepare } = setup([result()])
    prepare.mockRejectedValueOnce(new PhotoError('too_large'))

    await start(useDiagnosis)

    expect(useDiagnosis.getState().phase).toBe('failed')
    expect(useDiagnosis.getState().failure?.messageKey).toBe('diagnosis.errors.photoTooLarge')
    expect(useDiagnosis.getState().pending).toBeNull()
    expect(sent).toHaveLength(0)
  })

  it('drops an answer that arrives after the flow was started over', async () => {
    let release: (value: DiagnosisResult) => void = () => undefined
    const api: DiagnosisApi = {
      create: jest.fn(() => new Promise<DiagnosisResult>((resolve) => (release = resolve))),
    }
    const useDiagnosis = createDiagnosisStore({
      api,
      prepare: async () => ({ uri: 'file:///p.jpg' }),
      queue: memoryQueue().queue,
    })
    useDiagnosis.getState().selectCrop('tomato')
    useDiagnosis.getState().setPhoto(PHOTO)

    const running = useDiagnosis.getState().analyze()
    await Promise.resolve()
    await Promise.resolve()
    useDiagnosis.getState().reset()
    release(result())
    await running

    expect(useDiagnosis.getState().phase).toBe('idle')
    expect(useDiagnosis.getState().result).toBeNull()
  })

  it('does nothing without a crop and a photo, and ignores a second press while sending', async () => {
    const { useDiagnosis, sent } = setup([result()])

    await useDiagnosis.getState().analyze()
    expect(sent).toHaveLength(0)

    useDiagnosis.getState().selectCrop('wheat')
    await useDiagnosis.getState().analyze()
    expect(sent).toHaveLength(0)
    expect(useDiagnosis.getState().phase).toBe('idle')
  })

  describe('offline queue', () => {
    it('keeps the entry while the answer is missing and drops it when the answer comes', async () => {
      const { useDiagnosis, queue } = setup([new ApiError(503, 'ai_unavailable', 'down'), result()])

      await start(useDiagnosis)
      expect(queue.list().map((e) => e.pending.key)).toEqual(['key-00000001'])
      expect(useDiagnosis.getState().queued).toHaveLength(1)

      await useDiagnosis.getState().retry()

      expect(queue.list()).toEqual([])
      expect(useDiagnosis.getState().queued).toEqual([])
    })

    it('removes the entry and its photo when the server refuses the photo for good', async () => {
      const { useDiagnosis, queue, files } = setup([
        new ApiError(422, 'low_quality', 'blurry', [], 'blurry'),
      ])

      await start(useDiagnosis)

      expect(queue.list()).toEqual([])
      expect(files.size).toBe(0)
      expect(useDiagnosis.getState().pending).toBeNull()
    })

    it('restores the entries after a restart and resends one with its own key and file', async () => {
      const first = setup([new NetworkError(), new NetworkError()])
      await start(first.useDiagnosis)
      expect(first.useDiagnosis.getState().phase).toBe('failed')

      // "restart": a new store over the same queue
      const sent: PendingDiagnosis[] = []
      const after = createDiagnosisStore({
        api: {
          create: async (pending) => {
            sent.push(pending)
            return result()
          },
        },
        prepare: jest.fn(),
        queue: first.queue,
      })
      expect(after.getState().queued).toEqual([])
      after.getState().restore()
      expect(after.getState().queued).toHaveLength(1)

      await after.getState().resend('key-00000001')

      expect(sent).toHaveLength(1)
      expect(sent[0].key).toBe('key-00000001')
      expect(sent[0].fileUri).toBe('file:///documents/key-00000001.jpg')
      expect(after.getState().phase).toBe('done')
      expect(first.queue.list()).toEqual([])
    })

    it('does not start a second request for the same key on a double tap', async () => {
      let release: (value: DiagnosisResult) => void = () => undefined
      const create = jest.fn(() => new Promise<DiagnosisResult>((resolve) => (release = resolve)))
      const memory = memoryQueue()
      const useDiagnosis = createDiagnosisStore({
        api: { create },
        prepare: async () => ({ uri: 'file:///p.jpg' }),
        queue: memory.queue,
        newKey: () => 'key-00000001',
      })
      useDiagnosis.getState().selectCrop('tomato')
      useDiagnosis.getState().setPhoto(PHOTO)
      const running = useDiagnosis.getState().analyze()
      await new Promise((resolve) => setImmediate(resolve))

      await useDiagnosis.getState().resend('key-00000001')
      await useDiagnosis.getState().resend('key-00000001')

      expect(create).toHaveBeenCalledTimes(1)
      release(result())
      await running
      expect(useDiagnosis.getState().phase).toBe('done')
    })

    it('shows an error instead of crashing when the copy of the photo is gone', async () => {
      const { useDiagnosis, queue, files } = setup([new NetworkError(), new NetworkError()])
      await start(useDiagnosis)
      files.clear()

      await useDiagnosis.getState().resend('key-00000001')

      expect(useDiagnosis.getState().phase).toBe('failed')
      expect(useDiagnosis.getState().failure).toEqual({
        messageKey: 'diagnosis.errors.photoLost',
        action: 'newPhoto',
      })
      expect(queue.list()[0].status).toBe('fileMissing')
    })

    it('restore only loads: it sends nothing, can be called twice and removes stray photo files', async () => {
      const { useDiagnosis, sent, files } = setup([new NetworkError(), new NetworkError()])
      await start(useDiagnosis)
      const sentBefore = sent.length
      files.add('file:///documents/stray.jpg')

      useDiagnosis.getState().restore()
      useDiagnosis.getState().restore()

      expect(useDiagnosis.getState().queued).toHaveLength(1)
      expect(sent).toHaveLength(sentBefore)
      expect([...files]).toEqual(['file:///documents/key-00000001.jpg'])
    })

    it('discard works for an entry whose photo is already gone', async () => {
      const { useDiagnosis, queue, files } = setup([new NetworkError(), new NetworkError()])
      await start(useDiagnosis)
      files.clear()

      expect(() => useDiagnosis.getState().discard('key-00000001')).not.toThrow()
      expect(queue.list()).toEqual([])
    })

    it('treats 201 with Idempotent-Replayed: true as a normal success and empties the queue', async () => {
      const memory = memoryQueue()
      const body = JSON.stringify(result())
      const fetchFn = jest.fn(
        async () =>
          new Response(body, {
            status: 201,
            headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
          }),
      )
      const useDiagnosis = createDiagnosisStore({
        api: createDiagnosisApi(
          createApiClient({
            baseUrl: 'http://api',
            fetchFn: fetchFn as unknown as typeof fetch,
            getAccessToken: () => 'token',
            refreshAccessToken: async () => null,
          }),
          () => ({ append: () => undefined }) as unknown as FormData,
        ),
        prepare: async () => ({ uri: 'file:///p.jpg' }),
        queue: memory.queue,
      })

      await start(useDiagnosis)

      expect(useDiagnosis.getState().phase).toBe('done')
      expect(useDiagnosis.getState().result?.id).toBe('d1')
      expect(memory.queue.list()).toEqual([])
      // the photo stays for the result screen
      expect([...memory.files]).toEqual([useDiagnosis.getState().results.d1.photoPath])
    })

    it('keeps the answer by diagnosis id and links the queue key to it', async () => {
      const { useDiagnosis } = setup([
        new NetworkError(),
        new NetworkError(),
        result('low_confidence'),
      ])
      await start(useDiagnosis)
      expect(useDiagnosis.getState().results).toEqual({})

      await useDiagnosis.getState().resend('key-00000001')

      const s = useDiagnosis.getState()
      expect(s.results.d1.status).toBe('low_confidence')
      expect(s.answeredKeys).toEqual({ 'key-00000001': 'd1' })
    })

    it('an answer that arrives after the farmer left is unseen until its result is opened', async () => {
      const { useDiagnosis } = setup([new NetworkError(), new NetworkError(), result()])
      await start(useDiagnosis)
      expect(useDiagnosis.getState().unseenResultIds).toEqual([])

      // the farmer went to the queue screen and sent the entry from there
      await useDiagnosis.getState().resend('key-00000001')
      expect(useDiagnosis.getState().unseenResultIds).toEqual(['d1'])

      useDiagnosis.getState().markSeen('d1')
      expect(useDiagnosis.getState().unseenResultIds).toEqual([])
    })

    it('lists an answer once even if the same diagnosis is answered again', async () => {
      const { useDiagnosis } = setup([result(), result()])
      await start(useDiagnosis)
      useDiagnosis.getState().setPhoto(PHOTO)
      await useDiagnosis.getState().analyze()
      expect(useDiagnosis.getState().unseenResultIds).toEqual(['d1'])
    })

    describe('the photo of an answer', () => {
      it('stays after the answer and its path goes to the result', async () => {
        const { useDiagnosis, queue, files } = setup([result()])

        await start(useDiagnosis)

        expect(queue.list()).toEqual([])
        expect(files.has('file:///documents/key-00000001.jpg')).toBe(true)
        expect(useDiagnosis.getState().results.d1.photoPath).toBe(
          'file:///documents/key-00000001.jpg',
        )
      })

      it('is kept by a restore during the session', async () => {
        const { useDiagnosis, files } = setup([result()])
        await start(useDiagnosis)

        useDiagnosis.getState().restore()

        expect(files.has('file:///documents/key-00000001.jpg')).toBe(true)
      })

      it('is deleted by the restore of the next start, when no answers are known yet', async () => {
        const first = setup([result()])
        await start(first.useDiagnosis)
        expect(first.files.size).toBe(1)

        // "restart": a new store over the same queue has no results
        const after = createDiagnosisStore({
          api: { create: async () => result() },
          prepare: jest.fn(),
          queue: first.queue,
        })
        after.getState().restore()

        expect(first.files.size).toBe(0)
      })

      it('a refused photo is deleted at once, it has no result to belong to', async () => {
        const { useDiagnosis, files } = setup([
          new ApiError(422, 'low_quality', 'blurry', [], 'blurry'),
        ])
        await start(useDiagnosis)
        expect(files.size).toBe(0)
      })
    })

    it('analyzes the photo of an answer again as another crop with a new key', async () => {
      const { useDiagnosis, sent, files, prepare } = setup([result('crop_mismatch'), result()])
      await start(useDiagnosis)
      const firstPhoto = useDiagnosis.getState().results.d1.photoPath

      await useDiagnosis.getState().reanalyze('d1', 'potato')

      expect(sent.map((p) => [p.key, p.crop])).toEqual([
        ['key-00000001', 'tomato'],
        ['key-00000002', 'potato'],
      ])
      // the first answer keeps its photo, the new one has its own copy; the photo is not prepared again
      expect(sent[1].fileUri).toBe('file:///documents/key-00000002.jpg')
      expect(files.has(firstPhoto!)).toBe(true)
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(useDiagnosis.getState().phase).toBe('done')
    })

    it('has nothing to analyze again when the photo of the answer is unknown', async () => {
      const { useDiagnosis, sent } = setup([result('crop_mismatch')])
      await start(useDiagnosis)
      useDiagnosis.setState((s) => ({
        results: { d1: { ...s.results.d1, photoPath: null } },
      }))

      await useDiagnosis.getState().reanalyze('d1', 'potato')

      expect(sent).toHaveLength(1)
    })

    it('going through the analysis screen (redirect, then markSeen) leaves nothing unseen', async () => {
      const { useDiagnosis } = setup([result()])

      await start(useDiagnosis)
      // the analysis screen sees phase "done" and redirects to the result, which marks it seen
      const { phase, result: answer } = useDiagnosis.getState()
      expect(phase).toBe('done')
      expect(useDiagnosis.getState().unseenResultIds).toEqual(['d1'])
      useDiagnosis.getState().markSeen(answer!.id)

      expect(useDiagnosis.getState().unseenResultIds).toEqual([])
    })

    it('discard removes the entry with its photo', async () => {
      const { useDiagnosis, queue, files } = setup([new NetworkError(), new NetworkError()])
      await start(useDiagnosis)

      useDiagnosis.getState().discard('key-00000001')

      expect(queue.list()).toEqual([])
      expect(files.size).toBe(0)
      expect(useDiagnosis.getState().queued).toEqual([])
      expect(useDiagnosis.getState().pending).toBeNull()
    })

    it('drops the entry when the flow was started over while it was being prepared', async () => {
      const { useDiagnosis, queue } = setup([result()])
      useDiagnosis.getState().selectCrop('tomato')
      useDiagnosis.getState().setPhoto(PHOTO)

      const running = useDiagnosis.getState().analyze()
      useDiagnosis.getState().reset()
      await running

      expect(queue.list()).toEqual([])
    })
  })

  it('choosing another crop starts over', async () => {
    const { useDiagnosis } = setup([result()])
    await start(useDiagnosis)

    useDiagnosis.getState().selectCrop('potato')

    const s = useDiagnosis.getState()
    expect(s.crop).toBe('potato')
    expect(s.photo).toBeNull()
    expect(s.pending).toBeNull()
    expect(s.result).toBeNull()
    expect(s.phase).toBe('idle')
  })
})
