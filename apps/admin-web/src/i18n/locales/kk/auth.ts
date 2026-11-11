import type ru from '@/i18n/locales/ru/auth'
import type { Translation } from '@/i18n/types'

const auth: Translation<typeof ru> = {
  title: 'Әкімшілікке кіру',
  subtitle: 'Тек әкімшілерге арналған',
  login: 'Телефон немесе e-mail',
  password: 'Құпиясөз',
  submit: 'Кіру',
  submitting: 'Кіріп жатырмыз…',
  logout: 'Шығу',
  restoring: 'Сессия тексерілуде…',
  required: 'Өрісті толтырыңыз',
  errors: {
    invalid_credentials: 'Логин немесе құпиясөз қате',
    account_blocked: 'Аккаунт бұғатталған',
    rate_limited: 'Тым көп әрекет. Кейінірек қайталаңыз',
    not_admin: 'Бұл аккаунтта әкімші құқығы жоқ',
    network: 'Серверге қосылу мүмкін емес',
    generic: 'Кіру мүмкін болмады',
  },
}

export default auth
