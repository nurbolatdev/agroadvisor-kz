import type ru from '@/i18n/locales/ru/moderation'
import type { Translation } from '@/i18n/types'

const moderation: Translation<typeof ru> = {
  title: 'Модерация',
  subtitle: 'Қауымдастықтағы посттар мен жауаптарға пайдаланушылар шағымдары',
  kpi: {
    today: 'Бүгінгі шағымдар',
    avgResolution: 'Шешудің орташа уақыты',
    resolvedWeek: 'Аптада шешілді',
  },
  reasons: {
    ads: 'Жарнама',
    misinformation: 'Дұрыс емес кеңес',
    spam: 'Спам',
    abuse: 'Қорлау',
  },
  statuses: {
    new: 'Жаңа',
    in_progress: 'Жұмыста',
    resolved: 'Шешілді',
  },
  statusFilters: {
    new: 'Жаңа',
    in_progress: 'Жұмыста',
    resolved: 'Шешілген',
  },
  kinds: {
    post: 'Пост',
    answer: 'Жауап',
  },
  kindFilters: {
    post: 'Посттар',
    answer: 'Жауаптар',
  },
  filters: {
    label: 'Шағым сүзгілері',
    reason: 'Шағым себебі',
    allReasons: 'Барлық себептер',
  },
  list: {
    label: 'Шағымдар тізімі',
    empty: 'Шағым жоқ',
    emptyDescription: 'Осы сүзгілер бойынша ештеңе табылмады.',
    back: 'Тізімге',
    selectTitle: 'Шағымды таңдаңыз',
    selectDescription: 'Шағым мәліметтері мен әрекеттер осында шығады.',
  },
  reports_one: '{{count}} шағым',
  reports_other: '{{count}} шағым',
  details: {
    title: {
      post: 'Постқа шағым',
      answer: 'Жауапқа шағым',
    },
    hidden: 'Жасырылған',
    reasons: 'Шағым себептері',
    history: 'Автор тарихы',
    onPlatform: 'Платформада {{since}}',
    posts_one: '{{count}} жарияланым',
    posts_other: '{{count}} жарияланым',
    warnings_one: '{{count}} ескерту',
    warnings_other: '{{count}} ескерту',
    noWarnings: 'Ескертусіз',
    blocked: 'Бұғатталған',
  },
  actions: {
    decisionLabel: 'Шешім себебі',
    decisions: {
      ads: 'Жарнама мен сауда ережеге қайшы',
      misinformation: 'Қауіпті немесе дұрыс емес кеңес',
      spam: 'Спам және қайталанатын хабарламалар',
      abuse: 'Қорлау және дөрекілік',
    },
    keepComment: 'Бұзушылық табылмады',
    results: {
      keep: 'Жарияланым қалдырылды',
      hide: 'Жарияланым жасырылды',
      block: 'Жарияланым жасырылды, автор бұғатталды',
    },
    keep: 'Қалдыру',
    saving: 'Сақталуда…',
    hide: {
      post: 'Жасыру',
      answer: 'Жасыру',
    },
    hiding: 'Жасырылуда…',
    block: 'Бұғаттау',
    blocking: 'Бұғатталуда…',
    saveError: 'Шешімді сақтау мүмкін болмады',
    confirmTitle: '{{name}} бұғатталсын ба?',
    confirmText:
      'Жарияланым жасырылады, ал автор қауымдастықта бұдан былай жаза алмайды. Себебі: {{reason}}.',
  },
}

export default moderation
