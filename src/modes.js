// Shared by the authoritative server and the browser: never trust client tuning.
const mode = (spec) => Object.freeze({ enemySpeed: 1, grace: 15, drain: 1, recovery: 1, speed: 1, hardcore: false, funny: false, playerScale: 1, enemyScale: 1, radius: 0.28, pvp: false, hunt: false, hide: false, multiplayerOnly: false, timeLimit: 0, hideTime: 0, ...spec });
export const MODES = Object.freeze({
  classic: mode({ id: 'classic', title: 'Классика', description: '10 порций крема. Обычный лес. Почти…' }),
  hardcore: mode({ id: 'hardcore', title: 'Хардкор', description: 'Темнее, монстр быстрее на 40%, без стрелок. Слабые помехи и шуточный баннер: закрыть кнопкой или X.', enemySpeed: 1.4, grace: 4, drain: 1.45, recovery: 0.7, hardcore: true }),
  rabbits: mode({ id: 'rabbits', title: 'Кроличий заговор', description: 'Откуда здесь кролики?! Собери 10 морковок, найди тайный совет и не попади к Ушастому.', enemySpeed: 1.05, funny: true }),
  pig: mode({ id: 'pig', title: 'Свиной переполох', description: 'Ты — порося. Бегаешь быстрее на 12%, хрюкаешь и тащишь морковки. Кролики осуждают.', enemySpeed: 1.1, grace: 12, drain: 0.85, speed: 1.12, funny: true }),
  tiny: mode({ id: 'tiny', title: 'Малыши и великаны', description: 'Ты вдвое меньше обычного, а монстр — вдвое больше. 10 порций и огромный лес с уровня травы.', playerScale: 0.45, enemyScale: 2.1, radius: 0.16, speed: 0.95, drain: 0.8, enemySpeed: 1.08 }),
  hunt: mode({ id: 'hunt', title: 'Обратная охота', description: 'Теперь монстр убегает! Догони и отметь его 10 раз: E / кнопка руки. Успей за 3 минуты.', hunt: true, grace: 0, timeLimit: 180 }),
  hide: mode({ id: 'hide', title: 'Прятки · PvP', description: '2–4 игрока. Водящий ждёт 20 секунд, затем ищет остальных. Лови на E; прячущиеся побеждают через 150 секунд.', pvp: true, hide: true, multiplayerOnly: true, timeLimit: 150, hideTime: 20 }),
  killer: mode({ id: 'killer', title: 'Убийца · PvP', description: '2–4 игрока. Один — убийца, остальные собирают 10 порций. Убийца ловит всех на E. На побег 3 минуты, фора 10 секунд.', pvp: true, multiplayerOnly: true, timeLimit: 180, hideTime: 10 }),
});

export function getMode(id = 'classic') {
  return typeof id === 'string' && Object.hasOwn(MODES, id) ? MODES[id] : MODES.classic;
}

export const RABBIT_LINES = Object.freeze([
  'ОТКУДА ЗДЕСЬ КРОЛИКИ?! Он сказал: «Мы тут работаем».',
  'Кролик-охранник: «Морковку предъявите. Пудинг не принимаем».',
  'Тайный совет кроликов: «Порося обнаружен. Делаем вид, что мы кусты».',
  'Плюшевый Ушастик. Бирка: «Не кормить после полуночи. И до полуночи тоже».',
  'Медведь-инспектор: «Крем проверен. Одну порцию изъял для экспертизы».',
  'Плюшевый порося: «Я маленький, зато ипотеку не плачу».',
  'Ушастый бухгалтер: «Морковный бюджет снова съеден».',
  'Игрушечный хранитель: «Смена закончилась. Лес теперь твой».',
  'Тот самый камень. Надпись: «Крема внутри больше нет. Проверено».',
  'Плюшевый По: «Я не монстр. Я просто до кофе».',
  'Кролик-админ: «Выдать всем морковку. Забанить понедельник».',
  'Медведь-программист: «Это не баг. Это секретная механика».',
  'Порося-диджей: «ХРЮ-бас включён. Соседи не найдены».',
  'Мини-Дипси: «Я зелёный не от страха. Это штатный цвет».',
  'Последняя игрушка шепчет: «А откуда здесь столько плюшиков?»',
]);
