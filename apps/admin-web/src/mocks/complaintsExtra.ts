import { hoursAgo } from '@/mocks/time'
import type {
  CommunityPost,
  Complaint,
  ComplaintReason,
  CropId,
  ModerationAction,
} from '@/shared/types'

/**
 * Older reported posts, so the "in progress" and "resolved" tabs have realistic sizes.
 * The three new complaints from the mockup stay the only new ones.
 * Format: id; p(ost)/a(nswer); author; crop; district; title; text; reports; created N hours ago;
 * status w(ork)/r(esolved); action; resolution comment.
 */
const ROWS = `
x-1;p;u-x03;wheat;Байзакский р-н;Продаю семена пшеницы без документов;Элитные семена, дешевле чем у всех, пишите в личку;ads:3;30;w;;
x-2;a;u-x11;wheat;Павлодарский р-н;«Смешайте три пестицида — сработает»;Лейте всё вместе в одну бочку, так быстрее;misinformation:2,abuse:1;40;w;;
x-3;p;u-x21;tomato;Толебийский р-н;Реклама удобрений с переходом на сайт;Скидка 50% только сегодня, ссылка в профиле;ads:4;52;r;block;Повторная реклама после предупреждения
x-4;a;u-x07;wheat;Кызылжарский р-н;Грубый ответ новичку;Сначала научись читать, потом спрашивай;abuse:2;60;r;hide;Оскорбление участника
x-5;p;u-x13;corn;Меркенский р-н;Одинаковый вопрос в трёх темах;Как избавиться от мотылька? Как избавиться от мотылька?;spam:2;70;r;hide;Дубликаты в нескольких темах
x-6;a;u-x29;potato;Енбекшиказахский р-н;Совет по фитофторозу;Обработайте Ридомилом до цветения и повторите через 10 дней;misinformation:1;75;r;keep;Совет корректный, нарушений нет
x-7;p;u-x04;tomato;Сайрамский р-н;Фото чужого урожая в объявлении;Продам томаты оптом, фото с интернета;ads:2;90;r;hide;Реклама и продажа товаров запрещены правилами
x-8;a;u-x16;wheat;Жамбылский р-н;Ответ с номером телефона;Звоните, приеду и всё обработаю за деньги;ads:2;96;r;hide;Реклама услуг в ответах
x-9;p;u-x24;potato;Байзакский р-н;Вопрос про колорадского жука;Жук съел половину ботвы, чем лучше обработать?;spam:1;110;r;keep;Обычный вопрос, жалоба ошибочная
x-10;a;u-x35;corn;Мактааральский р-н;«Посыпьте солью — жук уйдёт»;Соль от всех вредителей, проверено дедом;misinformation:3;120;r;hide;Опасный или недостоверный совет
x-11;p;u-x19;wheat;Федоровский р-н;Ссылка на сторонний чат;Переходите в наш чат, там всё расскажем;spam:2,ads:1;130;r;hide;Спам и повторяющиеся сообщения
x-12;a;u-x08;potato;Илийский р-н;Резкий ответ эксперту;Агрохимики только продают химию, не слушайте;abuse:1;140;r;keep;Мнение без оскорблений, оставлено
x-13;p;u-x28;corn;Сайрамский р-н;Перепродажа гибридных семян;Гибриды кукурузы из Турции, без сертификата;ads:2;150;r;hide;Продажа без сертификата
x-14;a;u-x12;tomato;Енбекшиказахский р-н;Совет полить молочной сывороткой;Сыворотка помогает от мучнистой росы на ранней стадии;misinformation:1;160;r;keep;Народное средство с оговоркой, оставлено
x-15;p;u-x33;wheat;Иртышский р-н;Много одинаковых постов;Куплю зерно дорого, куплю зерно дорого;spam:3;175;r;hide;Спам и повторяющиеся сообщения
x-16;a;u-x02;tomato;Талгарский р-н;Оскорбление в споре;Ты ничего не понимаешь в теплицах;abuse:2;190;r;hide;Оскорбление участника
x-17;p;u-x35;corn;Мактааральский р-н;Реклама техники;Продаю опрыскиватель, торг уместен;ads:1;210;r;keep;Разовое объявление от фермера, оставлено
x-18;a;u-x21;tomato;Толебийский р-н;«Пестициды не нужны, всё обман»;Не тратьте деньги, болезни проходят сами;misinformation:2;230;r;block;Повторный опасный совет
x-19;p;u-x15;potato;Глубоковский р-н;Вопрос не по теме;Где купить дешёвый телефон?;spam:1;250;r;hide;Не относится к агрономии
`

const posts: CommunityPost[] = []
const complaints: Complaint[] = []

for (const row of ROWS.trim().split('\n')) {
  const [
    id,
    kind,
    authorId,
    crop,
    district,
    title,
    text,
    reports,
    created,
    status,
    action,
    comment,
  ] = row.split(';')
  const createdAt = hoursAgo(Number(created))
  posts.push({
    id: `p-${id}`,
    kind: kind === 'a' ? 'answer' : 'post',
    authorId,
    crop: crop as CropId,
    district,
    title,
    text,
    createdAt,
    hidden: action === 'hide' || action === 'block',
  })
  complaints.push({
    id: `c-${id}`,
    postId: `p-${id}`,
    status: status === 'w' ? 'in_progress' : 'resolved',
    reports: reports.split(',').map((part) => {
      const [reason, count] = part.split(':')
      return { reason: reason as ComplaintReason, count: Number(count) }
    }),
    createdAt,
    resolution: action
      ? {
          action: action as ModerationAction,
          comment,
          resolvedAt: hoursAgo(Number(created) - 2),
        }
      : undefined,
  })
}

export const extraPosts = posts
export const extraComplaints = complaints
