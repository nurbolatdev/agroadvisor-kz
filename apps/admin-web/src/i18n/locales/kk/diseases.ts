import type ru from '@/i18n/locales/ru/diseases'
import type { Translation } from '@/i18n/types'

const diseases: Translation<typeof ru> = {
  title: 'Аурулар мен дәрілер',
  subtitle: 'MVP дақылдарына арналған анықтамалық',
  summary: 'MVP дақылдарына арналған анықтамалық · {{entries}}',
  entries_one: '{{count}} жазба',
  entries_other: '{{count}} жазба',
  searchLabel: 'Ауруды іздеу',
  searchPlaceholder: 'Атауы немесе латынша',
  cropFilter: 'Дақыл',
  allCrops: 'Барлық дақылдар',
  notFound: 'Ештеңе табылмады',
  notFoundDescription: 'Басқа атауды енгізіңіз немесе барлық дақылдарды таңдаңыз.',
  more: 'Толығырақ',
  kinds: {
    fungal: 'Саңырауқұлақ',
    bacterial: 'Бактериялық',
    viral: 'Вирустық',
    pest: 'Зиянкес',
  },
  severities: {
    high: 'Қауіптілігі жоғары',
    medium: 'Қауіптілігі орташа',
    low: 'Қауіптілігі төмен',
  },
  detail: {
    back: 'Барлық аурулар',
    missing: 'Ауру табылмады',
    missingDescription: 'Жазба жойылған болуы мүмкін немесе мекенжайда қате бар.',
    symptoms: 'Белгілері',
    conditions: 'Даму жағдайлары',
    chemical: 'Химиялық қорғау',
    chemicalNote: 'Мөлшерлер көрсету үшін берілген — препарат нұсқаулығымен салыстырыңыз',
    biological: 'Биологиялық қорғау',
    prevention: 'Алдын алу',
  },
  treatments: {
    product: 'Препарат',
    ingredient: 'Әсер етуші зат',
    dosage: 'Мөлшері',
  },
}

export default diseases
