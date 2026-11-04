import { fireEvent, render, screen } from '@testing-library/react-native'

import type { DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import HomeScreen from '@/app/(app)/(tabs)/home'
import { initI18n } from '@/i18n'

const mockApi = { list: jest.fn(), get: jest.fn() }
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReset = jest.fn()
const mockRemember = jest.fn()
const mockDiagnosis = { unseenResultIds: [] as string[], queued: [] as unknown[] }

jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) =>
    select({ language: 'en', setLanguage: jest.fn() }),
}))
jest.mock('@/services', () => {
  const { createHistoryStore } = require('@/store/history')
  const useDiagnosis = (select: (s: object) => unknown) =>
    select({ ...mockDiagnosis, reset: mockReset })
  useDiagnosis.getState = () => ({ rememberResult: mockRemember })
  return {
    // looked up at call time: this factory runs when the screen is imported, before `mockApi` exists
    useHistory: createHistoryStore({
      api: {
        list: (...args: unknown[]) => mockApi.list(...args),
        get: (...args: unknown[]) => mockApi.get(...args),
      },
      pageSize: 10,
    }),
    useDiagnosis,
    useSession: (select: (s: object) => unknown) =>
      select({ accessToken: 'tok', logout: jest.fn() }),
    diseaseCatalog: {
      list: () => Promise.resolve([{ code: 'tomato__late_blight', name: 'Late blight' }]),
    },
  }
})

// eslint-disable-next-line import/first
import { useHistory } from '@/services'

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockDiagnosis.unseenResultIds = []
  mockDiagnosis.queued = []
  useHistory.getState().reset()
})

function diagnosis(n: number): DiagnosisResult {
  const top1 = { code: 'tomato__late_blight', confidence: 0.87 }
  return {
    id: `d${n}`,
    crop: 'tomato',
    status: 'ok',
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    photoUrl: `/api/diagnoses/d${n}/photo`,
    createdAt: '2026-11-04T10:05:00Z',
  }
}

describe('home screen', () => {
  it('starts a new diagnosis from a clean flow', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Diagnose by photo' }))

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/diagnosis')
  })

  it('shows only the latest three diagnoses and leads to the whole history', async () => {
    mockApi.list.mockResolvedValue([1, 2, 3, 4, 5].map(diagnosis))
    await render(<HomeScreen />)

    expect(await screen.findAllByText('Late blight')).toHaveLength(3)
    await fireEvent.press(screen.getByRole('button', { name: 'All history' }))

    expect(mockNavigate).toHaveBeenCalledWith('/history')
  })

  it('opens the result of a diagnosis from the list', async () => {
    const first = diagnosis(1)
    mockApi.list.mockResolvedValue([first])
    await render(<HomeScreen />)
    await screen.findByText('Late blight')

    await fireEvent.press(screen.getAllByRole('button', { name: /Late blight/ })[0])

    expect(mockRemember).toHaveBeenCalledWith(first)
    expect(mockPush).toHaveBeenCalledWith('/diagnosis/result/d1')
  })

  it('says that the diagnoses will appear here when there are none, with no link to the history', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<HomeScreen />)

    expect(await screen.findByText('Your diagnoses will appear here')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'All history' })).toBeNull()
  })

  it('does not break the screen when the history cannot be loaded, and tries again on request', async () => {
    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await render(<HomeScreen />)
    expect(await screen.findByText('Could not load the diagnoses')).toBeTruthy()
    // the main action is still there
    expect(screen.getByRole('button', { name: 'Diagnose by photo' })).toBeTruthy()

    mockApi.list.mockResolvedValueOnce([diagnosis(1)])
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Late blight')).toBeTruthy()
  })

  it('offers the unseen result and the queue', async () => {
    mockApi.list.mockResolvedValue([])
    mockDiagnosis.unseenResultIds = ['d7']
    mockDiagnosis.queued = [{}, {}]
    await render(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Result is ready — open' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Not sent: 2' }))

    expect(mockPush).toHaveBeenCalledWith('/diagnosis/result/d7')
    expect(mockPush).toHaveBeenCalledWith('/diagnosis/queue')
  })
})
