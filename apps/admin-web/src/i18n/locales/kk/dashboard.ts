import type ru from '@/i18n/locales/ru/dashboard'
import type { Translation } from '@/i18n/types'

const dashboard: Translation<typeof ru> = {
  title: 'Шолу',
  subtitle: '{{period, capitalize}} жиналған деректер',
  subtitleUpdated: '{{period, capitalize}} жиналған деректер · бүгін {{time}} жаңартылды',
  kpi: {
    activeUsers: 'Белсенді қолданушылар',
    vsPrevious: 'алдыңғы кезеңге {{change}}%',
    diagnoses: 'Диагноздар',
    avgConfidence: 'Орташа сенімділік',
    points: '{{change}} п. т.',
    lowConfidence: 'Сенімсіз (<{{threshold}}%)',
    openComplaints: 'Ашық шағымдар',
    perDay: 'тәулікте {{change}}',
    pendingVerifications: 'Верификацияда',
    actionNeeded: 'әрекет қажет',
    allVerified: 'бәрі тексерілді',
  },
  diagnosesChart: {
    titleDaily: 'Күндер бойынша диагноздар',
    titleWeekly: 'Апталар бойынша диагноздар',
    subtitleDaily: '{{period}} {{total}} · күніне орта есеппен {{average}}',
    subtitleWeekly: '{{period}} {{total}} · аптасына орта есеппен {{average}}',
    tooltip: 'Диагноздар',
  },
  newUsers: {
    title: 'Жаңа пайдаланушылар',
    byWeeks: 'апталар бойынша',
    byMonths: 'айлар бойынша',
    farmers: 'фермерлер',
    agrochemists: 'агрохимиктер',
  },
  funnel: {
    title: 'Фермер жолының воронкасы',
    subtitle: 'фотодан препарат сатып алуға дейін',
    avgTime: 'Диагноздан алғашқы кеңеске дейінгі орташа уақыт',
    steps: {
      photo: 'Фото түсірді',
      diagnosis: 'Диагноз алды',
      treatment_plan: 'Емдеу жоспарын ашты',
      expert_or_community: 'Агрохимик не қауымдастық',
      shops_map: 'Дүкендер картасын ашты',
    },
  },
}

export default dashboard
