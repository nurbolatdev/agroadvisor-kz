export type PluralForm = 'one' | 'few' | 'many' | 'other'

// The form of a noun after a whole number. i18next picks it with Intl.PluralRules, which the Hermes engine of
// the phones does not have (it falls back to "one" for 1 and "other" for the rest, so Russian would say
// "12 года"). So the form is chosen here, by the rules of each language, and the screens ask for the key
// themselves: `t(`...years_${pluralForm(language, n)}`, { n })`. Whole numbers only.
export function pluralForm(language: string, n: number): PluralForm {
  if (language === 'ru') {
    const last = n % 10
    const lastTwo = n % 100
    if (last === 1 && lastTwo !== 11) return 'one'
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few'
    return 'many'
  }
  if (language === 'en') return n === 1 ? 'one' : 'other'
  // Kazakh has no form that depends on the number after a numeral
  return 'other'
}
