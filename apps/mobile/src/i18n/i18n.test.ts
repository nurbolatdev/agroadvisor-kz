import { en } from './en'
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, resolveLanguage } from './index'
import { kk } from './kk'
import { ru } from './ru'

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

describe('translations', () => {
  it('have the same keys in ru, kk and en', () => {
    expect(keys(kk)).toEqual(keys(ru))
    expect(keys(en)).toEqual(keys(ru))
  })

  it('have no empty strings', () => {
    for (const dict of [ru, kk, en]) {
      const values = JSON.stringify(dict)
      expect(values).not.toContain('""')
    }
  })
})

describe('resolveLanguage', () => {
  it('prefers the saved language', () => {
    expect(resolveLanguage('kk', 'en')).toBe('kk')
  })

  it('falls back to the device language', () => {
    expect(resolveLanguage(undefined, 'en')).toBe('en')
  })

  it('falls back to Russian for unsupported languages', () => {
    expect(resolveLanguage('de', 'fr')).toBe(DEFAULT_LANGUAGE)
    expect(resolveLanguage(null, null)).toBe('ru')
  })

  it('knows exactly the three supported languages', () => {
    expect(LANGUAGES).toEqual(['ru', 'kk', 'en'])
    expect(isLanguage('kk')).toBe(true)
    expect(isLanguage('de')).toBe(false)
  })
})
