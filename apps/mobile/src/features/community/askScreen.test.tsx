import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { AskScreen } from './AskScreen'

const mockAsk = jest.fn()
const mockReplace = jest.fn()
let mockParams: { diagnosisId?: string; crop?: string } = {}
let mockResults: Record<string, unknown> = {}
let mockMe: { regionId: number | null } | null = { regionId: 1 }

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a) }),
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/agrochemists/useRegionName', () => ({
  useRegionName: () => (id: number | null | undefined) => (id === 1 ? 'Алматинская обл.' : null),
}))
jest.mock('@/features/diseases/useDiseaseDetail', () => ({
  useDiseaseDetail: () => ({
    state: { status: 'ready', detail: { disease: { name: 'Жёлтая ржавчина' } } },
  }),
}))
jest.mock('@/features/agrochemist/chooseDocument', () => ({ chooseDocument: jest.fn() }))
jest.mock('@/services', () => ({
  communityApi: { ask: (...a: unknown[]) => mockAsk(...a) },
  diagnosisApi: { get: jest.fn() },
  useDiagnosis: { getState: () => ({ results: mockResults }) },
  useProfile: (select: (state: { me: unknown }) => unknown) => select({ me: mockMe }),
  useSession: (select: (s: { accessToken: string | null }) => unknown) =>
    select({ accessToken: 'token-1' }),
}))

const diagnosis = {
  id: 'd1',
  crop: 'wheat',
  createdAt: '2026-09-27T10:00:00Z',
  photoUrl: '/api/diagnoses/d1/photo',
  top1: { code: 'wheat__yellow_rust', confidence: 0.62 },
}

beforeAll(async () => {
  await initI18n('ru')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockResults = {}
  mockMe = { regionId: 1 }
})

describe('AskScreen', () => {
  it('has no diagnosis card without a diagnosis and leaves the crop free', async () => {
    await render(<AskScreen />)
    expect(screen.queryByTestId('ask-diagnosis')).toBeNull()
    expect(screen.getByText('Пшеница')).toBeTruthy()
    expect(screen.getByText('Томат')).toBeTruthy()
    expect(screen.getByText('Алматинская обл.')).toBeTruthy()
  })

  it('shows the diagnosis and locks the crop it came with', async () => {
    mockParams = { diagnosisId: 'd1', crop: 'wheat' }
    mockResults = { d1: diagnosis }
    await render(<AskScreen />)
    expect(await screen.findByText('Жёлтая ржавчина · 62%')).toBeTruthy()
    expect(screen.getByText('Фото и результат ИИ добавлены')).toBeTruthy()
    expect(screen.getByText('Пшеница')).toBeTruthy()
    expect(screen.queryByText('Томат')).toBeNull()
  })

  it('shows the error of the title once it is touched', async () => {
    await render(<AskScreen />)
    expect(screen.queryByText('Заголовок слишком короткий: от 3 символов')).toBeNull()
    await fireEvent.changeText(screen.getByLabelText('Заголовок'), 'ab')
    expect(await screen.findByText('Заголовок слишком короткий: от 3 символов')).toBeTruthy()
  })

  it('warns about a missing region and does not let the question go', async () => {
    mockMe = { regionId: null }
    await render(<AskScreen />)
    expect(screen.getByText('Укажите регион в профиле, чтобы задать вопрос')).toBeTruthy()
    await fireEvent.press(screen.getByText('Пшеница'))
    await fireEvent.changeText(screen.getByLabelText('Заголовок'), 'Жёлтые полосы')
    await fireEvent.changeText(screen.getByLabelText('Описание'), 'Появились после жары')
    await fireEvent.press(screen.getByText('Опубликовать'))
    expect(mockAsk).not.toHaveBeenCalled()
  })

  it('publishes and opens the new question', async () => {
    mockAsk.mockResolvedValueOnce({ id: 'q9' })
    await render(<AskScreen />)
    await fireEvent.press(screen.getByText('Пшеница'))
    await fireEvent.changeText(screen.getByLabelText('Заголовок'), 'Жёлтые полосы')
    await fireEvent.changeText(screen.getByLabelText('Описание'), 'Появились после жары')
    await fireEvent.press(screen.getByText('Опубликовать'))
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/question/[id]',
        params: { id: 'q9' },
      }),
    )
    expect(mockAsk).toHaveBeenCalledWith(
      expect.objectContaining({ cropCode: 'wheat', title: 'Жёлтые полосы', photos: [] }),
    )
  })

  it('says what went wrong and stays on the screen', async () => {
    mockAsk.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'slow down'))
    await render(<AskScreen />)
    await fireEvent.press(screen.getByText('Пшеница'))
    await fireEvent.changeText(screen.getByLabelText('Заголовок'), 'Жёлтые полосы')
    await fireEvent.changeText(screen.getByLabelText('Описание'), 'Появились после жары')
    await fireEvent.press(screen.getByText('Опубликовать'))
    expect(await screen.findByText('Слишком много действий. Подождите немного')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
