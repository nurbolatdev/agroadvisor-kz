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
    back: 'Назад',
  },
  home: {
    title: 'Главная',
    scaffoldReady: 'Каркас приложения готов',
    catalog: 'Справочник',
    // the green card (screen 04)
    hero: {
      title: 'Сфотографируйте растение',
      subtitle: 'Определим болезнь за 10 секунд',
      action: 'Открыть камеру',
    },
    queue: 'Не отправлено: {{count}}',
    resultReady: 'Результат готов — открыть',
    // shown only when there are diagnoses
    recent: {
      title: 'Последние диагнозы',
      all: 'Все',
    },
  },
  // the places of the bottom bar (screens 04 and 19)
  tabs: {
    home: 'Главная',
    community: 'Сообщество',
    camera: 'Диагностика по фото',
    chats: 'Чаты',
    profile: 'Профиль',
  },
  history: {
    title: 'История',
    // short words for the badge of a line; the long explanations are on the result screen
    status: {
      disease: 'Болезнь',
      healthy: 'Здоров',
      undetermined: 'Не определено',
      withAgrochemist: 'У агрохимика',
      cured: 'Вылечено',
    },
    filter: {
      all: 'Все',
      noneLoaded: 'Среди загруженных диагнозов этой культуры нет',
      loadMore: 'Показать ещё',
      none: 'Диагнозов этой культуры нет',
      // the names on the chips, as the design writes them (screen 19)
      crop: { potato: 'Картофель', tomato: 'Томаты', corn: 'Кукуруза', wheat: 'Пшеница' },
    },
    empty: {
      title: 'Диагнозов пока нет',
      message: 'Сфотографируйте лист — результат появится здесь',
      action: 'Диагностика по фото',
    },
    errors: {
      offline: 'Нет связи с сервером. Проверьте интернет',
      server: 'Сервер не ответил. Попробуйте ещё раз',
    },
  },
  // the first launch: the choice of the language (screen 01)
  onboarding: {
    tagline: 'Помощник фермера: болезни растений, советы по поливу и связь с агрохимиком.',
    chooseLanguage: 'Выберите язык',
    // the same words in the other two languages, so that anyone finds their own
    chooseLanguageOthers: 'Тілді таңдаңыз · Choose language',
    continue: 'Продолжить',
    changeLater: 'Язык можно сменить в профиле',
  },
  // the reference of diseases and pests (screen 29)
  catalog: {
    title: 'Справочник',
    search: 'Болезнь или вредитель',
    searchClear: 'Очистить поиск',
    type: { disease: 'Болезни', pest: 'Вредители' },
    // the first word of the second line of a card
    kind: {
      fungal: 'Грибковое',
      bacterial: 'Бактериальное',
      viral: 'Вирусное',
      oomycete: 'Оомицетное',
      pest: 'Вредитель',
      healthy: 'Здоровое',
      other: 'Другое',
    },
    severity: { high: 'Опасно', medium: 'Средне', low: 'Низко' },
    none: 'Ничего не найдено',
    noneHint: 'Измените запрос или выберите другую культуру',
    // the card of one disease
    detail: {
      symptoms: 'Симптомы',
      conditions: 'Условия развития',
      prevention: 'Профилактика',
      treatment: 'Лечение',
      loadFailed: 'Не удалось загрузить карточку из справочника',
    },
    errors: {
      offline: 'Нет связи с сервером. Проверьте интернет',
      server: 'Сервер не ответил. Попробуйте ещё раз',
    },
  },
  diagnosis: {
    title: 'Диагностика',
    chooseCrop: 'Выберите культуру',
    chooseCropHint: 'Сначала культура, потом фото листа',
    crops: {
      potato: 'Картофель',
      tomato: 'Томат',
      corn: 'Кукуруза',
      wheat: 'Пшеница',
    },
    next: 'Дальше',
    camera: {
      title: 'Сфотографируйте лист',
      hint: 'Поместите больной лист в рамку. Дневной свет, без вспышки',
      shoot: 'Сделать фото',
      gallery: 'Выбрать из галереи',
      permissionTitle: 'Нужен доступ к камере',
      permissionText:
        'Камера нужна, чтобы сфотографировать больной лист. Можно выбрать фото из галереи',
      allow: 'Разрешить',
      openSettings: 'Открыть настройки',
    },
    analysis: {
      title: 'Анализ',
      steps: {
        prepare: 'Готовим фото',
        analyze: 'Отправляем и анализируем',
        done: 'Готово',
      },
      slow: 'Медленная сеть, ждём ответа…',
      retry: 'Повторить',
      retryIn: 'Повторить можно через {{seconds}} с',
      newPhoto: 'Другое фото',
    },
    result: {
      title: 'Результат',
      hint: 'Результат ориентировочный. Если сомневаетесь, спросите агрохимика',
      notFound: 'Результат не найден. Сделайте диагностику заново',
      possible: 'Возможный вариант, сверьте признаки',
      seesCrop: 'На фото, похоже, {{crop}}',
      chooseCropTitle: 'Какая это культура?',
      actions: {
        retake: 'Переснять',
        chooseCrop: 'Выбрать культуру',
        useCrop: 'Анализировать как {{crop}}',
        askAgronomist: 'Спросить агрохимика',
        askCommunity: 'Спросить сообщество',
        offlineHint: 'Покажите фото агрохимику или в местном агромагазине',
      },
      crop: 'Культура',
      confidence: 'Уверенность',
      placeholder: 'Тестовая модель: это не диагноз',
      status: {
        ok: 'Диагноз определён',
        low_confidence: 'Модель не уверена. Сделайте ещё одно фото',
        unknown: 'Не удалось определить болезнь',
        crop_mismatch: 'Похоже, на фото другая культура',
      },
      again: 'Новая диагностика',
      home: 'На главную',
    },
    treatment: {
      title: 'План лечения',
      open: 'План лечения',
      loadFailed: 'Не удалось загрузить лечение из справочника',
      safety:
        'Сверьте дозировку с этикеткой препарата. Работайте в средствах защиты. При сомнениях обратитесь к агрохимику.',
      testModel: 'Результат тестовой модели',
      healthy: 'Лечение не требуется',
      empty: 'Для этого вида лечение в справочнике не указано',
      tabs: { chemical: 'Химическое', biological: 'Биологическое' },
      activeIngredient: 'Действующее вещество',
      dosage: 'Дозировка',
      method: 'Способ применения',
    },
    queue: {
      title: 'Не отправлено',
      empty: 'Нет диагнозов в очереди',
      status: {
        waiting: 'Ожидает отправки',
        sending: 'Отправляется',
        error: 'Не удалось отправить',
        photoLost: 'Фото пропало',
        rejected: 'Сервер не принял',
      },
      retry: 'Повторить',
      discard: 'Удалить',
      dismiss: 'Понятно',
      newPhoto: 'Новое фото',
    },
    errors: {
      network: 'Нет связи с сервером. Проверьте интернет и повторите',
      blurry: 'Фото нечёткое. Держите телефон ровно и снимите ещё раз',
      dark: 'Фото слишком тёмное. Снимите при дневном свете',
      tooSmall: 'Фото слишком маленькое. Подойдите к листу ближе',
      lowQuality: 'Качество фото недостаточное. Снимите другое фото',
      invalidImage: 'Это не фото. Выберите JPEG или PNG',
      unknownCrop: 'Эта культура не поддерживается. Выберите другую',
      aiUnavailable: 'Сервис анализа временно недоступен. Повторите позже',
      aiError: 'При анализе произошла ошибка. Повторите',
      storage: 'Не удалось сохранить фото. Повторите позже',
      rateLimited: 'Слишком много запросов. Подождите минуту и повторите',
      keyReused: 'Отправка сбилась. Выберите фото заново',
      photoUnreadable: 'Не удалось прочитать фото. Выберите другое',
      photoTooLarge: 'Фото слишком большое. Выберите другое',
      photoLost: 'Фото не найдено на телефоне. Сделайте новое',
      generic: 'Не получилось. Повторите позже',
    },
  },
}

// Same shape for every language, but plain strings instead of ru literals.
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Translation = Widen<typeof ru>
