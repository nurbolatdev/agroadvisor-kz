import type { Disease } from '@/shared/types'

export const cornDiseases: Disease[] = [
  {
    id: 'corn-common-smut',
    crop: 'corn',
    name: 'Пузырчатая головня кукурузы',
    latinName: 'Ustilago maydis',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Вздутия (галлы) на початках, стеблях и листьях',
      'Галлы сначала белые, затем лопаются и выпускают чёрную пылящую массу спор',
    ],
    conditions: 'Жаркая засушливая погода, повреждения растений градом, вредителями или техникой',
    chemicalTreatment: [
      {
        name: 'Раксил',
        activeIngredient: 'тебуконазол',
        dosage: 'протравливание семян, по инструкции',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Триходермин',
        activeIngredient: 'Trichoderma harzianum',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: [
      'Устойчивые гибриды',
      'Удаление галлов до их созревания',
      'Севооборот, заделка растительных остатков',
    ],
  },
  {
    id: 'corn-northern-leaf-blight',
    crop: 'corn',
    name: 'Гельминтоспориоз кукурузы',
    latinName: 'Exserohilum turcicum',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Вытянутые серо-зелёные, затем бурые пятна длиной до 15 см на листьях',
      'Тёмный налёт спор на пятнах во влажную погоду',
    ],
    conditions: 'Умеренная температура 18–27 °C, частые росы и дожди',
    chemicalTreatment: [
      {
        name: 'Амистар Экстра',
        activeIngredient: 'азоксистробин + ципроконазол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Фитоспорин-М',
        activeIngredient: 'Bacillus subtilis',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Устойчивые гибриды', 'Глубокая заделка пожнивных остатков'],
  },
  {
    id: 'corn-european-borer',
    crop: 'corn',
    name: 'Кукурузный (стеблевой) мотылёк',
    latinName: 'Ostrinia nubilalis',
    kind: 'pest',
    severity: 'high',
    symptoms: [
      'Отверстия на стеблях с буровой мукой',
      'Надломленные метёлки и стебли',
      'Повреждённые гусеницами зёрна в початках',
    ],
    conditions: 'Тёплое лето, монокультура кукурузы, зимовка гусениц в остатках стеблей',
    chemicalTreatment: [
      {
        name: 'Кораген',
        activeIngredient: 'хлорантранилипрол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Трихограмма',
        activeIngredient: 'Trichogramma spp.',
        dosage: 'выпуск в начале яйцекладки, по рекомендации',
      },
    ],
    prevention: ['Измельчение и запашка стерни', 'Севооборот'],
  },
  {
    id: 'corn-ear-fusarium',
    crop: 'corn',
    name: 'Фузариоз початков',
    latinName: 'Fusarium spp.',
    kind: 'fungal',
    severity: 'high',
    symptoms: [
      'Розовато-белый налёт плесени на зёрнах початка',
      'Загнившие и щуплые зёрна у верхушки початка',
    ],
    conditions: 'Дожди в период созревания, повреждения початков гусеницами',
    chemicalTreatment: [
      {
        name: 'Амистар Экстра',
        activeIngredient: 'азоксистробин + ципроконазол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Триходермин',
        activeIngredient: 'Trichoderma harzianum',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Защита от кукурузного мотылька и совки', 'Своевременная уборка и сушка зерна'],
  },
  {
    id: 'corn-common-rust',
    crop: 'corn',
    name: 'Ржавчина кукурузы',
    latinName: 'Puccinia sorghi',
    kind: 'fungal',
    severity: 'low',
    symptoms: [
      'Коричнево-рыжие удлинённые пустулы на обеих сторонах листа',
      'Ранее отмирание листьев при сильном поражении',
    ],
    conditions: 'Умеренная температура 16–23 °C и высокая влажность',
    chemicalTreatment: [
      {
        name: 'Фалькон',
        activeIngredient: 'спироксамин + тебуконазол + триадименол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Фитоспорин-М',
        activeIngredient: 'Bacillus subtilis',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Устойчивые гибриды', 'Уничтожение растительных остатков'],
  },
  {
    id: 'corn-cotton-bollworm',
    crop: 'corn',
    name: 'Хлопковая совка',
    latinName: 'Helicoverpa armigera',
    kind: 'pest',
    severity: 'high',
    symptoms: [
      'Выеденные зёрна и экскременты в верхушке початка',
      'Зелёные или бурые гусеницы с полосами на початках и метёлках',
    ],
    conditions: 'Жаркое лето на юге Казахстана, несколько поколений за сезон',
    chemicalTreatment: [
      {
        name: 'Кораген',
        activeIngredient: 'хлорантранилипрол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Трихограмма',
        activeIngredient: 'Trichogramma spp.',
        dosage: 'выпуск в начале яйцекладки, по рекомендации',
      },
    ],
    prevention: ['Феромонные ловушки для мониторинга', 'Глубокая зяблевая вспашка'],
  },
]
