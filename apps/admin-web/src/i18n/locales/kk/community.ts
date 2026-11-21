import type ru from '@/i18n/locales/ru/community'
import type { Translation } from '@/i18n/types'

const community: Translation<typeof ru> = {
  title: 'Қауымдастық',
  subtitle: 'Фермерлер қауымдастығының және агрохимик кеңестерінің белсенділігі',
  outOf5: '5 балдан',
  kpi: {
    questions: '{{period, capitalize}} қойылған сұрақтар',
    firstAnswer: 'Алғашқы жауапқа дейінгі уақыт',
    resolved: 'Шешілген сұрақтар',
    points: '{{change}} п. т.',
    unanswered: '24 сағаттан астам жауапсыз',
  },
  activity: {
    title: 'Сұрақтар мен жауаптар',
    buckets: {
      '7d': 'күндер бойынша',
      '30d': 'апталар бойынша',
      season: 'айлар бойынша',
    },
    questions: 'сұрақтар',
    answers: 'жауаптар',
  },
  topMembers: {
    title: 'Ең белсенділер',
    subtitle: '{{period}} берілген жауаптар',
    roles: {
      agrochemist: 'Агрохимик',
      farmer: 'Фермер',
    },
  },
  unanswered: {
    title: '24 сағаттан астам жауапсыз',
    subtitle: 'агрохимикті қосқан жөн',
    count_one: '{{count}} сұрақ',
    count_other: '{{count}} сұрақ',
    allAnswered: 'Барлық сұрақтарға жауап берілді',
    hours: '{{hours}} сағ',
    invited: 'Агрохимик шақырылды · {{name}}',
    invite: 'Агрохимикті шақыру',
  },
  inviteModal: {
    title: 'Агрохимикті шақыру',
    prompt: '«{{title}}» сұрағы — тексерілген маманды таңдаңыз:',
    legend: 'Агрохимик',
    submit: 'Шақыру',
    sending: 'Жіберілуде…',
    error: 'Шақыруды жіберу мүмкін болмады',
  },
  consultations: {
    title: 'Кеңестер',
    subtitle: 'фермер — агрохимик чаты',
    requests: 'Өтінімдер',
    closed: 'Жабылды',
    avgResponse: 'Орташа жауап уақыты',
    avgRating: 'Орташа рейтинг',
  },
}

export default community
