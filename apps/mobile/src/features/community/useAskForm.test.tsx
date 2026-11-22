import { act, renderHook, waitFor } from '@testing-library/react-native'

import { ApiError, NetworkError } from '@/api/errors'

import { useAskForm } from './useAskForm'

const mockAsk = jest.fn()
const mockGetDiagnosis = jest.fn()
let mockResults: Record<string, unknown> = {}
let mockMe: { regionId: number | null } | null = { regionId: 3 }

jest.mock('@/services', () => ({
  communityApi: { ask: (...a: unknown[]) => mockAsk(...a) },
  diagnosisApi: { get: (...a: unknown[]) => mockGetDiagnosis(...a) },
  useDiagnosis: { getState: () => ({ results: mockResults }) },
  useProfile: (select: (state: { me: unknown }) => unknown) => select({ me: mockMe }),
}))

const photo = (name: string, size = 1000) => ({
  file: { uri: `file:///${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg' },
  name: `${name}.jpg`,
  size,
})

const filled = async (hook: { result: { current: ReturnType<typeof useAskForm> } }) => {
  await act(async () => {
    hook.result.current.setCrop('tomato')
    hook.result.current.setTitle('Yellow leaves')
    hook.result.current.setText('The lower leaves turn yellow')
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResults = {}
  mockMe = { regionId: 3 }
})

describe('useAskForm', () => {
  it('takes the crop from the diagnosis and locks it', async () => {
    mockResults = { d1: { id: 'd1', crop: 'potato' } }
    const { result } = await renderHook(() => useAskForm({ diagnosisId: 'd1', crop: 'tomato' }))
    await waitFor(() => expect(result.current.diagnosis.status).toBe('ready'))
    expect(result.current.crop).toBe('potato')
    expect(result.current.cropLocked).toBe(true)
    await act(async () => result.current.setCrop('wheat'))
    expect(result.current.crop).toBe('potato')
    expect(mockGetDiagnosis).not.toHaveBeenCalled()
  })

  it('reads a diagnosis that is not in the store, and says when it cannot', async () => {
    mockGetDiagnosis.mockResolvedValueOnce({ id: 'd2', crop: 'corn' })
    const first = await renderHook(() => useAskForm({ diagnosisId: 'd2' }))
    await waitFor(() => expect(first.result.current.diagnosis.status).toBe('ready'))
    expect(first.result.current.crop).toBe('corn')

    mockGetDiagnosis.mockRejectedValueOnce(new ApiError(404, 'diagnosis_not_found', 'none'))
    const second = await renderHook(() => useAskForm({ diagnosisId: 'd3' }))
    await waitFor(() => expect(second.result.current.diagnosis.status).toBe('failed'))
    await filled(second)
    expect(second.result.current.canSubmit).toBe(false)
  })

  it('leaves the crop free without a diagnosis', async () => {
    const { result } = await renderHook(() => useAskForm({ crop: 'wheat' }))
    expect(result.current.crop).toBe('wheat')
    expect(result.current.cropLocked).toBe(false)
    await act(async () => result.current.setCrop('corn'))
    expect(result.current.crop).toBe('corn')
    expect(result.current.diagnosis).toEqual({ status: 'none' })
  })

  it('does not add a fourth photo and removes one', async () => {
    const { result } = await renderHook(() => useAskForm({}))
    const added: boolean[] = []
    for (const name of ['a', 'b', 'c', 'd']) {
      await act(async () => {
        added.push(result.current.addPhoto(photo(name)))
      })
    }
    expect(added).toEqual([true, true, true, false])
    expect(result.current.photos).toHaveLength(3)
    await act(async () => result.current.removePhoto(0))
    expect(result.current.photos.map((p) => p.name)).toEqual(['b.jpg', 'c.jpg'])
  })

  it('shows the error of a field only after it was touched', async () => {
    const { result } = await renderHook(() => useAskForm({}))
    expect(result.current.errors).toEqual({})
    await act(async () => result.current.setTitle('ab'))
    expect(result.current.errors).toEqual({ title: 'tooShort' })
    expect(result.current.canSubmit).toBe(false)
  })

  it('cannot be sent without a region in the profile', async () => {
    mockMe = { regionId: null }
    const hook = await renderHook(() => useAskForm({}))
    await filled(hook)
    expect(hook.result.current.regionId).toBeNull()
    expect(hook.result.current.canSubmit).toBe(false)
    expect(await hook.result.current.submit()).toBeNull()
    expect(mockAsk).not.toHaveBeenCalled()
  })

  it('sends the form and returns the id of the question', async () => {
    mockResults = { d1: { id: 'd1', crop: 'tomato' } }
    mockAsk.mockResolvedValueOnce({ id: 'q9' })
    const hook = await renderHook(() => useAskForm({ diagnosisId: 'd1' }))
    await waitFor(() => expect(hook.result.current.diagnosis.status).toBe('ready'))
    await act(async () => {
      hook.result.current.setTitle('Yellow leaves')
      hook.result.current.setText('The lower leaves turn yellow')
      hook.result.current.addPhoto(photo('a'))
    })
    let id: string | null = null
    await act(async () => {
      id = await hook.result.current.submit()
    })
    expect(id).toBe('q9')
    expect(mockAsk).toHaveBeenCalledWith({
      title: 'Yellow leaves',
      text: 'The lower leaves turn yellow',
      cropCode: 'tomato',
      diagnosisId: 'd1',
      photos: [photo('a').file],
    })
  })

  it.each([
    [new ApiError(400, 'region_required', 'x'), 'region_required'],
    [new ApiError(429, 'rate_limited', 'x'), 'rate_limited'],
    [new NetworkError(), 'offline'],
  ])('turns a failure into a problem', async (error, problem) => {
    mockAsk.mockRejectedValueOnce(error)
    const hook = await renderHook(() => useAskForm({}))
    await filled(hook)
    let id: string | null = 'x'
    await act(async () => {
      id = await hook.result.current.submit()
    })
    expect(id).toBeNull()
    expect(hook.result.current.problem).toBe(problem)
    expect(hook.result.current.submitting).toBe(false)
  })

  it('ignores a second send while the first is on its way', async () => {
    let finish: (value: unknown) => void = () => {}
    mockAsk.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const hook = await renderHook(() => useAskForm({}))
    await filled(hook)
    let first: Promise<string | null> = Promise.resolve(null)
    await act(async () => {
      first = hook.result.current.submit()
    })
    let second: string | null = 'x'
    await act(async () => {
      second = await hook.result.current.submit()
    })
    expect(second).toBeNull()
    await act(async () => {
      finish({ id: 'q1' })
      await first
    })
    expect(mockAsk).toHaveBeenCalledTimes(1)
  })
})
