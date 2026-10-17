const common = {
  appName: 'AgroAdvisor KZ',
  role: { admin: 'Администратор' },
  actions: {
    save: 'Сохранить',
    cancel: 'Отменить',
    close: 'Закрыть',
    retry: 'Повторить',
    edit: 'Изменить',
    reject: 'Отклонить',
    approve: 'Подтвердить',
    showAll: 'Показать все ({{count}})',
    collapse: 'Свернуть',
  },
  states: {
    loading: 'Загрузка…',
    noData: 'Нет данных',
    loadError: 'Не удалось загрузить данные',
    saveError: 'Не удалось сохранить',
  },
  crops: {
    potato: 'Картофель',
    tomato: 'Томат',
    corn: 'Кукуруза',
    wheat: 'Пшеница',
  },
  period: 'Период',
  /** "за 30 дней" — inserted into subtitles as {{period}}. */
  periodSuffix: {
    '7d': 'за 7 дней',
    '30d': 'за 30 дней',
    season: 'за сезон',
  },
  periods: {
    '7d': '7 дней',
    '30d': '30 дней',
    season: 'Сезон',
  },
}

export default common
