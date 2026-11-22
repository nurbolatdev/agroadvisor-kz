import fs from 'node:fs'
import path from 'node:path'

import { allUploadProblems, problemKey } from '@/features/agrochemist/errors'
import type { CommunityProblem } from '@/features/community/helpers'
import type { ReportReason } from '@/api/community'

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
    // a key with a count is written out in the plural forms (key_one, key_few, ...)
    expect([...used].filter((key) => !(key in flat.ru) && !(`${key}_other` in flat.ru))).toEqual([])
  })

  it('exist for every status, queue state, treatment tab and result action built from a variable', () => {
    const families = [
      ...['ok', 'low_confidence', 'unknown', 'crop_mismatch'].map(
        (s) => `diagnosis.result.status.${s}`,
      ),
      ...['waiting', 'sending', 'error', 'photoLost', 'rejected'].map(
        (s) => `diagnosis.queue.status.${s}`,
      ),
      ...['chemical', 'biological'].map((s) => `diagnosis.treatment.tabs.${s}`),
      ...['retake', 'chooseCrop', 'useCrop', 'askAgronomist', 'askCommunity', 'offlineHint'].map(
        (s) => `diagnosis.result.actions.${s}`,
      ),
      ...['potato', 'tomato', 'corn', 'wheat'].map((s) => `diagnosis.crops.${s}`),
      ...['pending', 'approved', 'rejected', 'documentsRequested'].flatMap((s) => [
        `agrochemist.status.${s}.title`,
        `agrochemist.status.${s}.hint`,
      ]),
      ...allUploadProblems.map(problemKey),
    ]
    for (const lang of ['ru', 'kk', 'en'] as const) {
      expect(families.filter((key) => !(key in flat[lang]))).toEqual([])
    }
  })

  it('exist for every community status, filter, reason, problem, form error and age built from a variable', () => {
    const problems: CommunityProblem[] = [
      'offline',
      'region_required',
      'invalid_image',
      'payload_too_large',
      'rate_limited',
      'storage_unavailable',
      'not_found',
      'complaint_resolved',
      'server',
    ]
    const reasons: ReportReason[] = ['ads', 'misinformation', 'spam', 'abuse']
    const families = [
      ...['open', 'solved'].map((s) => `community.status.${s}`),
      ...['open', 'solved', 'unanswered'].map((s) => `community.filters.${s}`),
      ...['mine', 'myQuestions'].map((s) => `community.filters.${s}`),
      ...reasons.map((r) => `community.report.reasons.${r}`),
      ...problems.map((p) => `community.problems.${p}`),
      ...['offline', 'rate_limited', 'not_found', 'server'].map(
        (p) => `community.answer.problems.${p}`,
      ),
      ...['offline', 'server'].flatMap((r) => [
        `community.feed.errors.${r}`,
        `community.question.errors.${r}`,
      ]),
      ...['required', 'tooShort', 'tooLong'].map((e) => `community.ask.errors.title.${e}`),
      ...['required', 'tooLong'].map((e) => `community.ask.errors.text.${e}`),
      ...['tooMany', 'tooLarge'].map((e) => `community.ask.errors.photos.${e}`),
      ...['badPhoto', 'denied'].map((e) => `community.ask.photoProblems.${e}`),
      ...['minutes', 'hours', 'yesterday'].map((a) => `community.ago.${a}`),
    ]
    for (const lang of ['ru', 'kk', 'en'] as const) {
      expect(families.filter((key) => !(key in flat[lang]))).toEqual([])
    }
  })

  it('have every plural form of the community counters in every language', () => {
    const forms = ['one', 'few', 'many', 'other']
    const counters = ['community.card.answers', 'community.question.helpful']
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const missing = counters.flatMap((key) =>
        forms.map((form) => `${key}_${form}`).filter((full) => !(full in flat[lang])),
      )
      expect(missing).toEqual([])
    }
  })
})
