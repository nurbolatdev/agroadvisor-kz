import type ru from '@/i18n/locales/ru/common'
import type { Translation } from '@/i18n/types'

const common: Translation<typeof ru> = {
  appName: 'AgroAdvisor KZ',
  role: { admin: 'Administrator' },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry',
    edit: 'Edit',
    reject: 'Reject',
    approve: 'Approve',
    showAll: 'Show all ({{count}})',
    collapse: 'Collapse',
  },
  states: {
    loading: 'Loading…',
    noData: 'No data',
    loadError: 'Could not load the data',
    saveError: 'Could not save',
  },
  crops: {
    potato: 'Potato',
    tomato: 'Tomato',
    corn: 'Corn',
    wheat: 'Wheat',
  },
  period: 'Period',
  periodSuffix: {
    '7d': 'over 7 days',
    '30d': 'over 30 days',
    season: 'this season',
  },
  periods: {
    '7d': '7 days',
    '30d': '30 days',
    season: 'Season',
  },
}

export default common
