import { beforeAll, describe, expect, it } from 'vitest'

import i18n from '@/i18n'

import { formatDuration } from './format'

describe('formatDuration', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('formats minutes, hours and both', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(220)).toBe('3 h 40 min')
  })

  it('rounds before splitting, so the minutes never reach 60', () => {
    expect(formatDuration(59.6)).toBe('1 h')
    expect(formatDuration(119.7)).toBe('2 h')
    expect(formatDuration(59.4)).toBe('59 min')
  })
})
