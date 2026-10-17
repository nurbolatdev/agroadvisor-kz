import type ru from '@/i18n/locales/ru/layout'
import type { Translation } from '@/i18n/types'

const layout: Translation<typeof ru> = {
  nav: {
    label: 'Негізгі навигация',
    groups: { analytics: 'Аналитика', management: 'Басқару' },
    dashboard: 'Шолу',
    aiQuality: 'ЖИ сапасы',
    community: 'Қауымдастық',
    moderation: 'Модерация',
    verification: 'Верификация',
    users: 'Пайдаланушылар',
    shops: 'Агродүкендер',
    diseases: 'Аурулар мен дәрілер',
    settings: 'Баптаулар',
    newItems: 'жаңа',
  },
  menu: {
    title: 'Мәзір',
    open: 'Мәзірді ашу',
    close: 'Мәзірді жабу',
    hasTasks: 'Жаңа тапсырмалар бар',
  },
  language: 'Интерфейс тілі',
}

export default layout
