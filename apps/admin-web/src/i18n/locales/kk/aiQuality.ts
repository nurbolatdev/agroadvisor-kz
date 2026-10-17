import type ru from '@/i18n/locales/ru/aiQuality'
import type { Translation } from '@/i18n/types'

const aiQuality: Translation<typeof ru> = {
  title: 'ЖИ сапасы және география',
  subtitle: 'Модельдің нақты деректердегі сапасы және аурулардың аудандар бойынша таралуы',
  percent: '{{value}} %',
  confidence: {
    title: 'Модель сенімділігі',
    subtitle: 'диагноздардың үлестірімі, %',
    tooltipValue: 'Диагноздар үлесі',
    tooltipLabel: 'Сенімділік {{from}}–{{to}} %',
    belowThreshold: '{{threshold}} % шегінен төмен · {{share}}',
  },
  topDiseases: {
    title: 'Топ аурулар',
    subtitle: '{{period}} қойылған диагноздар саны',
    openInCatalog: 'Анықтамалықта ашу',
  },
  trainingData: {
    title: 'Қайта оқытуға арналған деректер',
    subtitle: 'агрохимик немесе қауымдастық растаған жағдайлар',
    ready: 'белгіленген фото экспортқа дайын',
    perWeek: 'бір аптада +{{value}}',
    classes_one: '{{count}} класс',
    classes_other: '{{count}} класс',
    export: 'Датасетті экспорттау',
    exporting: 'Файл дайындалуда…',
    exportError: 'Файлды дайындау мүмкін болмады',
  },
  mismatches: {
    title: 'ЖИ мен сарапшы айырмашылығы',
    subtitle: 'ЖИ бір диагноз қойды, сарапшы басқасын растады',
    aiLabel: 'ЖИ диагнозы',
    confirmed: 'Расталды',
    cases: 'Жағдай',
  },
  geography: {
    title: 'Аурулар географиясы',
    days_one: '{{count}} күн',
    days_other: '{{count}} күн',
    alerts_one: '{{count}} ошақ',
    alerts_other: '{{count}} ошақ',
    scheme: 'Аудандар сызбасы',
    districtLevel: '{{district}} ауданы: {{level}}',
    active: 'Белсенді ошақтар',
    cases_one: '{{count}} жағд.',
    cases_other: '{{count}} жағд.',
    district: '{{district}} ауд.',
    growth: 'өсу ×{{value}}',
    noGrowth: 'өсу —',
    levels: {
      outbreak: 'ошақ',
      growth: 'өсу',
      calm: 'тыныш',
    },
  },
}

export default aiQuality
