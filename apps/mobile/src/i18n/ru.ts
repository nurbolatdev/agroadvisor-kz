export const ru = {
  app: {
    name: 'AgroAdvisor KZ',
    tagline: 'Диагностика болезней растений и советы агронома',
  },
  language: {
    title: 'Язык',
    ru: 'Русский',
    kk: 'Қазақша',
    en: 'English',
  },
  home: {
    title: 'Главная',
    scaffoldReady: 'Каркас приложения готов',
  },
}

// Same shape for every language, but plain strings instead of ru literals.
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Translation = Widen<typeof ru>
