import { ApiError, NetworkError } from '@/api/errors'
import type { Weather, WeatherHour } from '@/api/weather'

import {
  adviceOf,
  clock,
  daysOf,
  degrees,
  parseLocal,
  skyOf,
  stripOf,
  toneOf,
  weatherProblemOf,
  weekday,
} from './helpers'

const hour = (time: string, extra: Partial<WeatherHour> = {}): WeatherHour => ({
  time,
  temperatureC: 15,
  precipitationMm: 0,
  windMs: 2,
  weatherCode: 0,
  precipitationProbability: 0,
  sprayOk: false,
  ...extra,
})

describe('times of the point', () => {
  it('reads the local time from the text', () => {
    expect(parseLocal('2026-11-17T07:00:00')).toEqual({ date: '2026-11-17', hour: 7, minute: 0 })
    expect(clock('2026-11-17T07:00:00')).toBe('07:00')
  })

  it('names the weekday of a date in the language, whatever the zone of the phone', () => {
    expect(weekday('2026-11-17', 'en')).toBe('Tue')
    expect(weekday('2026-11-20', 'en')).toBe('Fri')
  })

  it('rounds degrees', () => {
    expect(degrees(18.6)).toBe('19°')
    expect(degrees(-0.4)).toBe('0°')
    expect(degrees(-3.6)).toBe('-4°')
  })
})

describe('skyOf', () => {
  it.each([
    [0, 'clear'],
    [2, 'partly'],
    [3, 'cloudy'],
    [45, 'fog'],
    [53, 'drizzle'],
    [63, 'rain'],
    [81, 'rain'],
    [73, 'snow'],
    [95, 'storm'],
    [null, 'cloudy'],
  ])('code %s is %s', (code, sky) => {
    expect(skyOf(code)).toBe(sky)
  })
})

describe('toneOf', () => {
  it('is good when the server says so', () => {
    expect(toneOf(hour('2026-11-17T07:00:00', { sprayOk: true }))).toBe('good')
  })

  it('is bad for rain, a strong wind or an extreme temperature, warn for the rest', () => {
    expect(toneOf(hour('t', { precipitationMm: 0.4 }))).toBe('bad')
    expect(toneOf(hour('t', { windMs: 7 }))).toBe('bad')
    expect(toneOf(hour('t', { temperatureC: 31 }))).toBe('bad')
    expect(toneOf(hour('t', { windMs: 5 }))).toBe('warn')
    expect(toneOf(hour('t', { temperatureC: 8 }))).toBe('warn')
  })
})

describe('stripOf', () => {
  it('takes every second hour from the current one, five at most', () => {
    const hours = Array.from({ length: 30 }, (_, i) =>
      hour(`2026-11-17T${String(i % 24).padStart(2, '0')}:00:00`),
    )

    const strip = stripOf(hours)

    expect(strip).toHaveLength(5)
    expect(strip.map((h) => clock(h.time))).toEqual(['00:00', '02:00', '04:00', '06:00', '08:00'])
  })
})

describe('daysOf', () => {
  const day = (date: string, from: number, to: number, ok: (h: number) => boolean) =>
    Array.from({ length: to - from }, (_, i) => {
      const h = from + i
      return hour(`${date}T${String(h).padStart(2, '0')}:00:00`, {
        sprayOk: ok(h),
        temperatureC: h,
        weatherCode: h === 12 ? 61 : 0,
      })
    })

  it('splits by date and gives the range of temperatures and the weather around noon', () => {
    const [d] = daysOf(day('2026-11-17', 6, 20, () => false))

    expect(d).toMatchObject({ date: '2026-11-17', minC: 6, maxC: 19, code: 61, spray: null })
  })

  it('names the part of the day by the first good hour, "all day" for many good hours', () => {
    const days = daysOf([
      ...day('2026-11-17', 0, 24, (h) => h >= 7 && h <= 10),
      ...day('2026-11-18', 0, 24, (h) => h >= 13 && h <= 15),
      ...day('2026-11-19', 0, 24, (h) => h >= 18 && h <= 19),
      ...day('2026-11-20', 0, 24, (h) => h >= 6 && h <= 18),
    ])

    expect(days.map((d) => d.spray)).toEqual(['morning', 'day', 'evening', 'allDay'])
  })
})

describe('adviceOf', () => {
  const weather = (windows: Weather['sprayWindows']): Weather => ({
    timezone: 'Asia/Almaty',
    utcOffsetSeconds: 18000,
    current: {
      time: '2026-11-17T08:00:00',
      temperatureC: 12,
      windMs: 2,
      precipitationMm: 0,
      weatherCode: 0,
    },
    hours: [],
    sprayWindows: windows,
  })

  it('is the longest window of today', () => {
    const long = { from: '2026-11-17T09:00:00', to: '2026-11-17T13:00:00' }
    const advice = adviceOf(
      weather([
        { from: '2026-11-17T08:00:00', to: '2026-11-17T09:00:00' },
        long,
        { from: '2026-11-18T07:00:00', to: '2026-11-18T12:00:00' },
      ]),
    )

    expect(advice).toEqual({ kind: 'today', window: long })
  })

  it('is the next window when there is none today, and "none" when there is none at all', () => {
    const next = { from: '2026-11-18T07:00:00', to: '2026-11-18T11:00:00' }

    expect(adviceOf(weather([next]))).toEqual({ kind: 'later', window: next })
    expect(adviceOf(weather([]))).toEqual({ kind: 'none' })
  })
})

describe('weatherProblemOf', () => {
  it('maps what the server and the network say', () => {
    expect(weatherProblemOf(new NetworkError())).toBe('offline')
    expect(weatherProblemOf(new ApiError(503, 'weather_unavailable', 'x'))).toBe('unavailable')
    expect(weatherProblemOf(new ApiError(502, 'weather_error', 'x'))).toBe('unavailable')
    expect(weatherProblemOf(new ApiError(429, 'rate_limited', 'x'))).toBe('rateLimited')
    expect(weatherProblemOf(new ApiError(403, 'forbidden', 'x'))).toBe('forbidden')
    expect(weatherProblemOf(new ApiError(500, 'x', 'x'))).toBe('server')
    expect(weatherProblemOf(new Error('x'))).toBe('server')
  })
})
