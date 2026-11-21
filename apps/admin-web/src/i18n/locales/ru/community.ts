const community = {
  title: 'Сообщество',
  subtitle: 'Активность сообщества фермеров и консультаций агрохимиков',
  outOf5: 'из 5',
  kpi: {
    questions: 'Вопросов {{period}}',
    firstAnswer: 'Время до первого ответа',
    resolved: 'Решённых вопросов',
    points: '{{change}} п. п.',
    unanswered: 'Без ответа > 24 ч',
  },
  activity: {
    title: 'Вопросы и ответы',
    buckets: {
      '7d': 'по дням',
      '30d': 'по неделям',
      season: 'по месяцам',
    },
    questions: 'вопросы',
    answers: 'ответы',
  },
  topMembers: {
    title: 'Самые активные',
    subtitle: 'ответов {{period}}',
    roles: {
      agrochemist: 'Агрохимик',
      farmer: 'Фермер',
    },
  },
  unanswered: {
    title: 'Без ответа больше 24 часов',
    subtitle: 'стоит подключить агрохимика',
    count_one: '{{count}} вопрос',
    count_few: '{{count}} вопроса',
    count_many: '{{count}} вопросов',
    count_other: '{{count}} вопроса',
    allAnswered: 'На все вопросы ответили',
    hours: '{{hours}} ч',
    invited: 'Агрохимик приглашён · {{name}}',
    invite: 'Позвать агрохимика',
  },
  inviteModal: {
    title: 'Пригласить агрохимика',
    prompt: 'Вопрос «{{title}}» — выберите проверенного специалиста:',
    legend: 'Агрохимик',
    submit: 'Пригласить',
    sending: 'Отправляем…',
    error: 'Не удалось отправить приглашение',
  },
  consultations: {
    title: 'Консультации',
    subtitle: 'чат фермер — агрохимик',
    requests: 'Заявок',
    closed: 'Закрыто',
    avgResponse: 'Среднее время ответа',
    avgRating: 'Средний рейтинг',
  },
}

export default community
