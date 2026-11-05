import type { Language } from '@/i18n'

import type { DiseaseApi, DiseaseDetail, DiseaseSummary } from '../diseases'

type Options = { delayMs?: number }

type Entry = {
  code: string
  kind: DiseaseSummary['kind']
  severity: DiseaseSummary['severity']
  latinName?: string
  names: Record<Language, string>
}

// A small reference with real names of diseases and pests in the three languages, so that the screens are
// checked on texts of a real length (the longest one is the Kazakh name of the black scurf of potato).
// `<crop>__late_blight` and `<crop>__healthy` are the codes the mock diagnosis answers with, so every crop
// has them. `late_blight` here is only a conventional "main disease of the crop", not a real code of the
// model. The texts of the cards are placeholders, not agronomic advice.
const ENTRIES: Entry[] = [
  {
    code: 'potato__late_blight',
    kind: 'oomycete',
    severity: 'high',
    latinName: 'Phytophthora infestans',
    // the same name as the tomato one, as in the real reference (the crop is not in the name)
    names: { ru: 'Фитофтороз', kk: 'Фитофтороз', en: 'Late blight' },
  },
  {
    code: 'potato__rhizoctonia',
    kind: 'fungal',
    severity: 'medium',
    latinName: 'Rhizoctonia solani',
    names: {
      ru: 'Ризоктониоз (чёрная парша клубней)',
      kk: 'Картоп түйнегінің ризоктониозы (қара қабыршақ ауруы)',
      en: 'Black scurf of potato (Rhizoctonia)',
    },
  },
  {
    code: 'potato__colorado_beetle',
    kind: 'pest',
    severity: 'high',
    latinName: 'Leptinotarsa decemlineata',
    names: { ru: 'Колорадский жук', kk: 'Колорадо қоңызы', en: 'Colorado potato beetle' },
  },
  {
    code: 'potato__healthy',
    kind: 'healthy',
    severity: null,
    names: {
      ru: 'Здоровый лист картофеля',
      kk: 'Картоптың сау жапырағы',
      en: 'Healthy potato leaf',
    },
  },
  {
    code: 'tomato__late_blight',
    kind: 'oomycete',
    severity: 'high',
    latinName: 'Phytophthora infestans',
    names: { ru: 'Фитофтороз', kk: 'Фитофтороз', en: 'Late blight' },
  },
  {
    code: 'tomato__leaf_mold',
    kind: 'fungal',
    severity: 'low',
    latinName: 'Passalora fulva',
    names: { ru: 'Кладоспориоз томата', kk: 'Қызанақтың кладоспориозы', en: 'Tomato leaf mold' },
  },
  {
    code: 'tomato__whitefly',
    kind: 'pest',
    severity: 'medium',
    names: { ru: 'Белокрылка', kk: 'Ақ қанат', en: 'Whitefly' },
  },
  {
    code: 'tomato__healthy',
    kind: 'healthy',
    severity: null,
    names: { ru: 'Здоровый лист томата', kk: 'Қызанақтың сау жапырағы', en: 'Healthy tomato leaf' },
  },
  {
    code: 'corn__late_blight',
    kind: 'fungal',
    severity: 'medium',
    latinName: 'Exserohilum turcicum',
    names: {
      ru: 'Гельминтоспориоз кукурузы',
      kk: 'Жүгерінің гельминтоспориозы',
      en: 'Northern corn leaf blight',
    },
  },
  {
    code: 'corn__stem_borer',
    kind: 'pest',
    severity: 'high',
    latinName: 'Ostrinia nubilalis',
    names: { ru: 'Кукурузный мотылёк', kk: 'Жүгері көбелегі', en: 'European corn borer' },
  },
  {
    code: 'corn__healthy',
    kind: 'healthy',
    severity: null,
    names: { ru: 'Здоровый лист кукурузы', kk: 'Жүгерінің сау жапырағы', en: 'Healthy corn leaf' },
  },
  {
    code: 'wheat__late_blight',
    kind: 'fungal',
    severity: 'high',
    latinName: 'Puccinia striiformis',
    names: { ru: 'Жёлтая ржавчина пшеницы', kk: 'Бидайдың сары татаңы', en: 'Wheat yellow rust' },
  },
  {
    code: 'wheat__septoria',
    kind: 'fungal',
    severity: 'medium',
    latinName: 'Zymoseptoria tritici',
    names: { ru: 'Септориоз пшеницы', kk: 'Бидайдың септориозы', en: 'Septoria leaf blotch' },
  },
  {
    code: 'wheat__grain_beetle',
    kind: 'pest',
    severity: 'low',
    names: { ru: 'Хлебная жужелица', kk: 'Нан қоңызы', en: 'Grain ground beetle' },
  },
  {
    code: 'wheat__healthy',
    kind: 'healthy',
    severity: null,
    names: { ru: 'Здоровый лист пшеницы', kk: 'Бидайдың сау жапырағы', en: 'Healthy wheat leaf' },
  },
]

const SYMPTOMS: Record<Language, string[]> = {
  ru: ['Пятна на листьях (тестовый текст)', 'Налёт с нижней стороны листа (тестовый текст)'],
  kk: ['Жапырақтағы дақтар (сынақ мәтіні)', 'Жапырақтың астыңғы жағындағы кірпік (сынақ мәтіні)'],
  en: ['Spots on the leaves (test text)', 'A coating under the leaf (test text)'],
}

const CONDITIONS: Record<Language, string> = {
  ru: 'Влажная и прохладная погода (тестовый текст)',
  kk: 'Ылғалды әрі салқын ауа райы (сынақ мәтіні)',
  en: 'Humid and cool weather (test text)',
}

// Works without the backend. An unknown code (the mock diagnosis may answer with one the table does not
// have) still gets a card, named by its code, so a diagnosis never loses its page.
export function createMockDiseaseApi({ delayMs = 300 }: Options = {}): DiseaseApi {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))
  const summary = (entry: Entry, lang: Language): DiseaseSummary => ({
    code: entry.code,
    name: entry.names[lang],
    kind: entry.kind,
    severity: entry.severity,
    cropCode: entry.code.split('__')[0],
    latinName: entry.latinName,
  })
  const unknown = (code: string): Entry => ({
    code,
    kind: code.endsWith('__healthy') ? 'healthy' : 'fungal',
    severity: code.endsWith('__healthy') ? null : 'medium',
    names: { ru: code, kk: code, en: code },
  })

  return {
    // without a crop: the whole reference, as the real one
    list: async ({ crop, lang }) => {
      await wait()
      return ENTRIES.filter((e) => crop === undefined || e.code.startsWith(`${crop}__`)).map((e) =>
        summary(e, lang),
      )
    },
    get: async (code, lang) => {
      await wait()
      const entry = ENTRIES.find((e) => e.code === code) ?? unknown(code)
      const healthy = entry.kind === 'healthy'
      const detail: DiseaseDetail = {
        disease: summary(entry, lang),
        symptoms: healthy ? undefined : SYMPTOMS[lang],
        conditions: healthy ? undefined : CONDITIONS[lang],
        treatments: healthy
          ? []
          : [
              { product: 'Mock fungicide', type: 'chemical', dosage: 'mock', method: 'mock' },
              { product: 'Mock biological agent', type: 'biological', dosage: 'mock' },
            ],
      }
      return detail
    },
  }
}
