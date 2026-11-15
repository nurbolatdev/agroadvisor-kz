import { fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/api/errors'
import AgrochemistProfileScreen from '@/app/(app)/agrochemists/[id]'
import { initI18n } from '@/i18n'

const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
let mockResults: Record<string, unknown> = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  agrochemistDirectoryApi: { get: (...args: unknown[]) => mockGet(...args) },
  consultationsApi: { create: (...args: unknown[]) => mockCreate(...args) },
  useDiagnosis: (select: (s: { results: Record<string, unknown> }) => unknown) =>
    select({ results: mockResults }),
}))
jest.mock('@/features/diseases/useDiseaseDetail', () => ({
  useDiseaseDetail: () => ({
    state: { status: 'ready', detail: { disease: { name: 'Tomato late blight' } } },
    reload: jest.fn(),
  }),
}))

const AGROCHEMIST = {
  id: 'a1',
  fullName: 'Aigul Sarsenova',
  crops: ['tomato', 'corn'],
  specializations: ['plant_protection'],
  experienceYears: 12,
  regionId: 7,
  verifiedAt: '2026-10-01T09:00:00Z',
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'a1', diagnosisId: 'd1' }
  mockResults = {
    d1: { id: 'd1', crop: 'tomato', top1: { code: 'tomato__late_blight', confidence: 0.94 } },
  }
  mockGet.mockResolvedValue(AGROCHEMIST)
  mockCreate.mockResolvedValue({ id: 'c1' })
})

async function openSheet() {
  await render(<AgrochemistProfileScreen />)
  await screen.findByText('Aigul Sarsenova')
  await fireEvent.press(screen.getByText('Send results'))
}

describe('agrochemist profile screen', () => {
  it('shows the profile: the crops, the specialization and the experience', async () => {
    await render(<AgrochemistProfileScreen />)

    expect(await screen.findByText('Aigul Sarsenova')).toBeTruthy()
    expect(screen.getByText('Plant protection · 12 years')).toBeTruthy()
    expect(screen.getByText('Tomato, Corn')).toBeTruthy()
  })

  it('says that an agrochemist who is gone does not take requests', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(404, 'agrochemist_not_found', 'x'))
    await render(<AgrochemistProfileScreen />)

    expect(await screen.findByText('This agrochemist no longer takes requests')).toBeTruthy()
  })

  it('shows the diagnosis in the sheet and sends it with the message', async () => {
    await openSheet()

    expect(screen.getByText('Tomato late blight')).toBeTruthy()
    expect(screen.getByText('94% · Tomato')).toBeTruthy()

    await fireEvent.changeText(
      screen.getByPlaceholderText('Describe what worries you'),
      'Spots after rain',
    )
    await fireEvent.press(screen.getByText('Send'))

    expect(await screen.findByText('Request sent')).toBeTruthy()
    expect(mockCreate).toHaveBeenCalledWith({
      agrochemistId: 'a1',
      text: 'Spots after rain',
      diagnosisId: 'd1',
    })
  })

  it('leaves the screen when the farmer presses "Done"', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByPlaceholderText('Describe what worries you'), 'Help')
    await fireEvent.press(screen.getByText('Send'))
    await screen.findByText('Request sent')

    await fireEvent.press(screen.getByText('Done'))

    expect(mockBack).toHaveBeenCalled()
  })

  it('asks for a message first and sends nothing while it is empty', async () => {
    await openSheet()

    await fireEvent.press(screen.getByText('Send'))

    expect(await screen.findByText('Write a message to the agrochemist')).toBeTruthy()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('names the answer of the backend and keeps the text for another try', async () => {
    mockCreate.mockRejectedValueOnce(new ApiError(409, 'consultation_already_open', 'x'))
    await openSheet()
    await fireEvent.changeText(screen.getByPlaceholderText('Describe what worries you'), 'Help')

    await fireEvent.press(screen.getByText('Send'))

    expect(await screen.findByText('Your request to this agrochemist is already open')).toBeTruthy()
    expect(screen.getByDisplayValue('Help')).toBeTruthy()
  })

  it('works without a diagnosis: the request goes out with none attached', async () => {
    mockParams = { id: 'a1' }
    await openSheet()
    await fireEvent.changeText(screen.getByPlaceholderText('Describe what worries you'), 'Hello')

    await fireEvent.press(screen.getByText('Send'))

    await screen.findByText('Request sent')
    expect(mockCreate).toHaveBeenCalledWith({
      agrochemistId: 'a1',
      text: 'Hello',
      diagnosisId: null,
    })
  })
})
