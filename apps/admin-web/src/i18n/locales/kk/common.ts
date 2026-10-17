import type ru from '@/i18n/locales/ru/common'
import type { Translation } from '@/i18n/types'

const common: Translation<typeof ru> = {
  appName: 'AgroAdvisor KZ',
  role: { admin: 'Әкімші' },
  actions: {
    save: 'Сақтау',
    cancel: 'Бас тарту',
    close: 'Жабу',
    retry: 'Қайталау',
    edit: 'Өзгерту',
    reject: 'Қабылдамау',
    approve: 'Растау',
    showAll: 'Барлығын көрсету ({{count}})',
    collapse: 'Жию',
  },
  states: {
    loading: 'Жүктелуде…',
    noData: 'Деректер жоқ',
    loadError: 'Деректерді жүктеу мүмкін болмады',
    saveError: 'Сақтау мүмкін болмады',
  },
  period: 'Кезең',
  periods: {
    '7d': '7 күн',
    '30d': '30 күн',
    season: 'Маусым',
  },
}

export default common
