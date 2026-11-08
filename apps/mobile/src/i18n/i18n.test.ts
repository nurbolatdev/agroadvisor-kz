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

describe('years of experience', () => {
  const dictionaries = { ru, kk, en }
  // A text with a count, as the app asks for it: i18next picks the form with Intl.PluralRules. It runs on a
  // fresh copy of the modules, so that the polyfill (i18n/polyfills.ts) is what supplies the missing API.
  const translate = async (language: 'ru' | 'kk' | 'en', key: string, count: number) => {
    let instance: { init: (o: object) => Promise<unknown>; t: (k: string, o: object) => string } =
      null as never
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./polyfills')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      instance = require('i18next').createInstance()
    })
    await instance.init({
      lng: language,
      resources: { [language]: { translation: dictionaries[language] } },
      interpolation: { escapeValue: false },
    })
    return instance.t(key, { count })
  }
  const years = (language: 'ru' | 'kk' | 'en', n: number) =>
    translate(language, 'agrochemist.profile.years', n)

  // The Hermes engine of the phones has no Intl.PluralRules: the tests take it away, as on the phone.
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
  ])('is written in Russian as %s -> %s', async (n, text) => {
    expect(await years('ru', n)).toBe(text)
  })

  it.each([
    [1, '1 year'],
    [2, '2 years'],
    [5, '5 years'],
    [11, '11 years'],
    [21, '21 years'],
    [22, '22 years'],
  ])('is written in English as %s -> %s', async (n, text) => {
    expect(await years('en', n)).toBe(text)
  })

  it.each([1, 2, 5, 11, 21, 22])('does not change the noun in Kazakh (%s)', async (n) => {
    expect(await years('kk', n)).toBe(`${n} жыл`)
  })

  // every other text of the app that is asked for with a count (today: the queue on the home screen)
  it.each([1, 2, 5, 11, 21, 22])(
    'has a text for the queue with %s in every language',
    async (n) => {
      expect(await translate('ru', 'home.queue', n)).toBe(`Не отправлено: ${n}`)
      expect(await translate('kk', 'home.queue', n)).toBe(`Жіберілмеген: ${n}`)
      expect(await translate('en', 'home.queue', n)).toBe(`Not sent: ${n}`)
    },
  )
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
