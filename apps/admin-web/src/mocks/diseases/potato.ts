import type { Disease } from '@/shared/types'

export const potatoDiseases: Disease[] = [
  {
    id: 'potato-late-blight',
    crop: 'potato',
    name: 'Фитофтороз картофеля',
    latinName: 'Phytophthora infestans',
    kind: 'fungal',
    severity: 'high',
    symptoms: [
      'Бурые расплывчатые пятна на листьях, по краю — светлая кайма',
      'Белый налёт на нижней стороне листа во влажную погоду',
      'Твёрдые бурые вдавленные пятна на клубнях',
    ],
    conditions: 'Прохладная влажная погода 15–20 °C, долгая роса и затяжные дожди',
    chemicalTreatment: [
      { name: 'Ридомил Голд МЦ', activeIngredient: 'манкоцеб + металаксил-М', dosage: '2,5 кг/га' },
      { name: 'Ревус', activeIngredient: 'мандипропамид', dosage: '0,6 л/га' },
    ],
    biologicalTreatment: [
      {
        name: 'Фитоспорин-М',
        activeIngredient: 'Bacillus subtilis',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: [
      'Здоровый семенной материал',
      'Окучивание и удаление ботвы за 2 недели до уборки',
      'Севооборот, не сажать рядом с томатом',
    ],
  },
  {
    id: 'potato-early-blight',
    crop: 'potato',
    name: 'Альтернариоз картофеля',
    latinName: 'Alternaria solani',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Сухие бурые пятна с концентрическими кругами на нижних листьях',
      'Пожелтение и отмирание листьев снизу вверх',
    ],
    conditions: 'Жаркая погода 25–30 °C с ночной росой, ослабленные растения',
    chemicalTreatment: [
      { name: 'Скор', activeIngredient: 'дифеноконазол', dosage: 'по инструкции производителя' },
      { name: 'Дитан М-45', activeIngredient: 'манкоцеб', dosage: 'по инструкции производителя' },
    ],
    biologicalTreatment: [
      {
        name: 'Фитоспорин-М',
        activeIngredient: 'Bacillus subtilis',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Сбалансированное питание, особенно калий', 'Уничтожение растительных остатков'],
  },
  {
    id: 'potato-colorado-beetle',
    crop: 'potato',
    name: 'Колорадский жук',
    latinName: 'Leptinotarsa decemlineata',
    kind: 'pest',
    severity: 'high',
    symptoms: [
      'Объеденные листья, от растения остаются стебли',
      'Оранжевые яйцекладки на нижней стороне листа',
      'Красные личинки и полосатые жуки на ботве',
    ],
    conditions: 'Тёплая сухая погода, массовое появление в начале лета',
    chemicalTreatment: [
      { name: 'Актара', activeIngredient: 'тиаметоксам', dosage: 'по инструкции производителя' },
      {
        name: 'Кораген',
        activeIngredient: 'хлорантранилипрол',
        dosage: 'по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Битоксибациллин',
        activeIngredient: 'Bacillus thuringiensis',
        dosage: 'по инструкции, по молодым личинкам',
      },
    ],
    prevention: ['Ручной сбор жуков и яйцекладок', 'Ранняя посадка и севооборот'],
  },
  {
    id: 'potato-rhizoctonia',
    crop: 'potato',
    name: 'Ризоктониоз картофеля',
    latinName: 'Rhizoctonia solani',
    kind: 'fungal',
    severity: 'medium',
    symptoms: [
      'Чёрные корочки (склероции) на кожуре клубней',
      'Бурые язвы на ростках, изреженные всходы',
      'Белый войлочный налёт у основания стебля',
    ],
    conditions: 'Холодная влажная почва при посадке, ранние сроки посадки',
    chemicalTreatment: [
      {
        name: 'Максим',
        activeIngredient: 'флудиоксонил',
        dosage: 'протравливание клубней, по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Триходермин',
        activeIngredient: 'Trichoderma harzianum',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Здоровый семенной картофель', 'Посадка в прогретую почву'],
  },
  {
    id: 'potato-common-scab',
    crop: 'potato',
    name: 'Парша обыкновенная',
    latinName: 'Streptomyces scabies',
    kind: 'bacterial',
    severity: 'low',
    symptoms: [
      'Шершавые коричневые язвы на кожуре клубней',
      'Пробковые пятна, иногда глубокие ямки',
    ],
    conditions: 'Сухая щелочная почва в период клубнеобразования, свежий навоз',
    chemicalTreatment: [
      {
        name: 'Максим',
        activeIngredient: 'флудиоксонил',
        dosage: 'протравливание клубней, по инструкции производителя',
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
      'Полив в период клубнеобразования',
      'Не вносить свежий навоз и известь перед посадкой',
    ],
  },
  {
    id: 'potato-wireworm',
    crop: 'potato',
    name: 'Проволочник',
    latinName: 'Agriotes spp.',
    kind: 'pest',
    severity: 'medium',
    symptoms: ['Узкие извилистые ходы в клубнях', 'Жёлтые жёсткие личинки в почве и клубнях'],
    conditions: 'Пырейные залежи, кислая почва, монокультура',
    chemicalTreatment: [
      {
        name: 'Престиж',
        activeIngredient: 'имидаклоприд + пенцикурон',
        dosage: 'обработка клубней, по инструкции производителя',
      },
    ],
    biologicalTreatment: [
      {
        name: 'Метаризин',
        activeIngredient: 'Metarhizium anisopliae',
        dosage: 'по инструкции производителя',
      },
    ],
    prevention: ['Уничтожение пырея', 'Севооборот с бобовыми', 'Приманки из нарезанного картофеля'],
  },
]
