import type { Translation } from './ru'

export const kk: Translation = {
  app: {
    name: 'AgroAdvisor KZ',
    tagline: 'Өсімдік ауруларын диагностикалау және агроном кеңестері',
  },
  language: {
    title: 'Тіл',
    ru: 'Русский',
    kk: 'Қазақша',
    en: 'English',
  },
  auth: {
    loginTitle: 'Кіру',
    registerTitle: 'Тіркелу',
    login: 'Телефон немесе e-mail',
    password: 'Құпиясөз',
    fullName: 'Аты-жөні',
    signIn: 'Кіру',
    signUp: 'Аккаунт жасау',
    noAccount: 'Аккаунт жоқ па? Тіркелу',
    haveAccount: 'Аккаунт бар ма? Кіру',
    signOut: 'Шығу',
    hello: 'Сәлеметсіз бе, {{name}}',
    errors: {
      required: 'Өрісті толтырыңыз',
      passwordShort: 'Кемінде 8 таңба',
      passwordLong: '72 таңбадан аспауы керек',
      invalidCredentials: 'Телефон, e-mail немесе құпиясөз қате',
      loginTaken: 'Бұл телефон немесе e-mail бос емес',
      invalidLogin: 'Телефон нөмірін немесе e-mail енгізіңіз',
      network: 'Серверге қосылу жоқ. Интернетті тексеріп, қайталаңыз',
      generic: 'Болмады. Кейінірек қайталаңыз',
    },
  },
  common: {
    empty: 'Әзірге бос',
    error: 'Бірдеңе дұрыс болмады',
    retry: 'Қайталау',
  },
  home: {
    title: 'Басты бет',
    scaffoldReady: 'Қосымша каркасы дайын',
  },
}
