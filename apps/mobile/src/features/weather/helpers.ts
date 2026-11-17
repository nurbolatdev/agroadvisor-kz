import { ApiError, NetworkError } from '@/api/errors'
import type { SprayWindow, Weather, WeatherHour } from '@/api/weather'

// Every time of the answer is local to the point, "2026-11-17T07:00:00" without an offset, so it is read
// from the text and never through the zone of the phone.
type Local = { date: string; hour: number; minute: number }

export function parseLocal(time: string): Local {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(time)
  if (!match) return { date: time.slice(0, 10), hour: 0, minute: 0 }
  return { date: match[1], hour: Number(match[2]), minute: Number(match[3]) }
}

// "07:00" for the time of a window or an hour
export function clock(time: string): string {
  const { hour, minute } = parseLocal(time)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// "Fri" for a date of the point, in the language of the app
export function weekday(date: string, language: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language, {
    weekday: 'short',
    timeZone: 'UTC',
  })
  // ru and kk give "пт"; the frame has "Пт"
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
}

export const degrees = (value: number) => `${Math.round(value)}°`

// The icon and the word of a WMO code (https://open-meteo.com/en/docs#weather_variable_documentation)
export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export function skyOf(code: number | null | undefined): Sky {
  if (code === null || code === undefined) return 'cloudy'
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

// How an hour looks in the strip: green when it is good to spray, red when it is not and the weather is the
// reason (rain, a wind well above the limit, a temperature far out of range), yellow in between. The frame
// has the three colours; the first one is the rule of the server, the other two are only for the eye.
export type HourTone = 'good' | 'warn' | 'bad'

// (the rain of an entry is that of the hour before its time, as the source reports it, so the tile after a
// shower is the red one)
export function toneOf(hour: WeatherHour): HourTone {
  if (hour.sprayOk) return 'good'
  const rough =
    hour.precipitationMm > 0 || hour.windMs > 6 || hour.temperatureC < 5 || hour.temperatureC > 30
  return rough ? 'bad' : 'warn'
}

// The hours of the "By hours" strip: the current one and every second one after it, five in all
export function stripOf(hours: WeatherHour[], count = 5): WeatherHour[] {
  return hours.filter((_, i) => i % 2 === 0).slice(0, count)
}

export type DayPart = 'morning' | 'day' | 'evening' | 'allDay'
export type Day = {
  date: string
  minC: number
  maxC: number
  // the weather code of the hour nearest to noon
  code: number | null
  // null when no hour of the day is good
  spray: DayPart | null
}

const hoursOf = (hours: WeatherHour[], date: string) =>
  hours.filter((h) => parseLocal(h.time).date === date)

// The days of the forecast; the first one may be a part of a day (from the current hour). A day with
// no good hour is "not for spraying"; a day with many good hours is "all day", otherwise it is named by the
// time of its first good hour.
export function daysOf(hours: WeatherHour[]): Day[] {
  const dates = [...new Set(hours.map((h) => parseLocal(h.time).date))]
  return dates.map((date) => {
    const part = hoursOf(hours, date)
    const good = part.filter((h) => h.sprayOk)
    const noon = part.reduce((best, h) =>
      Math.abs(parseLocal(h.time).hour - 12) < Math.abs(parseLocal(best.time).hour - 12) ? h : best,
    )
    let spray: DayPart | null = null
    if (good.length >= 10) spray = 'allDay'
    else if (good.length > 0) {
      const first = parseLocal(good[0].time).hour
      spray = first < 12 ? 'morning' : first < 17 ? 'day' : 'evening'
    }
    return {
      date,
      minC: Math.min(...part.map((h) => h.temperatureC)),
      maxC: Math.max(...part.map((h) => h.temperatureC)),
      code: noon.weatherCode ?? null,
      spray,
    }
  })
}

// What the green card says: a window today, or a reason to wait and the next window
export type Advice =
  { kind: 'today'; window: SprayWindow } | { kind: 'later'; window: SprayWindow } | { kind: 'none' }

const durationOf = (w: SprayWindow) => Date.parse(`${w.to}Z`) - Date.parse(`${w.from}Z`)

export function adviceOf(weather: Weather): Advice {
  const today = parseLocal(weather.current.time).date
  const windows = weather.sprayWindows
  const ofToday = windows.filter((w) => parseLocal(w.from).date === today)
  if (ofToday.length > 0) {
    // the longest one; the earlier one when they are equal
    const best = ofToday.reduce((a, b) => (durationOf(b) > durationOf(a) ? b : a))
    return { kind: 'today', window: best }
  }
  const next = windows.find((w) => parseLocal(w.from).date > today)
  return next ? { kind: 'later', window: next } : { kind: 'none' }
}

// Why the weather could not be shown; the screen has a sentence for each.
export type WeatherProblem = 'offline' | 'unavailable' | 'rateLimited' | 'forbidden' | 'server'

export function weatherProblemOf(error: unknown): WeatherProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    if (error.status === 429) return 'rateLimited'
    // the source is out of reach (503) or answered with nonsense (502): a retry later may help
    if (error.status === 503 || error.status === 502) return 'unavailable'
    if (error.status === 403) return 'forbidden'
  }
  return 'server'
}
