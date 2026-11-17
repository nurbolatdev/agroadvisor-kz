import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '@/api/errors'
import type { Field } from '@/api/fields'
import type { Weather } from '@/api/weather'
import { fieldsApi, weatherApi } from '@/services'

import { type WeatherProblem, weatherProblemOf } from './helpers'

export type FieldWeatherState =
  | { status: 'loading' }
  | { status: 'ready'; field: Field; weather: Weather; failed: WeatherProblem | null }
  // the field has no point, so there is nothing to ask the weather for
  | { status: 'noPoint'; field: Field }
  | { status: 'notFound' }
  | { status: 'error'; reason: WeatherProblem }

// The weather of one field: the field first (for its point), then the weather for the point. Nothing is read
// until `load` is called (the screen calls it whenever it is shown). A failed refresh keeps the last answer.
export function useFieldWeather(fieldId: string): { state: FieldWeatherState; load: () => void } {
  const [state, setState] = useState<FieldWeatherState>({ status: 'loading' })
  const latest = useRef(0)

  // another field: nothing of the previous one stays on screen, and its late answer is dropped
  useEffect(() => {
    latest.current += 1
    setState({ status: 'loading' })
  }, [fieldId])

  const load = useCallback(() => {
    const id = (latest.current += 1)
    const current = () => latest.current === id
    setState((s) => (s.status === 'error' || s.status === 'notFound' ? { status: 'loading' } : s))
    void (async () => {
      let field: Field
      try {
        field = await fieldsApi.get(fieldId)
      } catch (error) {
        if (!current()) return
        if (error instanceof ApiError && error.status === 404) setState({ status: 'notFound' })
        else setState((s) => keep(s, error))
        return
      }
      if (!current()) return
      if (!field.location) {
        setState({ status: 'noPoint', field })
        return
      }
      try {
        const weather = await weatherApi.get(field.location)
        if (current()) setState({ status: 'ready', field, weather, failed: null })
      } catch (error) {
        if (current()) setState((s) => keep(s, error))
      }
    })()
  }, [fieldId])

  return { state, load }
}

// A failed refresh keeps what is on screen and says why; a first load shows the reason
function keep(state: FieldWeatherState, error: unknown): FieldWeatherState {
  const reason = weatherProblemOf(error)
  if (state.status === 'ready') return { ...state, failed: reason }
  return { status: 'error', reason }
}
