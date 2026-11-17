import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api); the contract is docs/api/weather.md.
// Every time in the answer is local to the point, without an offset.
export type Weather = Schemas['WeatherView']
export type WeatherNow = Schemas['Now']
export type WeatherHour = Schemas['HourView']
export type SprayWindow = Schemas['SprayWindowView']
export type WeatherPoint = Schemas['FieldPoint']

export type WeatherApi = {
  // the weather and the spraying hours for a point; 503 weather_unavailable and 429 rate_limited are retried later
  get: (point: WeatherPoint) => Promise<Weather>
}

export function weatherPath(point: WeatherPoint): string {
  return `/api/weather?latitude=${encodeURIComponent(String(point.latitude))}&longitude=${encodeURIComponent(String(point.longitude))}`
}

export function createWeatherApi(client: ApiClient): WeatherApi {
  return { get: (point) => client.request<Weather>(weatherPath(point)) }
}
