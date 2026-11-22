import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { CropsScreen } from './CropsScreen'

const mockSubscriptions = jest.fn()
const mockSave = jest.fn()
const mockBack = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => mockBack() }) }))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  communityApi: {
    subscriptions: () => mockSubscriptions(),
    saveSubscriptions: (crops: string[]) => mockSave(crops),
  },
}))

beforeAll(async () => {
  await initI18n('ru')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSubscriptions.mockResolvedValue({ crops: ['wheat', 'sunflower'] })
  mockSave.mockImplementation((crops: string[]) => Promise.resolve({ crops }))
})

describe('CropsScreen', () => {
  it('checks the crops the server returned', async () => {
    await render(<CropsScreen />)
    await screen.findByText('Пшеница')
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(4)
    expect(screen.getByRole('checkbox', { name: 'Пшеница' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Томат' })).not.toBeChecked()
  })

  it('saves the whole set, keeps codes outside the list and goes back', async () => {
    await render(<CropsScreen />)
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Томат' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Пшеница' }))
    await fireEvent.press(screen.getByText('Сохранить'))
    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    expect(mockSave).toHaveBeenCalledWith(['sunflower', 'tomato'])
  })

  it('shows the problem and stays when the save is refused', async () => {
    mockSave.mockRejectedValue(new ApiError(429, 'rate_limited', 'x'))
    await render(<CropsScreen />)
    await fireEvent.press(await screen.findByText('Сохранить'))
    expect(await screen.findByText('Слишком много действий. Подождите немного')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('offers a retry when the subscriptions do not load', async () => {
    mockSubscriptions.mockRejectedValueOnce(new ApiError(500, 'server', 'x'))
    await render(<CropsScreen />)
    expect(await screen.findByText('Не удалось загрузить подписки')).toBeTruthy()
    await fireEvent.press(screen.getByText('Повторить'))
    expect(await screen.findByText('Пшеница')).toBeTruthy()
  })
})
