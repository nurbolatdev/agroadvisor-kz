import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

import type { HttpClient } from './http'
import { createRegionDirectory } from './liveRegions'

const REGIONS = [
  { id: 1, name: 'Алматинская область' },
  { id: 2, name: 'Акмолинская область' },
]

function setup(answers: Array<unknown | Error> = [REGIONS]) {
  let call = 0
  const request = vi.fn(async () => {
    const answer = answers[Math.min(call++, answers.length - 1)]
    if (answer instanceof Error) throw answer
    return answer
  })
  return { directory: createRegionDirectory({ request } as unknown as HttpClient), request }
}

describe('region directory', () => {
  const language = i18n.language

  afterEach(async () => {
    await i18n.changeLanguage(language)
  })

  it('asks the backend once per language, without a token', async () => {
    const { directory, request } = setup()

    await directory.list()
    await directory.names()
    await directory.idByName('Акмолинская область')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/regions', { auth: false })
  })

  it('asks again after a failure', async () => {
    const { directory, request } = setup([new Error('down'), REGIONS])

    await expect(directory.list()).rejects.toThrow('down')
    await Promise.resolve()

    expect(await directory.names()).toEqual(['Алматинская область', 'Акмолинская область'])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('makes a new request for another language', async () => {
    const { directory, request } = setup()

    await i18n.changeLanguage('ru')
    await directory.list()
    await i18n.changeLanguage('en')
    await directory.list()

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('resolves names and ids both ways, unknown ones to undefined', async () => {
    const { directory } = setup()

    expect(await directory.nameById(2)).toBe('Акмолинская область')
    expect(await directory.idByName('Алматинская область')).toBe(1)
    expect(await directory.nameById(99)).toBeUndefined()
    expect(await directory.idByName('нет такой')).toBeUndefined()
  })
})
