import type { Disease } from '@/shared/types'

export const wheatDiseases: Disease[] = [
  {
    id: 'wheat-leaf-rust',
    crop: 'wheat',
    name: 'Бурая ржавчина пшеницы',
    latinName: 'Puccinia triticina',
    kind: 'fungal',
    severity: 'high',
    symptoms: [
      'Мелкие округлые рыже-бурые подушечки (пустулы) на листьях',
      'Ржавый порошок спор остаётся на пальцах',
      'Преждевременное засыхание листьев',
    ],
    conditions: 'Температура 15–22 °C, роса и дожди в период кущения и колошения',
    chemicalTreatment: [
      {
        name: 'Фалькон',
        activeIngredient: 'спироксамин + тебуконазол + триадименол',
        dosage: '0,6 л/га',
      },
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
    prevention: ['Устойчивые сорта', 'Уничтожение падалицы', 'Оптимальные сроки сева'],
  },
  {
    id: 'wheat-septoria',
    crop: 'wheat',
    name: 'Септориоз пшеницы',
    latinName: 'Zymoseptoria tritici',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Вытянутые светло-бурые пятна на листьях',
      'Мелкие чёрные точки (пикниды) внутри пятен',
    ],
    conditions: 'Прохладная дождливая погода, загущённые посевы',
    chemicalTreatment: [
      {
        name: 'Фалькон',
        activeIngredient: 'спироксамин + тебуконазол + триадименол',
        dosage: '0,6 л/га',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Фитоспорин-М',
        activeIngredient: 'Bacillus subtilis',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Протравливание семян', 'Севооборот, заделка стерни'],
  },
  {
    id: 'wheat-sunn-pest',
    crop: 'wheat',
    name: 'Вредная черепашка',
    latinName: 'Eurygaster integriceps',
    kind: 'pest',
    severity: 'high',
    symptoms: [
      'Белые и засохшие колосья после прокола стебля',
      'Щуплое зерно с тёмной точкой прокола и светлым пятном вокруг',
      'Ухудшение хлебопекарных качеств муки',
    ],
    conditions: 'Тёплая весна, перелёт клопов с мест зимовки в предгорьях',
    chemicalTreatment: [
      {
        name: 'Карате Зеон',
        activeIngredient: 'лямбда-цигалотрин',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Теленомусы',
        activeIngredient: 'Telenomus spp. (яйцееды)',
        dosage: 'сохранение естественных популяций',
      },
    ],
    prevention: ['Ранняя и быстрая уборка', 'Мониторинг численности клопов весной'],
  },
]
