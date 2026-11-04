import { fireEvent, render, screen } from '@testing-library/react-native'

import type { DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'
import HistoryScreen from '@/app/(app)/(tabs)/history'

const mockApi = { list: jest.fn(), get: jest.fn() }
const mockPush = jest.fn()
const mockRemember = jest.fn()
const mockReset = jest.fn()

// The screen's own logic is under test; the store is the real history store over a fake api.
jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { language: string }) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => {
  const { createHistoryStore } = require('@/store/history')
  return {
    // looked up at call time: this factory runs when the screen is imported, before `mockApi` exists
    useHistory: createHistoryStore({
      api: {
        list: (...args: unknown[]) => mockApi.list(...args),
        get: (...args: unknown[]) => mockApi.get(...args),
      },
      pageSize: 2,
    }),
    useDiagnosis: { getState: () => ({ rememberResult: mockRemember, reset: mockReset }) },
    useSession: (select: (s: { accessToken: string }) => unknown) => select({ accessToken: 'tok' }),
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
  useHistory.getState().reset()
})

function diagnosis(id: string, crop = 'tomato', status: DiagnosisResult['status'] = 'ok') {
  const top1 = { code: `${crop}__late_blight`, confidence: 0.87 }
  return {
    id,
    crop,
    status,
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    photoUrl: `/api/diagnoses/${id}/photo`,
    createdAt: '2026-11-04T10:05:00Z',
  } satisfies DiagnosisResult
}

describe('history screen', () => {
  it('lists the diagnoses with the disease name and opens the result on a tap', async () => {
    const first = diagnosis('d1')
    mockApi.list.mockResolvedValue([first, diagnosis('d2', 'corn', 'unknown')])
    await render(<HistoryScreen />)

    expect(await screen.findByText('Late blight')).toBeTruthy()
    // the unknown one names no disease: the crop is its title and the status is in the badge
    expect(screen.getByLabelText(/^Corn\. /)).toBeTruthy() // "Corn" is also the name of a filter chip
    expect(screen.getByText('Not identified')).toBeTruthy()

    await fireEvent.press(screen.getAllByRole('button', { name: /Late blight/ })[0])

    expect(mockRemember).toHaveBeenCalledWith(first)
    expect(mockPush).toHaveBeenCalledWith('/diagnosis/result/d1')
  })

  it('offers the first diagnosis when the history is empty', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<HistoryScreen />)

    expect(await screen.findByText('No diagnoses yet')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Diagnose by photo' }))

    expect(mockPush).toHaveBeenCalledWith('/diagnosis')
  })

  it('says why nothing is shown when the first load fails, and tries again on request', async () => {
    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await render(<HistoryScreen />)
    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()

    mockApi.list.mockResolvedValueOnce([diagnosis('d1')])
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Late blight')).toBeTruthy()
  })

  it('filters by crop and says so when no loaded diagnosis is of the chosen crop', async () => {
    mockApi.list.mockResolvedValue([diagnosis('d1', 'tomato'), diagnosis('d2', 'tomato')])
    await render(<HistoryScreen />)
    await screen.findAllByText('Late blight')

    await fireEvent.press(screen.getByRole('button', { name: 'Wheat' }))

    // a full page was loaded, so there may be wheat on the next one
    expect(await screen.findByText('None of the loaded diagnoses is of this crop')).toBeTruthy()
    expect(screen.queryByText('Late blight')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'All' }))
    expect(await screen.findAllByText('Late blight')).toHaveLength(2)
  })

  it('keeps the list and shows the error when a refresh fails', async () => {
    mockApi.list.mockResolvedValueOnce([diagnosis('d1')])
    await render(<HistoryScreen />)
    await screen.findByText('Late blight')

    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await useHistory.getState().refresh()

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    expect(screen.getByText('Late blight')).toBeTruthy()
  })

  it('asks for the next page when the list ends, but not again by itself after an error', async () => {
    mockApi.list.mockResolvedValueOnce([diagnosis('d1'), diagnosis('d2')]) // a full page
    await render(<HistoryScreen />)
    await screen.findAllByText('Late blight')
    expect(mockApi.list).toHaveBeenCalledTimes(1)

    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await fireEvent(screen.getByTestId('history-list'), 'endReached')
    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    expect(mockApi.list).toHaveBeenCalledTimes(2)

    // the footer changed the height of the list and the list says "end" again: no request
    await fireEvent(screen.getByTestId('history-list'), 'endReached')
    await fireEvent(screen.getByTestId('history-list'), 'endReached')
    expect(mockApi.list).toHaveBeenCalledTimes(2)

    // only the button asks again
    mockApi.list.mockResolvedValueOnce([diagnosis('d3')])
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByText('Late blight')).toHaveLength(3)
    expect(mockApi.list).toHaveBeenCalledTimes(3)
  })

  it('does not load pages by itself while a crop filter is chosen', async () => {
    mockApi.list.mockResolvedValue([diagnosis('d1'), diagnosis('d2')])
    await render(<HistoryScreen />)
    await screen.findAllByText('Late blight')
    await fireEvent.press(screen.getByRole('button', { name: 'Wheat' }))
    await screen.findByText('None of the loaded diagnoses is of this crop')
    const calls = mockApi.list.mock.calls.length

    await fireEvent(screen.getByTestId('history-list'), 'endReached')

    expect(mockApi.list).toHaveBeenCalledTimes(calls)
    // the button does
    mockApi.list.mockResolvedValueOnce([diagnosis('d3', 'wheat')])
    await fireEvent.press(screen.getByRole('button', { name: 'Show more' }))
    expect(mockApi.list).toHaveBeenCalledTimes(calls + 1)
  })

  it('starts the first diagnosis from a clean flow', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<HistoryScreen />)
    await screen.findByText('No diagnoses yet')

    await fireEvent.press(screen.getByRole('button', { name: 'Diagnose by photo' }))

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/diagnosis')
  })
})
