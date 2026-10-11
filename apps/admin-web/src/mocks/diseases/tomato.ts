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
]
