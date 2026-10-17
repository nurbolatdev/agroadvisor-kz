const format = {
  justNow: 'только что',
  minutesAgo: '{{count}} мин назад',
  hoursAgo: '{{count}} ч назад',
  yesterday: 'вчера',
  todayAt: 'сегодня {{time}}',
  yesterdayAt: 'вчера {{time}}',
  since: 'с {{month}} {{year}}',
  shortDate: '{{day}} {{month}}',
  // Own month names: browsers lack Kazakh locale data, so all languages use these lists.
  monthsShort: 'янв,фев,мар,апр,мая,июн,июл,авг,сент,окт,нояб,дек',
  monthsSince: 'января,февраля,марта,апреля,мая,июня,июля,августа,сентября,октября,ноября,декабря',
  monthsAxis: 'Янв,Фев,Мар,Апр,Май,Июн,Июл,Авг,Сен,Окт,Ноя,Дек',
  weekdaysShort: 'Пн,Вт,Ср,Чт,Пт,Сб,Вс',
  weekShort: '{{week}} нед',
  minutes: '{{minutes}} мин',
  hours: '{{hours}} ч',
  hoursMinutes: '{{hours}} ч {{minutes}} мин',
}

export default format
