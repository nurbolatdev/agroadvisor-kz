import type { Disease } from '@/shared/types'

export const tomatoDiseases: Disease[] = [
  {
    id: 'tomato-late-blight',
    crop: 'tomato',
    name: 'Фитофтороз томата',
    latinName: 'Phytophthora infestans',
    kind: 'fungal',
    severity: 'high',
    symptoms: [
      'Бурые пятна на листьях и тёмные полосы на стеблях',
      'Твёрдые бурые пятна на зелёных и спелых плодах',
      'Быстрое увядание куста за несколько дней',
    ],
    conditions: 'Перепады дневной и ночной температуры, туманы, высокая влажность',
    chemicalTreatment: [
      { name: 'Ридомил Голд МЦ', activeIngredient: 'манкоцеб + металаксил-М', dosage: '2,5 кг/га' },
      {
        name: 'Акробат МЦ',
        activeIngredient: 'диметоморф + манкоцеб',
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
    prevention: [
      'Полив под корень, без дождевания',
      'Проветривание теплиц',
      'Удаление нижних листьев',
    ],
  },
  {
    id: 'tomato-early-blight',
    crop: 'tomato',
    name: 'Альтернариоз томата',
    latinName: 'Alternaria solani',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Сухие бурые пятна с концентрическими кругами на старых листьях',
      'Тёмные вдавленные пятна у плодоножки',
    ],
    conditions: 'Жара выше 25 °C с росой, загущённые посадки',
    chemicalTreatment: [
      { name: 'Скор', activeIngredient: 'дифеноконазол', dosage: 'по инструкции производителя' },
    ],
    biologicalTreatment: [
      {
        name: 'Триходермин',
        activeIngredient: 'Trichoderma harzianum',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Севооборот 3–4 года', 'Мульчирование почвы'],
  },
  {
    id: 'tomato-bacterial-spot',
    crop: 'tomato',
    name: 'Бактериальная пятнистость томата',
    latinName: 'Xanthomonas vesicatoria',
    kind: 'bacterial',
    severity: 'medium',
    symptoms: [
      'Мелкие тёмные маслянистые пятна на листьях с жёлтым ободком',
      'Выпуклые чёрные точки с водянистой каймой на плодах',
    ],
    conditions: 'Тёплая погода 24–30 °C, дожди и дождевание, механические повреждения',
    chemicalTreatment: [
      {
        name: 'Абига-Пик',
        activeIngredient: 'хлорокись меди',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Фитолавин',
        activeIngredient: 'фитобактериомицин',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Протравливание семян', 'Работа с растениями только в сухую погоду'],
  },
  {
    id: 'tomato-leaf-mold',
    crop: 'tomato',
    name: 'Кладоспориоз томата',
    latinName: 'Passalora fulva',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Жёлтые пятна на верхней стороне листа',
      'Оливково-бурый бархатистый налёт снизу листа',
    ],
    conditions: 'Теплицы с влажностью выше 85 % и плохим проветриванием',
    chemicalTreatment: [
      {
        name: 'Абига-Пик',
        activeIngredient: 'хлорокись меди',
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
    prevention: ['Проветривание теплиц', 'Устойчивые гибриды'],
  },
  {
    id: 'tomato-mosaic',
    crop: 'tomato',
    name: 'Мозаика томата',
    latinName: 'Tomato mosaic virus (ToMV)',
    kind: 'viral',
    severity: 'medium',
    symptoms: [
      'Мозаичная светло- и тёмно-зелёная окраска листьев',
      'Нитевидные и деформированные листья',
      'Мелкие плоды с неравномерным окрашиванием',
    ],
    conditions: 'Передача через семена, руки и инструмент при пасынковании',
    chemicalTreatment: [
      {
        name: 'Не применяется',
        activeIngredient: '—',
        dosage: 'химических средств против вирусов нет',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Фармайод',
        activeIngredient: 'йод (дезинфекция инструмента)',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Протравливание семян', 'Удаление больных растений', 'Дезинфекция инструмента'],
  },
  {
    id: 'tomato-whitefly',
    crop: 'tomato',
    name: 'Тепличная белокрылка',
    latinName: 'Trialeurodes vaporariorum',
    kind: 'pest',
    severity: 'medium',
    symptoms: [
      'Мелкие белые бабочки на нижней стороне листьев',
      'Липкий налёт и сажистый грибок на листьях',
    ],
    conditions: 'Тёплые теплицы 22–28 °C, загущённые посадки',
    chemicalTreatment: [
      { name: 'Актара', activeIngredient: 'тиаметоксам', dosage: 'по инструкции производителя' },
    ],
    biologicalTreatment: [
      {
        name: 'Энкарзия',
        activeIngredient: 'Encarsia formosa',
        dosage: 'выпуск паразита по рекомендации',
      },
    ],
    prevention: ['Жёлтые клеевые ловушки', 'Удаление сорняков вокруг теплиц'],
  },
]
