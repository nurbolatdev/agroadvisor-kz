import { daysAgo } from '@/mocks/time'
import type {
  AiMismatch,
  AiQualityStats,
  CropId,
  DiseaseGeography,
  StatsPeriod,
  TopDisease,
  TrainingSample,
} from '@/shared/types'

/** Shares below 70 % add up to the overview KPI: 10 / 11 / 13 %. */
const HISTOGRAMS: Record<StatsPeriod, number[]> = {
  '7d': [0.3, 0.5, 0.8, 1.1, 1.5, 2.3, 3.5, 25, 39, 26],
  '30d': [0.4, 0.6, 0.9, 1.2, 1.6, 2.5, 3.8, 24, 38, 27],
  season: [0.6, 0.8, 1.1, 1.5, 2, 3, 4, 25, 36, 26],
}

const topDiseases = (counts: number[]): TopDisease[] =>
  [
    { name: 'Фитофтороз томата', diseaseId: 'tomato-late-blight' },
    { name: 'Жёлтая ржавчина', diseaseId: 'wheat-yellow-rust' },
    { name: 'Септориоз', diseaseId: 'wheat-septoria' },
    { name: 'Мучнистая роса' },
    { name: 'Альтернариоз' },
    // The mockup shows apple scab; apples are not an MVP crop, so corn smut takes its place.
    { name: 'Пузырчатая головня кукурузы', diseaseId: 'corn-common-smut' },
  ].map((disease, index) => ({ ...disease, count: counts[index] }))

const mismatches = (cases: number[]): AiMismatch[] =>
  [
    { aiLabel: 'Септориоз', confirmedLabel: 'Альтернариоз' },
    { aiLabel: 'Ранняя пятнистость', confirmedLabel: 'Фитофтороз' },
    { aiLabel: 'Здоровое растение', confirmedLabel: 'Дефицит азота' },
    { aiLabel: 'Мучнистая роса', confirmedLabel: 'Ложная мучнистая роса' },
    { aiLabel: 'Бурая ржавчина', confirmedLabel: 'Жёлтая ржавчина' },
  ].map((row, index) => ({ ...row, cases: cases[index] }))

/** Outbreaks are a weekly signal, so the map always shows the last 7 days. */
const GEOGRAPHY: DiseaseGeography = {
  region: 'Алматинская обл.',
  days: 7,
  districts: [
    { id: 'karasay', name: 'Карасайский' },
    { id: 'talgar', name: 'Талгарский' },
    { id: 'ili', name: 'Илийский' },
    { id: 'enbekshikazakh', name: 'Енбекшиказахский' },
  ],
  outbreaks: [
    { districtId: 'karasay', disease: 'Жёлтая ржавчина', cases: 14, growth: 2 },
    { districtId: 'talgar', disease: 'Фитофтороз', cases: 7, growth: 1.4 },
    { districtId: 'ili', disease: 'Септориоз', cases: 3, growth: null },
  ],
}

const TRAINING_DATA = { labeled: 1284, addedThisWeek: 146, classes: 18 }

export const mockAiQualityStats: Record<StatsPeriod, AiQualityStats> = {
  '7d': {
    period: '7d',
    confidenceHistogram: HISTOGRAMS['7d'],
    topDiseases: topDiseases([186, 171, 112, 95, 70, 49]),
    trainingData: TRAINING_DATA,
    mismatches: mismatches([6, 4, 4, 2, 2]),
    geography: GEOGRAPHY,
  },
  '30d': {
    period: '30d',
    confidenceHistogram: HISTOGRAMS['30d'],
    topDiseases: topDiseases([612, 540, 388, 301, 244, 180]),
    trainingData: TRAINING_DATA,
    mismatches: mismatches([23, 17, 14, 9, 7]),
    geography: GEOGRAPHY,
  },
  season: {
    period: 'season',
    confidenceHistogram: HISTOGRAMS.season,
    topDiseases: topDiseases([2650, 2380, 1720, 1310, 1090, 790]),
    trainingData: TRAINING_DATA,
    mismatches: mismatches([96, 71, 58, 37, 29]),
    geography: GEOGRAPHY,
  },
}

const LABELS: Record<CropId, string[]> = {
  potato: [
    'Фитофтороз картофеля',
    'Альтернариоз картофеля',
    'Колорадский жук',
    'Здоровое растение',
  ],
  tomato: [
    'Фитофтороз томата',
    'Альтернариоз томата',
    'Бактериальная пятнистость',
    'Здоровое растение',
  ],
  corn: ['Пузырчатая головня', 'Гельминтоспориоз', 'Кукурузный мотылёк', 'Здоровое растение'],
  wheat: ['Бурая ржавчина', 'Жёлтая ржавчина', 'Септориоз', 'Здоровое растение'],
}
const CROPS = Object.keys(LABELS) as CropId[]

/** Deterministic pseudo-random numbers, so the exported file is the same on every run. */
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

/** Labeled photos for the dataset export; the row count matches `trainingData.labeled`. */
export function buildTrainingSamples(count = TRAINING_DATA.labeled): TrainingSample[] {
  const random = seededRandom(42)
  return Array.from({ length: count }, (_, index) => {
    const crop = CROPS[Math.floor(random() * CROPS.length)]
    const labels = LABELS[crop]
    const confirmedLabel = labels[Math.floor(random() * labels.length)]
    // About one sample in eight is a model mistake corrected by an expert.
    const aiLabel = random() < 0.12 ? labels[Math.floor(random() * labels.length)] : confirmedLabel
    return {
      id: `s-${String(index + 1).padStart(5, '0')}`,
      crop,
      aiLabel,
      confirmedLabel,
      confidence: Math.round((0.45 + random() * 0.55) * 100) / 100,
      confirmedBy: random() < 0.7 ? 'agrochemist' : 'community',
      date: daysAgo(Math.floor(random() * 120)),
    }
  })
}
