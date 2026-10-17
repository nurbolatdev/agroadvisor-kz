import type { CommunityStats, StatsPeriod, UnansweredQuestion } from '@/shared/types'

/**
 * Open questions are current state, the same for every period. The mockup lists cucumbers
 * and apples; they are replaced with MVP crops.
 */
export const mockUnansweredQuestions: UnansweredQuestion[] = [
  {
    id: 'q-1',
    title: 'Скручиваются листья картофеля',
    crop: 'potato',
    district: 'Илийский р-н',
    hoursWithoutAnswer: 31,
  },
  {
    id: 'q-2',
    title: 'Белый налёт на листьях томата в теплице',
    crop: 'tomato',
    district: 'Талгарский р-н',
    hoursWithoutAnswer: 27,
  },
  {
    id: 'q-3',
    title: 'Чем обработать пшеницу после града?',
    crop: 'wheat',
    district: 'Енбекшиказахский р-н',
    hoursWithoutAnswer: 26,
  },
  {
    id: 'q-4',
    title: 'Тёмные пятна на клубнях после хранения',
    crop: 'potato',
    district: 'Карасайский р-н',
    hoursWithoutAnswer: 26,
  },
  {
    id: 'q-5',
    title: 'Жёлтые полосы на листьях кукурузы',
    crop: 'corn',
    district: 'Жамбылский р-н',
    hoursWithoutAnswer: 25,
  },
  {
    id: 'q-6',
    title: 'Когда сеять озимую пшеницу в этом году?',
    crop: 'wheat',
    district: 'Илийский р-н',
    hoursWithoutAnswer: 25,
  },
  {
    id: 'q-7',
    title: 'Трескаются плоды томата',
    crop: 'tomato',
    district: 'Карасайский р-н',
    hoursWithoutAnswer: 25,
  },
  {
    id: 'q-8',
    title: 'Тля на кукурузе — чем опрыскивать?',
    crop: 'corn',
    district: 'Талгарский р-н',
    hoursWithoutAnswer: 25,
  },
  {
    id: 'q-9',
    title: 'Почему желтеет пшеница после дождей?',
    crop: 'wheat',
    district: 'Енбекшиказахский р-н',
    hoursWithoutAnswer: 25,
  },
]

type PeriodStats = Omit<CommunityStats, 'unanswered'>

const UNANSWERED = { value: mockUnansweredQuestions.length, change: 2 }

const members = (answers: number[]): PeriodStats['topMembers'] => [
  { name: 'Айгуль Сарсенова', role: 'agrochemist', answers: answers[0] },
  { name: 'Сауле Ибраева', role: 'agrochemist', answers: answers[1] },
  { name: 'Ерлан Тулегенов', role: 'farmer', answers: answers[2] },
  { name: 'Болат Мусин', role: 'farmer', answers: answers[3] },
]

const activity = (first: number, questions: number[], answers: number[]) =>
  questions.map((count, index) => ({
    bucket: first + index,
    questions: count,
    answers: answers[index],
  }))

export const mockCommunityStats: Record<StatsPeriod, PeriodStats> = {
  '7d': {
    period: '7d',
    questions: { value: 98, changePercent: 9 },
    firstAnswerMinutes: { value: 150, changeMinutes: -15 },
    resolvedShare: { percent: 66, changePoints: 2 },
    unansweredOver24h: UNANSWERED,
    activity: activity(0, [11, 13, 12, 15, 14, 16, 17], [25, 30, 27, 35, 33, 38, 41]),
    topMembers: members([18, 14, 9, 7]),
    consultations: { requests: 44, closed: 40, avgResponseMinutes: 35, avgRating: 4.8 },
  },
  '30d': {
    period: '30d',
    questions: { value: 412, changePercent: 21 },
    firstAnswerMinutes: { value: 135, changeMinutes: -40 },
    resolvedShare: { percent: 68, changePoints: 6 },
    unansweredOver24h: UNANSWERED,
    activity: activity(1, [84, 92, 104, 132], [196, 228, 251, 297]),
    topMembers: members([64, 51, 33, 27]),
    consultations: { requests: 186, closed: 171, avgResponseMinutes: 38, avgRating: 4.7 },
  },
  season: {
    period: 'season',
    questions: { value: 1860, changePercent: 44 },
    firstAnswerMinutes: { value: 160, changeMinutes: -55 },
    resolvedShare: { percent: 63, changePoints: 11 },
    unansweredOver24h: UNANSWERED,
    activity: activity(3, [150, 260, 330, 360, 340, 420], [330, 610, 790, 860, 820, 1010]),
    topMembers: members([280, 231, 140, 118]),
    consultations: { requests: 812, closed: 779, avgResponseMinutes: 41, avgRating: 4.6 },
  },
}
