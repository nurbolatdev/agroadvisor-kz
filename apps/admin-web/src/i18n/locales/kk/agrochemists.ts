import type ru from '@/i18n/locales/ru/agrochemists'
import type { Translation } from '@/i18n/types'

const agrochemists: Translation<typeof ru> = {
  title: 'Агрохимиктерді верификациялау',
  subtitle: 'Профильді жарияламас бұрын құжаттарды тексеріңіз',
  search: 'Аты бойынша іздеу',
  statusesLabel: 'Өтінім мәртебесі',
  statuses: {
    pending: { label: 'Тексеруді күтуде', badge: 'Әрекет қажет' },
    approved: { label: 'Расталған', badge: 'Белсенді' },
    rejected: { label: 'Айда қабылданбаған', badge: 'Мұрағат' },
  },
  documentKinds: {
    diploma: 'диплом',
    certificate: 'сертификат',
  },
  table: {
    specialist: 'Маман',
    specialization: 'Мамандануы',
    region: 'Өңір',
    documents: 'Құжаттар',
    notUploaded: 'Жүктелмеген',
    submitted: 'Берілді',
    notFound: 'Бұл атпен ешкім табылмады',
    empty: 'Өтінім жоқ',
  },
  decision: {
    approved: 'Расталды',
    approvedOn: 'Расталды {{date}}',
    rejected: 'Қабылданбады',
    requestedOn: 'Сұралды {{date}}',
    request: 'Сұрау',
    saveError: 'Шешімді сақтау мүмкін болмады',
  },
  documentsModal: {
    title: 'Маман құжаттары',
    experience_one: '{{count}} жыл тәжірибе',
    experience_other: '{{count}} жыл тәжірибе',
    scansNote: 'Құжат сканерлері файл қоймасы қосылғаннан кейін пайда болады.',
  },
  rejectModal: {
    title: 'Өтінімді қабылдамау: {{name}}',
    note: 'Маман себебін көріп, өтінімді қайта бере алады.',
    reasonLabel: 'Бас тарту себебі',
    reasons: {
      noDiploma: 'Бейіндік білім туралы диплом жоқ',
      unreadable: 'Құжаттар оқылмайды немесе толық емес',
      mismatch: 'Құжаттағы деректер профильге сәйкес емес',
      noExperience: 'Жұмыс тәжірибесі жеткіліксіз',
    },
  },
}

export default agrochemists
