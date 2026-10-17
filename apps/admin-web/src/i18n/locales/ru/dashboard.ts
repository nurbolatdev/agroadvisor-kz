const dashboard = {
  title: 'Обзор',
  subtitle: 'Данные {{period}}',
  subtitleUpdated: 'Данные {{period}} · обновлено сегодня в {{time}}',
  kpi: {
    activeUsers: 'Активные пользователи',
    vsPrevious: '{{change}}% к прошлому периоду',
    diagnoses: 'Диагнозов',
    avgConfidence: 'Средняя уверенность',
    points: '{{change}} п. п.',
    lowConfidence: 'Неуверенных (<{{threshold}}%)',
    openComplaints: 'Открытые жалобы',
    perDay: '{{change}} за сутки',
    pendingVerifications: 'На верификации',
    actionNeeded: 'нужно действие',
    allVerified: 'все проверены',
  },
  diagnosesChart: {
    titleDaily: 'Диагнозы по дням',
    titleWeekly: 'Диагнозы по неделям',
    subtitleDaily: '{{total}} {{period}} · в среднем {{average}} в день',
    subtitleWeekly: '{{total}} {{period}} · в среднем {{average}} в неделю',
    tooltip: 'Диагнозов',
  },
  newUsers: {
    title: 'Новые пользователи',
    byWeeks: 'по неделям',
    byMonths: 'по месяцам',
    farmers: 'фермеры',
    agrochemists: 'агрохимики',
  },
  funnel: {
    title: 'Воронка пути фермера',
    subtitle: 'от фотографии до покупки препарата',
    avgTime: 'Среднее время от диагноза до первого совета',
    steps: {
      photo: 'Сделали фото',
      diagnosis: 'Получили диагноз',
      treatment_plan: 'Открыли план лечения',
      expert_or_community: 'Агрохимик или сообщество',
      shops_map: 'Открыли карту магазинов',
    },
  },
}

export default dashboard
