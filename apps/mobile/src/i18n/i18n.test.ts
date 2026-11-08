import { en } from './en'
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, resolveLanguage } from './index'
import { kk } from './kk'
import { pluralForm } from './plural'
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

describe('years of experience', () => {
  const dictionaries = { ru, kk, en }
  // what the profile does: the form by pluralForm, the text from the dictionary
  const years = (language: 'ru' | 'kk' | 'en', n: number) =>
    dictionaries[language].agrochemist.profile[`years_${pluralForm(language, n)}`].replace(
      '{{n}}',
      String(n),
    )

  // The phones' Hermes has no Intl.PluralRules (i18next would say "12 года"): nothing here may need it.
  const original = Intl.PluralRules
  beforeAll(() => {
    // @ts-expect-error simulating the engine of the phone
    delete Intl.PluralRules
  })
  afterAll(() => {
    Object.defineProperty(Intl, 'PluralRules', {
      value: original,
      configurable: true,
      writable: true,
    })
  })

  it.each([
    [1, '1 год'],
    [2, '2 года'],
    [4, '4 года'],
    [5, '5 лет'],
    [11, '11 лет'],
    [12, '12 лет'],
    [14, '14 лет'],
    [21, '21 год'],
    [22, '22 года'],
    [25, '25 лет'],
    [111, '111 лет'],
  ])('is written in Russian as %s -> %s', (n, text) => {
    expect(years('ru', n)).toBe(text)
  })

  it.each([
    [1, '1 year'],
    [2, '2 years'],
    [12, '12 years'],
  ])('is written in English as %s -> %s', (n, text) => {
    expect(years('en', n)).toBe(text)
  })

  it.each([1, 2, 5, 12, 21])('does not change the noun in Kazakh (%s)', (n) => {
    expect(years('kk', n)).toBe(`${n} жыл`)
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
