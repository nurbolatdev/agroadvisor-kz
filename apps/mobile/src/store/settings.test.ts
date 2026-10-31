import { i18n } from '@/i18n'
import { storage } from '@/lib/storage'

import { useSettings } from './settings'

jest.mock('@/lib/storage', () => {
  const data = new Map<string, string>()
  return {
    storage: {
      getString: (key: string) => data.get(key),
      set: (key: string, value: string) => void data.set(key, value),
    },
  }
})

describe('settings store', () => {
  it('saves the language and switches i18n', () => {
    useSettings.getState().setLanguage('kk')

    expect(useSettings.getState().language).toBe('kk')
    expect(storage.getString('settings.language')).toBe('kk')
    expect(i18n.language).toBe('kk')
  })
})
