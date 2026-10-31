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
  auth: {
    loginTitle: 'Вход',
    registerTitle: 'Регистрация',
    login: 'Телефон или e-mail',
    password: 'Пароль',
    fullName: 'Имя и фамилия',
    signIn: 'Войти',
    signUp: 'Создать аккаунт',
    noAccount: 'Нет аккаунта? Зарегистрироваться',
    haveAccount: 'Уже есть аккаунт? Войти',
    signOut: 'Выйти',
    errors: {
      required: 'Заполните поле',
      passwordShort: 'Минимум 8 символов',
      passwordLong: 'Пароль слишком длинный',
      blocked: 'Аккаунт заблокирован. Обратитесь в поддержку',
      invalidCredentials: 'Неверный телефон, e-mail или пароль',
      loginTaken: 'Этот телефон или e-mail уже занят',
      invalidLogin: 'Введите телефон или e-mail',
      network: 'Нет связи с сервером. Проверьте интернет и повторите',
      generic: 'Не получилось. Повторите позже',
    },
  },
  common: {
    empty: 'Здесь пока пусто',
    error: 'Что-то пошло не так',
    retry: 'Повторить',
  },
  home: {
    title: 'Главная',
    scaffoldReady: 'Каркас приложения готов',
  },
}

// Same shape for every language, but plain strings instead of ru literals.
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Translation = Widen<typeof ru>
