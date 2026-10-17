import type ru from '@/i18n/locales/ru/settings'
import type { Translation } from '@/i18n/types'

const settings: Translation<typeof ru> = {
  title: 'Баптаулар',
  subtitle: 'Профиль және әкімші панелінің параметрлері',
  profile: {
    title: 'Профиль',
    subtitle: 'Басқа әкімшілер сізді қалай көреді',
    noName: 'Атсыз',
    name: 'Аты',
    nameRequired: 'Атыңызды көрсетіңіз',
    email: 'Email',
  },
  interface: {
    title: 'Интерфейс',
    subtitle: 'Тіл және аналитика ашылатын кезең',
    language: 'Тіл',
    languageLabel: 'Интерфейс тілі',
    languageHint: 'Мәзірдегі таңдаумен бірдей. Тіл сақтағаннан кейін ауысады.',
    period: 'Әдепкі кезең',
    periodHint: 'Шолу, ЖИ сапасы және Қауымдастық осы кезеңмен ашылады.',
  },
  aiModel: {
    title: 'ЖИ моделі',
    subtitle: 'Диагноз қашан сенімсіз деп саналады',
    threshold: 'Сенімділік шегі, %',
    thresholdError: '{{min}}-ден {{max}}-ге дейін, қадамы {{step}}',
    hint: 'Шектен төмен диагноздар сенімсіз деп саналады: фермерге агрохимиктен сұрау ұсынылады. Шек «ЖИ сапасы» гистограммасында және Шолудағы «Сенімсіз» KPI-да қолданылады.',
  },
  notifications: {
    title: 'Хабарландырулар',
    subtitle: 'Әкімшіге не туралы хабарлау керек',
    items: {
      complaints: { label: 'Жаңа шағымдар', description: 'Қауымдастықтағы посттар мен жауаптарға' },
      verifications: {
        label: 'Агрохимиктердің верификация өтінімдері',
        description: 'Жаңа дипломдар мен сертификаттар',
      },
      shopRequests: {
        label: 'Агродүкендер бойынша өтінімдер',
        description: 'Жаңа дүкендер және деректердегі қателер',
      },
      weeklyReport: { label: 'Email-ге апталық есеп', description: 'Дүйсенбі сайын жиынтық' },
    },
  },
  saveBar: {
    unsaved: 'Сақталмаған өзгерістер бар',
    discard: 'Тастау',
    save: 'Өзгерістерді сақтау',
    saved: 'Сақталды',
  },
}

export default settings
