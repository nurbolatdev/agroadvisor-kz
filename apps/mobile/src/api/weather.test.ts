import { ApiError } from './errors'
import { createMockWeatherApi } from './mock/weather'
import { createWeatherApi, weatherPath } from './weather'

describe('weather api', () => {
  it('asks for the point', async () => {
    const client = { request: jest.fn().mockResolvedValue({}) }

    await createWeatherApi(client as never).get({ latitude: 43.25, longitude: 76.95 })

    expect(client.request).toHaveBeenCalledWith('/api/weather?latitude=43.25&longitude=76.95')
  })

  it('keeps the sign of a coordinate in the path', () => {
    expect(weatherPath({ latitude: -33.5, longitude: -70.6 })).toBe(
      '/api/weather?latitude=-33.5&longitude=-70.6',
    )
  })
})

describe('mock weather', () => {
  // 2026-11-17 03:00 UTC is 08:00 at +05:00
  const make = () => createMockWeatherApi({ delayMs: 0, now: () => Date.UTC(2026, 10, 17, 3, 20) })

  it('answers five days of hours that start at the current hour, local to the point', async () => {
    const weather = await make().get({ latitude: 43.25, longitude: 76.95 })

    expect(weather.hours).toHaveLength(120)
    expect(weather.hours[0].time).toBe('2026-11-17T08:00:00')
    expect(weather.current.time).toBe(weather.hours[0].time)
    expect(weather.utcOffsetSeconds).toBe(18000)
  })

  it('marks no hour good when the next six hours are not all dry or the series is about to end', async () => {
    const { hours } = await make().get({ latitude: 43.25, longitude: 76.95 })

    expect(hours.slice(-6).every((h) => !h.sprayOk)).toBe(true)
    expect(hours.some((h) => h.sprayOk)).toBe(true)
    for (const h of hours.filter((h) => h.sprayOk)) {
      expect(h.windMs).toBeLessThanOrEqual(4)
      expect(h.temperatureC).toBeGreaterThanOrEqual(10)
      expect(h.temperatureC).toBeLessThanOrEqual(25)
    }
  })

  it('gives windows that are runs of good hours', async () => {
    const { hours, sprayWindows } = await make().get({ latitude: 43.25, longitude: 76.95 })

    expect(sprayWindows.length).toBeGreaterThan(0)
    const first = sprayWindows[0]
    expect(hours.find((h) => h.time === first.from)?.sprayOk).toBe(true)
  })

  it('refuses a point that is not on the Earth like the server', async () => {
    await expect(make().get({ latitude: 91, longitude: 0 })).rejects.toMatchObject({
      status: 400,
      code: 'validation_failed',
    })
    await expect(make().get({ latitude: 0, longitude: 181 })).rejects.toBeInstanceOf(ApiError)
  })
})
