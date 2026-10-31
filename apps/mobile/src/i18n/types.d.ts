import type { Translation } from './ru'

// Typed keys: t('typo') fails typecheck.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Translation }
  }
}
