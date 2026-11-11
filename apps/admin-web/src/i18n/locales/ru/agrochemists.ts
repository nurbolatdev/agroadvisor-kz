const agrochemists = {
  title: 'Верификация агрохимиков',
  subtitle: 'Проверьте документы перед публикацией профиля',
  search: 'Поиск по имени',
  statusesLabel: 'Статус заявок',
  statuses: {
    pending: { label: 'Ожидают проверки', badge: 'Нужно действие' },
    approved: { label: 'Подтверждены', badge: 'Активны' },
    rejected: { label: 'Отклонены за месяц', badge: 'Архив' },
  },
  documentKinds: {
    diploma: 'диплом',
    certificate: 'сертификат',
  },
  table: {
    specialist: 'Специалист',
    specialization: 'Специализация',
    region: 'Регион',
    documents: 'Документы',
    notUploaded: 'Не загружены',
    submitted: 'Подана',
    notFound: 'Никого не нашли по этому имени',
    empty: 'Заявок нет',
  },
  decision: {
    approved: 'Подтверждён',
    approvedOn: 'Подтверждён {{date}}',
    rejected: 'Отклонён',
    requestedOn: 'Запрошено {{date}}',
    request: 'Запросить',
    saveError: 'Не удалось сохранить решение',
    requestReason: 'Загрузите диплом или сертификат, подтверждающий квалификацию.',
    errors: {
      no_documents: 'Нельзя подтвердить: специалист не прислал документов',
      reason_required: 'Укажите причину',
      self_review_forbidden: 'Нельзя решать по собственной заявке',
      agrochemist_not_found: 'Заявка не найдена',
      network: 'Нет связи с сервером',
    },
  },
  documentsModal: {
    title: 'Документы специалиста',
    experience_one: '{{count}} год опыта',
    experience_few: '{{count}} года опыта',
    experience_many: '{{count}} лет опыта',
    experience_other: '{{count}} года опыта',
    scansNote: 'Сканы документов появятся после подключения файлового хранилища.',
  },
  rejectModal: {
    title: 'Отклонить заявку: {{name}}',
    note: 'Специалист увидит причину и сможет подать заявку заново.',
    reasonLabel: 'Причина отказа',
    reasons: {
      noDiploma: 'Нет диплома о профильном образовании',
      unreadable: 'Документы нечитаемы или неполные',
      mismatch: 'Данные в документах не совпадают с профилем',
      noExperience: 'Недостаточный опыт работы',
    },
  },
}

export default agrochemists
