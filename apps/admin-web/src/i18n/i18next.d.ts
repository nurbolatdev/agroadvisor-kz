import 'i18next'
import type { defaultNS, resources } from '@/i18n/resources'

// Typed keys: `t('actions.save')` is checked against the Russian resources.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['ru']
  }
}
