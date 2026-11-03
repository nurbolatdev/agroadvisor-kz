import type { DiagnosisApi, DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { PhotoError, type PickedPhoto } from '@/features/diagnosis/photo'
import type { PendingDiagnosis } from '@/features/diagnosis/pending'

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

function setup(outcomes: (DiagnosisResult | Error)[]) {
  const sent: PendingDiagnosis[] = []
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
    newKey: () => `key-0000000${(keys += 1)}`,
    now: () => 1_700_000_000_000,
  })
  return { useDiagnosis, sent, prepare }
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
      fileUri: 'file:///camera/IMG_1.jpg.prepared.jpg',
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
      new Set(['file:///camera/IMG_1.jpg.prepared.jpg']),
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
    expect(sent[1].fileUri).toBe('file:///camera/IMG_2.jpg.prepared.jpg')
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
