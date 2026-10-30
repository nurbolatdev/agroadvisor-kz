-- Reference data, part 1 (V8-V10): all crops, the `unknown` class and tomato diseases.
-- Codes are exactly those of services/ai-service/ml/classes.yaml.
--
-- Texts are draft content: the Kazakh (kk) texts are not checked by a native
-- speaker, and treatments must be confirmed by an agrochemist before release.
-- Dosage is deliberately "per the product label": exact doses are not invented here.
-- `product` is a language-neutral active-ingredient name (the column is not
-- translated); trade names registered in Kazakhstan are to be added from the
-- state register of plant protection products.

INSERT INTO crops (code, names, sort_order) VALUES
    ('tomato', '{"ru": "Томат", "kk": "Қызанақ", "en": "Tomato"}', 10),
    ('potato', '{"ru": "Картофель", "kk": "Картоп", "en": "Potato"}', 20),
    ('corn',   '{"ru": "Кукуруза", "kk": "Жүгері", "en": "Corn"}', 30),
    ('wheat',  '{"ru": "Пшеница", "kk": "Бидай", "en": "Wheat"}', 40);

INSERT INTO diseases (code, crop_code, kind, severity, latin_name, names, symptoms, conditions, prevention) VALUES
    ('unknown', NULL, 'other', NULL, NULL,
     '{"ru": "Не распознано", "kk": "Анықталмады", "en": "Not recognized"}',
     NULL, NULL, NULL),

    ('tomato__late_blight', 'tomato', 'oomycete', 'high', 'Phytophthora infestans',
     '{"ru": "Фитофтороз", "kk": "Фитофтороз", "en": "Late blight"}',
     '{"ru": ["Бурые маслянистые пятна на листьях и стеблях", "Белый налёт с нижней стороны листа в сырую погоду", "Бурая твёрдая гниль плодов"],
       "kk": ["Жапырақтары мен сабақтарында қоңыр майлы дақтар", "Ылғалды ауа райында жапырақтың астыңғы жағында ақ жабын", "Жемістердің қоңыр қатты шіруі"],
       "en": ["Brown, oily-looking spots on leaves and stems", "White mould on the underside of leaves in wet weather", "Firm brown rot of fruits"]}',
     '{"ru": ["Прохладные ночи и тёплые дни", "Высокая влажность, росы, затяжные дожди", "Загущенные посадки"],
       "kk": ["Салқын түндер мен жылы күндер", "Жоғары ылғалдылық, шық, ұзақ жаңбыр", "Қалың егілген екпелер"],
       "en": ["Cool nights and warm days", "High humidity, dew, prolonged rain", "Dense plantings"]}',
     '{"ru": ["Севооборот: не сажать томат после картофеля и томата", "Не загущать посадки, проветривать теплицу", "Поливать под корень, не мочить листья", "Удалять и уничтожать больные растения"],
       "kk": ["Ауыспалы егіс: қызанақты картоп пен қызанақтан кейін егпеу", "Екпелерді қалың отырғызбау, жылыжайды желдету", "Жапырақты суландырмай, тамырына су құю", "Ауру өсімдіктерді жұлып, жою"],
       "en": ["Rotate crops: do not follow potato or tomato", "Avoid dense planting and ventilate greenhouses", "Water at the root, keep leaves dry", "Remove and destroy infected plants"]}'),

    ('tomato__early_blight', 'tomato', 'fungal', 'medium', 'Alternaria solani',
     '{"ru": "Альтернариоз", "kk": "Альтернариоз", "en": "Early blight"}',
     '{"ru": ["Тёмно-бурые пятна с концентрическими кругами на нижних листьях", "Жёлтая кайма вокруг пятен", "Тёмные вдавленные пятна у плодоножки"],
       "kk": ["Төменгі жапырақтарда концентрлі шеңберлері бар қара қоңыр дақтар", "Дақтардың айналасында сары жиек", "Жеміс сабағының жанында қараңғы ойық дақтар"],
       "en": ["Dark brown spots with concentric rings on lower leaves", "Yellow halo around the spots", "Dark sunken spots near the fruit stalk"]}',
     '{"ru": ["Тёплая погода с чередованием дождей и сухих периодов", "Ослабленные растения, нехватка азота", "Остатки больной ботвы в почве"],
       "kk": ["Жаңбыр мен құрғақ кезеңдер алмасатын жылы ауа райы", "Әлсіреген өсімдіктер, азоттың жетіспеуі", "Топырақтағы ауру сабақ қалдықтары"],
       "en": ["Warm weather alternating between rain and dry spells", "Weakened plants, nitrogen deficiency", "Infected plant debris in the soil"]}',
     '{"ru": ["Убирать и уничтожать растительные остатки", "Севооборот 3–4 года", "Сбалансированное питание растений", "Использовать здоровые семена и рассаду"],
       "kk": ["Өсімдік қалдықтарын жинап, жою", "3–4 жылдық ауыспалы егіс", "Өсімдіктерді теңгерімді қоректендіру", "Сау тұқым мен көшет пайдалану"],
       "en": ["Remove and destroy plant debris", "Rotate crops over 3–4 years", "Keep plant nutrition balanced", "Use healthy seeds and seedlings"]}'),

    ('tomato__septoria_leaf_spot', 'tomato', 'fungal', 'medium', 'Septoria lycopersici',
     '{"ru": "Септориоз", "kk": "Септориоз", "en": "Septoria leaf spot"}',
     '{"ru": ["Множество мелких круглых пятен со светлым центром и тёмной каймой", "В центре пятен видны чёрные точки", "Листья желтеют и опадают снизу вверх"],
       "kk": ["Ашық ортасы мен қара жиегі бар көптеген ұсақ дөңгелек дақтар", "Дақтардың ортасында қара нүктелер көрінеді", "Жапырақтар төменнен жоғары қарай сарғайып, түседі"],
       "en": ["Many small round spots with a pale centre and dark border", "Black dots visible in the centre of the spots", "Leaves yellow and drop from the bottom up"]}',
     '{"ru": ["Тёплая и влажная погода", "Брызги дождя и полива, разносящие споры", "Загущенные посадки"],
       "kk": ["Жылы әрі ылғалды ауа райы", "Споралар таратушы жаңбыр мен суару шашырандылары", "Қалың егілген екпелер"],
       "en": ["Warm, humid weather", "Rain and irrigation splash spreading spores", "Dense plantings"]}',
     '{"ru": ["Севооборот и уборка растительных остатков", "Не поливать по листьям", "Подвязывать растения, обеспечивать проветривание", "Удалять нижние больные листья"],
       "kk": ["Ауыспалы егіс және өсімдік қалдықтарын жинау", "Жапырақтарға су құймау", "Өсімдіктерді байлап, желдетуді қамтамасыз ету", "Төменгі ауру жапырақтарды жұлу"],
       "en": ["Rotate crops and clear plant debris", "Do not water over the leaves", "Stake plants and keep air moving", "Remove infected lower leaves"]}'),

    ('tomato__bacterial_spot', 'tomato', 'bacterial', 'medium', 'Xanthomonas spp.',
     '{"ru": "Бактериальная пятнистость", "kk": "Бактериялық дақ", "en": "Bacterial spot"}',
     '{"ru": ["Мелкие тёмные водянистые пятна на листьях", "Пятна позже буреют и могут выпадать, оставляя дырочки", "Шероховатые корочки на плодах"],
       "kk": ["Жапырақтарда ұсақ қара сулы дақтар", "Дақтар кейін қоңырланып, түсіп қалуы мүмкін, тесіктер қалады", "Жемістерде кедір-бұдыр қабыршақтар"],
       "en": ["Small dark, water-soaked spots on leaves", "Spots turn brown and may fall out, leaving holes", "Rough scabby spots on fruit"]}',
     '{"ru": ["Тёплая влажная погода и дожди с ветром", "Заражённые семена и рассада", "Повреждения растений"],
       "kk": ["Жылы ылғалды ауа райы, жел аралас жаңбыр", "Залалданған тұқым мен көшет", "Өсімдіктердің зақымдануы"],
       "en": ["Warm, wet weather and wind-driven rain", "Infected seeds and seedlings", "Plant wounds"]}',
     '{"ru": ["Покупать здоровые семена и рассаду", "Протравливать семена", "Не работать с мокрыми растениями", "Севооборот и уничтожение остатков"],
       "kk": ["Сау тұқым мен көшет сатып алу", "Тұқымды дәрілеу", "Дымқыл өсімдіктермен жұмыс істемеу", "Ауыспалы егіс және қалдықтарды жою"],
       "en": ["Buy healthy seeds and seedlings", "Treat seeds before sowing", "Do not handle wet plants", "Rotate crops and destroy debris"]}'),

    ('tomato__leaf_mold', 'tomato', 'fungal', 'medium', 'Passalora fulva',
     '{"ru": "Кладоспориоз", "kk": "Кладоспориоз", "en": "Leaf mold"}',
     '{"ru": ["Светло-жёлтые пятна на верхней стороне листа", "Бархатистый оливковый налёт с нижней стороны", "Листья скручиваются и засыхают"],
       "kk": ["Жапырақтың үстіңгі жағында ақшыл сары дақтар", "Астыңғы жағында барқыт тәрізді зәйтүн түсті жабын", "Жапырақтар жиырылып, кеуіп қалады"],
       "en": ["Pale yellow spots on the upper side of the leaf", "Velvety olive mould on the underside", "Leaves curl and dry out"]}',
     '{"ru": ["Высокая влажность воздуха (выше 85 %)", "Плохое проветривание теплицы", "Умеренно тёплая погода"],
       "kk": ["Ауаның жоғары ылғалдылығы (85 %-дан жоғары)", "Жылыжайдың нашар желдетілуі", "Қалыпты жылы ауа райы"],
       "en": ["High air humidity (above 85 %)", "Poor greenhouse ventilation", "Moderately warm weather"]}',
     '{"ru": ["Проветривать теплицу, снижать влажность", "Не загущать посадки", "Поливать утром под корень", "Убирать растительные остатки"],
       "kk": ["Жылыжайды желдетіп, ылғалдылықты азайту", "Екпелерді қалың отырғызбау", "Таңертең тамырына суару", "Өсімдік қалдықтарын жинау"],
       "en": ["Ventilate the greenhouse to lower humidity", "Avoid dense planting", "Water at the root in the morning", "Clear plant debris"]}'),

    ('tomato__mosaic_virus', 'tomato', 'viral', 'high', 'Tomato mosaic virus',
     '{"ru": "Мозаика", "kk": "Мозаика вирусы", "en": "Mosaic virus"}',
     '{"ru": ["Мозаичный рисунок из светлых и тёмно-зелёных участков на листьях", "Деформация и скручивание листьев", "Отставание в росте, неровное созревание плодов"],
       "kk": ["Жапырақтарда ашық және қою жасыл бөліктерден мозаикалық өрнек", "Жапырақтардың пішінінің бұзылуы және жиырылуы", "Өсудің тоқтауы, жемістердің біркелкі пісіп жетілмеуі"],
       "en": ["Mosaic of light and dark green areas on leaves", "Leaf distortion and curling", "Stunted growth and uneven fruit ripening"]}',
     '{"ru": ["Заражённые семена и растительные остатки", "Передача через руки, инструмент и одежду", "Контакт здоровых растений с больными"],
       "kk": ["Залалданған тұқым мен өсімдік қалдықтары", "Қол, құрал және киім арқылы берілуі", "Сау өсімдіктердің аурумен жанасуы"],
       "en": ["Infected seeds and plant debris", "Spread by hands, tools and clothing", "Contact between healthy and infected plants"]}',
     '{"ru": ["Лечения нет: больные растения удаляют и сжигают", "Использовать здоровые семена и устойчивые сорта", "Дезинфицировать инструмент и мыть руки", "Не курить рядом с растениями (табачная мозаика)"],
       "kk": ["Емі жоқ: ауру өсімдіктерді жұлып, өртеу", "Сау тұқым мен төзімді сорттарды пайдалану", "Құралдарды залалсыздандырып, қолды жуу", "Өсімдіктердің жанында темекі шекпеу (темекі мозаикасы)"],
       "en": ["There is no cure: remove and burn infected plants", "Use healthy seeds and resistant varieties", "Disinfect tools and wash hands", "Do not smoke near plants (tobacco mosaic)"]}'),

    ('tomato__healthy', 'tomato', 'healthy', NULL, NULL,
     '{"ru": "Здоровое растение", "kk": "Сау өсімдік", "en": "Healthy"}',
     '{"ru": ["Признаков болезни не обнаружено"], "kk": ["Аурудың белгісі табылмады"], "en": ["No signs of disease found"]}',
     NULL,
     '{"ru": ["Регулярно осматривать растения", "Соблюдать севооборот и полив под корень"],
       "kk": ["Өсімдіктерді үнемі тексеріп тұру", "Ауыспалы егісті сақтау және тамырына суару"],
       "en": ["Inspect plants regularly", "Rotate crops and water at the root"]}');

INSERT INTO treatments (disease_code, type, product, active_ingredient, dosage, method, sort_order) VALUES
    ('tomato__late_blight', 'chemical', 'Mancozeb', 'mancozeb',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактическое опрыскивание до появления симптомов, повтор через 7–10 дней", "kk": "Белгілер пайда болғанға дейін профилактикалық бүрку, 7–10 күннен кейін қайталау", "en": "Preventive spraying before symptoms appear, repeat after 7–10 days"}', 1),
    ('tomato__late_blight', 'chemical', 'Copper oxychloride', 'copper oxychloride',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание листьев в сухую погоду; соблюдать срок ожидания до сбора", "kk": "Құрғақ ауа райында жапырақтарды бүрку; жинауға дейінгі күту мерзімін сақтау", "en": "Spray leaves in dry weather; observe the pre-harvest interval"}', 2),
    ('tomato__late_blight', 'biological', 'Bacillus subtilis-based products', 'Bacillus subtilis',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактические опрыскивания каждые 10–14 дней; против развитой болезни слабее химических", "kk": "10–14 күн сайын профилактикалық бүрку; дамыған ауруға химиялық препараттарға қарағанда әлсіз", "en": "Preventive sprays every 10–14 days; weaker than chemicals against advanced disease"}', 1),

    ('tomato__early_blight', 'chemical', 'Mancozeb', 'mancozeb',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание при первых пятнах, повтор через 7–10 дней", "kk": "Алғашқы дақтар пайда болған кезде бүрку, 7–10 күннен кейін қайталау", "en": "Spray at the first spots, repeat after 7–10 days"}', 1),
    ('tomato__early_blight', 'chemical', 'Difenoconazole', 'difenoconazole',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание в начале болезни; чередовать с препаратами других групп, чтобы не вызвать резистентность", "kk": "Аурудың басында бүрку; төзімділік пайда болмауы үшін басқа топтағы препараттармен кезектестіру", "en": "Spray at disease onset; alternate with other chemical groups to avoid resistance"}', 2),
    ('tomato__early_blight', 'biological', 'Bacillus subtilis-based products', 'Bacillus subtilis',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактические опрыскивания каждые 10–14 дней", "kk": "10–14 күн сайын профилактикалық бүрку", "en": "Preventive sprays every 10–14 days"}', 1),

    ('tomato__septoria_leaf_spot', 'chemical', 'Copper oxychloride', 'copper oxychloride',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание при первых признаках, повтор через 10–14 дней", "kk": "Алғашқы белгілерде бүрку, 10–14 күннен кейін қайталау", "en": "Spray at the first signs, repeat after 10–14 days"}', 1),
    ('tomato__septoria_leaf_spot', 'chemical', 'Mancozeb', 'mancozeb',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание всех листьев, включая нижнюю сторону", "kk": "Барлық жапырақтарды, соның ішінде астыңғы жағын бүрку", "en": "Spray all foliage, including the underside"}', 2),
    ('tomato__septoria_leaf_spot', 'biological', 'Bacillus subtilis-based products', 'Bacillus subtilis',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактические опрыскивания каждые 10–14 дней", "kk": "10–14 күн сайын профилактикалық бүрку", "en": "Preventive sprays every 10–14 days"}', 1),

    ('tomato__bacterial_spot', 'chemical', 'Copper compounds', 'copper compounds',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание при первых признаках; эффективность ограничена, главное — профилактика", "kk": "Алғашқы белгілерде бүрку; тиімділігі шектеулі, басты нәрсе — алдын алу", "en": "Spray at the first signs; efficacy is limited, prevention matters most"}', 1),
    ('tomato__bacterial_spot', 'biological', 'Bacillus subtilis-based products', 'Bacillus subtilis',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактические опрыскивания каждые 10–14 дней", "kk": "10–14 күн сайын профилактикалық бүрку", "en": "Preventive sprays every 10–14 days"}', 1),

    ('tomato__leaf_mold', 'chemical', 'Copper oxychloride', 'copper oxychloride',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание при первых пятнах вместе со снижением влажности в теплице", "kk": "Алғашқы дақтар пайда болған кезде жылыжайдағы ылғалдылықты азайтумен бірге бүрку", "en": "Spray at the first spots while lowering greenhouse humidity"}', 1),
    ('tomato__leaf_mold', 'chemical', 'Difenoconazole', 'difenoconazole',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Опрыскивание в начале болезни; чередовать с другими группами", "kk": "Аурудың басында бүрку; басқа топтармен кезектестіру", "en": "Spray at disease onset; alternate with other groups"}', 2),
    ('tomato__leaf_mold', 'biological', 'Trichoderma-based products', 'Trichoderma spp.',
     '{"ru": "По инструкции на этикетке препарата", "kk": "Препарат затбелгісіндегі нұсқаулыққа сәйкес", "en": "As directed on the product label"}',
     '{"ru": "Профилактическая обработка растений и почвы", "kk": "Өсімдіктер мен топырақты профилактикалық өңдеу", "en": "Preventive treatment of plants and soil"}', 1);
