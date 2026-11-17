import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError, NetworkError } from '@/api/errors'
import type { Field } from '@/api/fields'
import { createMockWeatherApi } from '@/api/mock/weather'
import { initI18n } from '@/i18n'

import { WeatherScreen } from './WeatherScreen'

const mockFields = { get: jest.fn() }
const mockWeather = { get: jest.fn() }
const mockBack = jest.fn()

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ back: mockBack }),
    useLocalSearchParams: () => ({ fieldId: 'f1' }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  fieldsApi: { get: (...a: unknown[]) => mockFields.get(...a) },
  weatherApi: { get: (...a: unknown[]) => mockWeather.get(...a) },
}))

const field = (extra: Partial<Field> = {}): Field => ({
  id: 'f1',
  name: 'Northern',
  crop: 'wheat',
  area: 10,
  areaUnit: 'ha',
  areaHa: 10,
  location: { latitude: 43.25, longitude: 76.95 },
  regionId: null,
  districtId: null,
  createdAt: '2026-11-16T08:00:00Z',
  updatedAt: '2026-11-16T08:00:00Z',
  ...extra,
})

const mock = () => createMockWeatherApi({ delayMs: 0, now: () => Date.UTC(2026, 10, 17, 3, 20) })

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockFields.get.mockReset().mockResolvedValue(field())
  mockWeather.get.mockReset().mockImplementation((point) => mock().get(point))
  mockBack.mockReset()
})

describe('WeatherScreen', () => {
  it('shows the field, the weather now, the advice, the hours and the days', async () => {
    await render(<WeatherScreen />)

    expect(await screen.findByText('Northern · Wheat')).toBeTruthy()
    expect(mockWeather.get).toHaveBeenCalledWith({ latitude: 43.25, longitude: 76.95 })
    expect(screen.getByText('By hour')).toBeTruthy()
    expect(screen.getByText('5 days')).toBeTruthy()
    expect(screen.getByText('You can spray today')).toBeTruthy()
    expect(
      screen.getByText('No rain for 6 h after spraying, wind up to 4 m/s, 10–25 °C'),
    ).toBeTruthy()
  })

  it('says it is better not to spray when no window is left', async () => {
    mockWeather.get.mockImplementation(async (point) => ({
      ...(await mock().get(point)),
      sprayWindows: [],
    }))

    await render(<WeatherScreen />)

    expect(await screen.findByText('Better not to spray today')).toBeTruthy()
    expect(screen.getByText('No good window in the next 5 days')).toBeTruthy()
  })

  it('does not ask the weather for a field without a point', async () => {
    mockFields.get.mockResolvedValue(field({ location: null }))

    await render(<WeatherScreen />)

    expect(await screen.findByText('This field has no point on the map')).toBeTruthy()
    expect(mockWeather.get).not.toHaveBeenCalled()
  })

  it('says the field is gone on 404', async () => {
    mockFields.get.mockRejectedValue(new ApiError(404, 'field_not_found', 'x'))

    await render(<WeatherScreen />)

    expect(await screen.findByText('Field not found')).toBeTruthy()
  })

  it('names the reason and retries', async () => {
    mockWeather.get.mockRejectedValueOnce(new ApiError(503, 'weather_unavailable', 'x'))

    await render(<WeatherScreen />)

    expect(
      await screen.findByText('The weather source is not available now. Try again later'),
    ).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: /retry|again/i }))
    expect(await screen.findByText('Northern · Wheat')).toBeTruthy()
  })

  it('shows the network problem when the field cannot be read', async () => {
    mockFields.get.mockRejectedValue(new NetworkError())

    await render(<WeatherScreen />)

    await waitFor(() =>
      expect(screen.getByText('No connection to the server. Check the internet')).toBeTruthy(),
    )
  })

  it('says when there are too many requests', async () => {
    mockWeather.get.mockRejectedValue(new ApiError(429, 'rate_limited', 'x'))

    await render(<WeatherScreen />)

    expect(await screen.findByText('Too many requests. Wait a minute')).toBeTruthy()
  })

  it('goes back', async () => {
    await render(<WeatherScreen />)
    await screen.findByText('Northern · Wheat')

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).toHaveBeenCalled()
  })
})
