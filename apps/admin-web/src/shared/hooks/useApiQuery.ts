import { type DependencyList, useCallback, useEffect, useState } from 'react'

export interface ApiQueryState<T> {
  /** Last loaded data; kept while a new request is in flight. */
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  /** Runs the request again, e.g. after an action changed the data. */
  reload: () => void
}

interface Settled<T> {
  key: DependencyList
  data?: T
  error?: Error
}

const sameKey = (a: DependencyList, b: DependencyList) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

/**
 * Loads data from `services/api` and tracks loading and error state.
 * The request re-runs when `deps` change; responses of outdated requests are ignored.
 */
export function useApiQuery<T>(request: () => Promise<T>, deps: DependencyList): ApiQueryState<T> {
  const [version, setVersion] = useState(0)
  const [settled, setSettled] = useState<Settled<T>>()
  const key = [...deps, version]

  useEffect(() => {
    let isCurrent = true
    request().then(
      (data) => {
        if (isCurrent) setSettled({ key, data })
      },
      (reason: unknown) => {
        if (isCurrent) {
          const error = reason instanceof Error ? reason : new Error(String(reason))
          setSettled((previous) => ({ key, data: previous?.data, error }))
        }
      },
    )
    return () => {
      isCurrent = false
    }
    // `request` and `key` are recreated on every render; `key` lists the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key)

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  const isCurrentKey = settled !== undefined && sameKey(settled.key, key)

  return {
    data: settled?.data,
    error: isCurrentKey ? settled.error : undefined,
    isLoading: !isCurrentKey,
    reload,
  }
}
