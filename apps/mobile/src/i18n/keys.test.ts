import fs from 'node:fs'
import path from 'node:path'

import { en } from './en'
import { kk } from './kk'
import { ru } from './ru'

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((all, [key, child]) => {
    if (typeof child === 'object' && child !== null) {
      Object.assign(all, flatten(child, `${prefix}${key}.`))
    } else {
      all[`${prefix}${key}`] = String(child)
    }
    return all
  }, {})
}

const flat = { ru: flatten(ru), kk: flatten(kk), en: flatten(en) }

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort()

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
  })
}

describe('translation keys', () => {
  it('use the same placeholders in every language', () => {
    for (const [key, text] of Object.entries(flat.ru)) {
      expect({ key, lang: 'kk', found: placeholders(flat.kk[key]) }).toEqual({
        key,
        lang: 'kk',
        found: placeholders(text),
      })
      expect({ key, lang: 'en', found: placeholders(flat.en[key]) }).toEqual({
        key,
        lang: 'en',
        found: placeholders(text),
      })
    }
  })

  it('exist for every key written out in the code', () => {
    const used = new Set<string>()
    for (const file of sourceFiles(path.join(__dirname, '..'))) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z]+(?:\.[a-zA-Z]+)+)'/g))
        used.add(match[1])
    }
    expect(used.size).toBeGreaterThan(20)
    expect([...used].filter((key) => !(key in flat.ru))).toEqual([])
  })

  it('exist for every status, queue state, treatment tab and result action built from a variable', () => {
    const families = [
      ...['ok', 'low_confidence', 'unknown', 'crop_mismatch'].map(
        (s) => `diagnosis.result.status.${s}`,
      ),
      ...['waiting', 'sending', 'error', 'photoLost'].map((s) => `diagnosis.queue.status.${s}`),
      ...['chemical', 'biological'].map((s) => `diagnosis.treatment.tabs.${s}`),
      ...['retake', 'chooseCrop', 'useCrop', 'askAgronomist', 'askCommunity', 'offlineHint'].map(
        (s) => `diagnosis.result.actions.${s}`,
      ),
      ...['potato', 'tomato', 'corn', 'wheat'].map((s) => `diagnosis.crops.${s}`),
    ]
    for (const lang of ['ru', 'kk', 'en'] as const) {
      expect(families.filter((key) => !(key in flat[lang]))).toEqual([])
    }
  })
})
