import { daysAgo, hoursAgo } from '@/mocks/time'
import type { CropId, User } from '@/shared/types'

/**
 * Additional farmers and agrochemists, so the users table has a realistic size.
 * Format: id; name; f(armer)/a(grochemist); region; district; crops; a(ctive)/b(locked);
 * registered N days ago; active N hours ago; diagnoses; posts; warnings.
 */
const ROWS = `
u-x01;Асхат Бекмуханов;f;Алматинская;Карасайский р-н;potato,wheat;a;210;4;14;6;0
u-x02;Гульмира Сейтказы;f;Алматинская;Талгарский р-н;tomato;a;180;1;22;11;0
u-x03;Нуржан Абенов;f;Жамбылская;Байзакский р-н;wheat,corn;a;160;30;7;2;0
u-x04;Сабина Оразбаева;f;Туркестанская;Сайрамский р-н;tomato,corn;a;150;2;31;17;0
u-x05;Данияр Касымов;f;Костанайская;Костанайский р-н;wheat;a;240;72;5;1;0
u-x06;Алия Жаксыбекова;f;Акмолинская;Целиноградский р-н;wheat,potato;a;95;6;12;9;0
u-x07;Ербол Мукашев;f;Северо-Казахстанская;Кызылжарский р-н;wheat;a;130;20;9;3;1
u-x08;Камила Ахметова;f;Алматинская;Илийский р-н;potato,tomato;a;60;3;18;12;0
u-x09;Талгат Ибрагимов;f;Карагандинская;Бухар-Жырауский р-н;potato;a;220;48;4;0;0
u-x10;Айнур Тлеубаева;f;Туркестанская;Мактааральский р-н;corn;a;45;8;15;5;0
u-x11;Руслан Жумагулов;f;Павлодарская;Павлодарский р-н;wheat;b;300;400;2;24;3
u-x12;Мадина Есенова;f;Алматинская;Енбекшиказахский р-н;tomato,potato;a;75;1;27;20;0
u-x13;Канат Сулейменов;f;Жамбылская;Меркенский р-н;corn,wheat;a;190;26;8;4;0
u-x14;Динара Абдуллаева;a;Туркестанская;Сайрамский р-н;tomato,corn;a;140;5;0;58;0
u-x15;Бауыржан Нуртаев;f;Восточно-Казахстанская;Глубоковский р-н;potato;a;170;36;6;2;0
u-x16;Жанар Кенжебаева;f;Алматинская;Жамбылский р-н;wheat,tomato;a;55;7;11;6;0
u-x17;Олжас Темирханов;f;Акмолинская;Шортандинский р-н;wheat;a;205;60;3;1;0
u-x18;Светлана Ким;a;Алматинская;Карасайский р-н;potato,tomato;a;250;2;0;93;0
u-x19;Ильяс Байжанов;f;Костанайская;Федоровский р-н;wheat,corn;a;120;14;10;3;0
u-x20;Гаухар Сапарова;f;Жетісу;Ескельдинский р-н;potato,corn;a;30;9;6;4;0
u-x21;Арман Тасболатов;f;Туркестанская;Толебийский р-н;tomato;b;260;600;1;15;2
u-x22;Лаура Мамырова;f;Алматинская;Талгарский р-н;potato;a;20;5;3;1;0
u-x23;Ержан Досжанов;a;Акмолинская;Аршалынский р-н;wheat,corn;a;310;12;0;71;0
u-x24;Асель Нурмаганбетова;f;Жамбылская;Байзакский р-н;tomato,potato;a;85;18;13;7;0
u-x25;Марлен Ахмедиев;f;Северо-Казахстанская;Есильский р-н;wheat;a;115;40;5;2;0
u-x26;Зарина Утебаева;f;Алматинская;Илийский р-н;tomato;a;12;2;4;3;0
u-x27;Серик Жанибеков;f;Абай;Бескарагайский р-н;potato,wheat;a;175;54;7;1;0
u-x28;Дильназ Ауэзова;f;Туркестанская;Сайрамский р-н;corn;a;65;11;9;5;0
u-x29;Нурлыбек Сарсенбаев;f;Алматинская;Енбекшиказахский р-н;potato,corn;a;145;3;21;14;1
u-x30;Айгерим Касенова;a;Жамбылская;Таласский р-н;corn,wheat;a;230;16;0;44;0
u-x31;Жандос Ермеков;f;Костанайская;Карабалыкский р-н;wheat;a;90;28;6;2;0
u-x32;Малика Рахимова;f;Алматинская;Карасайский р-н;tomato,potato;a;8;1;2;2;0
u-x33;Бекзат Омаров;f;Павлодарская;Иртышский р-н;wheat,potato;a;125;70;4;0;0
u-x34;Томирис Байтурсынова;f;Акмолинская;Целиноградский р-н;potato;a;40;6;8;6;0
u-x35;Ерлан Мусабеков;f;Туркестанская;Мактааральский р-н;corn,tomato;a;200;22;16;8;0
`

export const extraUsers: User[] = ROWS.trim()
  .split('\n')
  .map((row) => {
    const [id, name, role, region, district, crops, status, reg, active, diag, posts, warn] =
      row.split(';')
    return {
      id,
      name,
      role: role === 'a' ? 'agrochemist' : 'farmer',
      region,
      district,
      crops: crops.split(',') as CropId[],
      status: status === 'b' ? 'blocked' : 'active',
      registeredAt: daysAgo(Number(reg)),
      lastActiveAt: hoursAgo(Number(active)),
      diagnosesCount: Number(diag),
      postsCount: Number(posts),
      warningsCount: Number(warn),
    }
  })
