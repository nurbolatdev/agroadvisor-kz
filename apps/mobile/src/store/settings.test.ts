const mockData = new Map<string, string>()

jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockData.get(key),
    set: (key: string, value: string) => void mockData.set(key, value),
  },
}))

// The store reads the storage when its module is loaded, so every test loads a fresh copy of it.
function load() {
  jest.resetModules()
  const { useSettings } = jest.requireActual<typeof import('./settings')>('./settings')
  const { i18n } = jest.requireActual<typeof import('@/i18n')>('@/i18n')
  return { useSettings, i18n }
}

beforeEach(() => {
  mockData.clear()
})

describe('settings store', () => {
  it('saves the language and switches i18n', async () => {
    const { useSettings, i18n } = load()

    useSettings.getState().setLanguage('kk')

    expect(useSettings.getState().language).toBe('kk')
    expect(mockData.get('settings.language')).toBe('kk')
    expect(i18n.language).toBe('kk')
  })

  it('has no chosen language on the first launch: the language is only a guess', async () => {
    const { useSettings } = load()

    expect(useSettings.getState().languageChosen).toBe(false)
    expect(['ru', 'kk', 'en']).toContain(useSettings.getState().language)
    expect(mockData.has('settings.language')).toBe(false)
  })

  it('counts a saved language as chosen and uses it', async () => {
    mockData.set('settings.language', 'kk')

    const { useSettings } = load()

    expect(useSettings.getState()).toMatchObject({ language: 'kk', languageChosen: true })
  })

  it('does not count a saved value that is not a language', async () => {
    mockData.set('settings.language', 'de')

    const { useSettings } = load()

    expect(useSettings.getState().languageChosen).toBe(false)
    expect(['ru', 'kk', 'en']).toContain(useSettings.getState().language)
  })

  it('marks the language as chosen when it is set, also to the one that was already shown', async () => {
    const { useSettings } = load()
    const guessed = useSettings.getState().language

    useSettings.getState().setLanguage(guessed)

    expect(useSettings.getState()).toMatchObject({ language: guessed, languageChosen: true })
    expect(mockData.get('settings.language')).toBe(guessed)
  })
})
