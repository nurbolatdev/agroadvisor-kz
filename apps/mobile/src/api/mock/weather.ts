import { ApiError } from '../errors'
import type { SprayWindow, Weather, WeatherApi, WeatherHour } from '../weather'

type Options = { delayMs?: number; now?: () => number }

// The rule of the backend (docs/api/weather.md): wind up to 4 m/s, 10 to 25 °C, no precipitation for the
// 6 entries after the hour. The last six hours of a series are never good.
const MAX_WIND = 4
const MIN_TEMP = 10
const MAX_TEMP = 25
const DRY_HOURS = 6
const OFFSET_SECONDS = 5 * 3600

const pad = (n: number) => String(n).padStart(2, '0')
// local time of the point without an offset, the way the backend sends it
const local = (ms: number) => {
  const d = new Date(ms + OFFSET_SECONDS * 1000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00:00`
}

// Works without the backend: a smooth day (cold morning, warm afternoon, a little wind) and a shower on the
// second day, so the screen shows good, bad and mixed hours. Out-of-range points are 400 like the server.
export function createMockWeatherApi({ delayMs = 400, now = Date.now }: Options = {}): WeatherApi {
  return {
    get: async ({ latitude, longitude }) => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (!(Math.abs(latitude) <= 90) || !(Math.abs(longitude) <= 180)) {
        throw new ApiError(400, 'validation_failed', 'Validation failed', [
          { field: 'latitude', message: 'must be a point on the Earth' },
        ])
      }
      const start = Math.floor(now() / 3_600_000) * 3_600_000
      // to the end of the fifth local day, like the server
      const startHour = new Date(start + OFFSET_SECONDS * 1000).getUTCHours()
      const total = 24 - startHour + 4 * 24
      const raw = Array.from({ length: total }, (_, i) => {
        const time = start + i * 3_600_000
        const hour = new Date(time + OFFSET_SECONDS * 1000).getUTCHours()
        const day = Math.floor((i + 12) / 24)
        const temperatureC =
          Math.round((16 + 8 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)) * 10) / 10
        const rain = day === 1 && hour >= 14 && hour <= 18
        return {
          time: local(time),
          temperatureC,
          precipitationMm: rain ? 1.2 : 0,
          precipitationProbability: rain ? 80 : 10,
          windMs: Math.round((1 + 3 * Math.abs(Math.sin(i / 5)) + (hour >= 13 ? 2 : 0)) * 10) / 10,
          weatherCode: rain ? 61 : hour >= 13 ? 2 : 0,
        }
      })
      const hours: WeatherHour[] = raw.map((h, i) => {
        const after = raw.slice(i + 1, i + 1 + DRY_HOURS)
        const sprayOk =
          h.windMs <= MAX_WIND &&
          h.temperatureC >= MIN_TEMP &&
          h.temperatureC <= MAX_TEMP &&
          after.length === DRY_HOURS &&
          after.every((a) => a.precipitationMm === 0)
        return { ...h, sprayOk }
      })
      const sprayWindows: SprayWindow[] = []
      let from: string | null = null
      hours.forEach((h, i) => {
        if (h.sprayOk && from === null) from = h.time
        const next = hours[i + 1]
        if (from !== null && (!next || !next.sprayOk)) {
          sprayWindows.push({
            from,
            to: local(Date.parse(`${h.time}Z`) - OFFSET_SECONDS * 1000 + 3_600_000),
          })
          from = null
        }
      })
      const first = hours[0]
      const weather: Weather = {
        timezone: 'Asia/Almaty',
        utcOffsetSeconds: OFFSET_SECONDS,
        current: {
          time: first.time,
          temperatureC: first.temperatureC,
          windMs: first.windMs,
          precipitationMm: first.precipitationMm,
          weatherCode: first.weatherCode ?? 0,
        },
        hours,
        sprayWindows,
      }
      return weather
    },
  }
}
