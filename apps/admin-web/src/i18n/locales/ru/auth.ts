const auth = {
  title: 'Вход в админку',
  subtitle: 'Только для администраторов',
  login: 'Телефон или e-mail',
  password: 'Пароль',
  submit: 'Войти',
  submitting: 'Входим…',
  logout: 'Выйти',
  restoring: 'Проверяем сессию…',
  required: 'Заполните поле',
  errors: {
    invalid_credentials: 'Неверный логин или пароль',
    account_blocked: 'Аккаунт заблокирован',
    rate_limited: 'Слишком много попыток. Повторите позже',
    not_admin: 'У этого аккаунта нет прав администратора',
    network: 'Нет связи с сервером',
    generic: 'Не удалось войти',
  },
}

export default auth
