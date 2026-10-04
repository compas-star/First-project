// Data: eras, workers, buildings, wonders, upgrades, goals, camp layout.
(() => {
'use strict';

S.RES = ['wood', 'stone', 'food'];
S.RES_NAME = { wood: 'дерево', stone: 'камень', food: 'еда' };

S.ERAS = [
  { name: 'Каменный век', mult: 1, pop: 1 },
  { name: 'Бронзовый век', mult: 3, pop: 2 },
  { name: 'Феодализм', mult: 9, pop: 4 },
];

// node: where the visible worker goes to work
S.WORKERS = {
  gatherer:    { name: 'Собиратель', res: 'food', rate: .4, cost: { food: 15 }, era: 0, node: 'bush', desc: 'Собирает ягоды' },
  lumberjack:  { name: 'Лесоруб', res: 'wood', rate: .4, cost: { food: 20 }, era: 0, node: 'tree', desc: 'Рубит лес' },
  stonecutter: { name: 'Каменотёс', res: 'stone', rate: .3, cost: { food: 50, wood: 30 }, era: 0, node: 'rock', desc: 'Добывает камень', unlock: s => s.b.quarry >= 1, lockText: 'Построй каменоломню' },
  hunter:      { name: 'Охотник', res: 'food', rate: 4, cost: { food: 600, wood: 150 }, era: 0, node: 'hunt', desc: 'Приносит дичь', unlock: s => s.w.gatherer >= 10, lockText: '10 собирателей' },
  farmer:      { name: 'Земледелец', res: 'food', rate: 30, cost: { food: 4000, wood: 1200 }, era: 1, node: 'farm', desc: 'Растит зерно' },
  carpenter:   { name: 'Плотник', res: 'wood', rate: 30, cost: { food: 5000, stone: 900 }, era: 1, node: 'tree', desc: 'Валит лес бронзой' },
  mason:       { name: 'Каменщик', res: 'stone', rate: 22, cost: { food: 6000, wood: 2500 }, era: 1, node: 'rock', desc: 'Тешет блоки' },
  peasant:     { name: 'Крестьянин', res: 'food', rate: 320, cost: { food: 9e4, wood: 25000 }, era: 2, node: 'farm', desc: 'Пашет поля' },
  forester:    { name: 'Лесничий', res: 'wood', rate: 320, cost: { food: 1.1e5, stone: 20000 }, era: 2, node: 'tree', desc: 'Ведёт лесное хозяйство' },
  miner:       { name: 'Рудокоп', res: 'stone', rate: 240, cost: { food: 1.3e5, wood: 45000 }, era: 2, node: 'rock', desc: 'Глубокие шахты' },
};
S.WORKER_GROW = 1.17;

const totalW = s => Object.values(s.w).reduce((a, b) => a + b, 0);
S.totalWorkers = totalW;

// Buildings have endless levels. boost: +10% per level to that resource, ×2 at milestone levels.
S.BUILDINGS = {
  center:  { names: ['Костёр', 'Большой костёр', 'Стоянка вождя', 'Дом вождя', 'Бронзовый чертог', 'Замок'], cost: { wood: 30 }, grow: 1.6, desc: 'Тап сильнее на +1, а вехи удваивают тап' },
  house:   { names: ['Шалаши', 'Хижины', 'Глинобитные дома', 'Каменные дома'], cost: { wood: 25 }, grow: 1.25, desc: '+3 места для людей', unlock: s => totalW(s) >= 1, lockText: 'Найми первого человека' },
  garden:  { names: ['Ягодник', 'Огород', 'Поля'], cost: { wood: 40 }, grow: 1.45, boost: 'food', desc: 'Еда +5% за уровень', unlock: s => s.w.gatherer >= 3, lockText: '3 собирателя' },
  sawmill: { names: ['Дровяник', 'Лесопилка', 'Пилорама'], cost: { wood: 60 }, grow: 1.45, boost: 'wood', desc: 'Дерево +5% за уровень', unlock: s => s.w.lumberjack >= 3, lockText: '3 лесоруба' },
  quarry:  { names: ['Каменоломня', 'Карьер', 'Шахта'], cost: { wood: 150 }, grow: 1.45, boost: 'stone', desc: 'Открывает камень, камень +5% за уровень', unlock: s => totalW(s) >= 6, lockText: '6 человек в племени' },
  tower:   { names: ['Сторожевая вышка', 'Сторожевые вышки', 'Каменные башни'], cost: { wood: 200, stone: 60 }, grow: 1.35, desc: 'Стреляют по волкам', unlock: s => s.stats.wolvesSeen >= 1 || totalW(s) >= 12, lockText: 'Первый набег волков' },
  wall:    { names: ['Частокол', 'Каменная стена', 'Крепостная стена'], cost: { wood: 800, stone: 250 }, grow: 5, max: 3, desc: 'Волки больше не доберутся до запасов', unlock: s => s.b.tower >= 2, lockText: 'Вышки 2 уровня' },
};
S.MILESTONES = [10, 25, 50, 100];

S.WONDERS = [
  { name: 'Каменный круг', total: { wood: 8e4, stone: 4e4, food: 6e4 }, gp: .1, unlock: s => s.b.quarry >= 8 && totalW(s) >= 40, lockText: 'Каменоломня 8 ур. и 40 человек' },
  { name: 'Зиккурат', total: { wood: 5e8, stone: 3e8, food: 4e8 }, gp: .4, unlock: s => totalW(s) >= 120, lockText: '120 человек' },
  { name: 'Собор', total: { wood: 2e11, stone: 1.5e11, food: 1.5e11 }, gp: 1.5, unlock: s => totalW(s) >= 250, lockText: '250 человек' },
];
S.WONDER_STAGES = 5;
S.wonderStageCost = (wi, st) => { const t = S.WONDERS[wi].total, k = .12 + .04 * st, o = {}; for (const r in t) o[r] = Math.round(t[r] * k); return o; };

// ---------- upgrades ----------
const TOOL_NAMES = {
  gatherer: ['Плетёные корзины', 'Знание ягод', 'Сумки из шкур', 'Тропы собирателей', 'Сушка ягод', 'Бронзовые серпы', 'Сады', 'Погреба', 'Ярмарки', 'Изобилие'],
  lumberjack: ['Каменный топор', 'Острый скол', 'Рукоять из дуба', 'Клинья', 'Сплав брёвен', 'Бронзовый топор', 'Двуручная пила', 'Волокуши', 'Железный топор', 'Лесные артели'],
  stonecutter: ['Кирка из рога', 'Рычаги', 'Огонь и вода', 'Катки', 'Носилки', 'Бронзовые долота', 'Блоки', 'Подъёмник', 'Железные клинья', 'Каменные артели'],
  hunter: ['Копья', 'Ловушки', 'Лук', 'Собаки', 'Загонная охота', 'Бронзовые наконечники', 'Арбалеты', 'Сокольничьи', 'Охотничьи угодья', 'Королевская охота'],
};
const UP_T = [1, 10, 25, 50, 80, 120, 175, 250, 350, 500];
S.UPGRADES = [];
for (const k in S.WORKERS) {
  const W = S.WORKERS[k], names = TOOL_NAMES[k];
  const base = Object.values(W.cost).reduce((a, b) => a + b, 0);
  UP_T.forEach((t, j) => {
    S.UPGRADES.push({
      id: k + j, kind: 'worker', target: k, name: names ? names[j] : W.name + ': мастерство ' + (j + 1),
      desc: W.name + ' ×2', era: Math.min(2, W.era + (j >= 5 ? 1 : 0) + (j >= 8 ? 1 : 0)), req: s => s.w[k] >= t,
      reqText: t + ' × ' + W.name.toLowerCase(), cost: { [W.res]: Math.round(base * 10 * Math.pow(6, j)) },
    });
  });
}
S.UPGRADES.push(
  { id: 'tap0', kind: 'tap', name: 'Крепкие руки', desc: 'Тап ×2', req: s => s.stats.taps >= 50, reqText: '50 тапов', cost: { wood: 80 }, tapMult: 2 },
  { id: 'tap1', kind: 'tap', name: 'Мозолистые ладони', desc: 'Тап ×2', req: s => s.stats.taps >= 300, reqText: '300 тапов', cost: { wood: 1500, food: 1000 }, tapMult: 2 },
  { id: 'tap2', kind: 'tap', name: 'Ритм труда', desc: 'Тап даёт +1% дохода в секунду', req: s => s.stats.taps >= 800, reqText: '800 тапов', cost: { food: 2e4 }, tapPct: .01 },
  { id: 'tap3', kind: 'tap', name: 'Железная хватка', desc: 'Тап даёт ещё +2% дохода в секунду', req: s => s.stats.taps >= 2000 && s.era >= 1, reqText: '2000 тапов, бронзовый век', cost: { wood: 5e5 }, tapPct: .02 },
  { id: 'tap4', kind: 'tap', name: 'Сила предков', desc: 'Тап ×5', req: s => s.stats.taps >= 5000 && s.era >= 2, reqText: '5000 тапов, феодализм', cost: { stone: 5e7 }, tapMult: 5 },
  { id: 'combo', kind: 'tap', name: 'Боевой клич', desc: 'Комбо до ×3 вместо ×2', req: s => s.stats.bestCombo >= 15, reqText: 'Комбо 15', cost: { food: 3000 }, comboMax: 40 },
  { id: 'deer0', kind: 'deer', name: 'Следопыт', desc: 'Золотой олень приходит чаще', req: s => s.stats.deer >= 3, reqText: '3 оленя', cost: { food: 2000 }, deerFreq: 1.5 },
  { id: 'deer1', kind: 'deer', name: 'Долгий след', desc: 'Награды оленя длятся вдвое дольше', req: s => s.stats.deer >= 8, reqText: '8 оленей', cost: { food: 3e4 }, deerDur: 2 },
  { id: 'deer2', kind: 'deer', name: 'Удача охотника', desc: 'Олень ещё чаще', req: s => s.stats.deer >= 20, reqText: '20 оленей', cost: { food: 1e6 }, deerFreq: 1.5 },
);

// ---------- goals ----------
// reward: seconds of current income (at least the minimum), so rewards stay meaningful all game
S.GOALS = [
  { text: 'Тапни по дереву 10 раз', check: s => s.stats.taps >= 10, reward: { secs: 0, min: { food: 15 } } },
  { text: 'Найми собирателя', check: s => s.w.gatherer >= 1, reward: { secs: 0, min: { food: 20 } } },
  { text: 'Найми 2 лесорубов', check: s => s.w.lumberjack >= 2, reward: { secs: 20, min: { wood: 20 } } },
  { text: 'Построй шалаши для новых людей', check: s => s.b.house >= 1, reward: { secs: 30, min: { food: 30 } } },
  { text: 'Собери племя из 6 человек', check: s => totalW(s) >= 6, reward: { secs: 40, min: { wood: 60, food: 60 } } },
  { text: 'Построй каменоломню', check: s => s.b.quarry >= 1, reward: { secs: 40, min: { food: 80 } } },
  { text: 'Найми каменотёса', check: s => s.w.stonecutter >= 1, reward: { secs: 40, min: { stone: 30 } } },
  { text: 'Поймай золотого оленя', check: s => s.stats.deer >= 1, reward: { secs: 60, min: { food: 100 } } },
  { text: 'Прогони 2 волков: тапай по ним', check: s => s.stats.wolvesKilled >= 2, reward: { secs: 60, min: { food: 150 } } },
  { text: 'Подними лесопилку до 10 уровня', check: s => s.b.sawmill >= 10, reward: { secs: 90, min: { wood: 300 } } },
  { text: 'Построй сторожевую вышку', check: s => s.b.tower >= 1, reward: { secs: 90, min: { stone: 100 } } },
  { text: 'Собери племя из 25 человек', check: s => totalW(s) >= 25, reward: { secs: 120 } },
  { text: 'Заложи Каменный круг', check: s => s.wonder.idx > 0 || s.wonder.stage >= 1, reward: { secs: 120 } },
  { text: 'Заверши Каменный круг', check: s => s.wonder.idx >= 1, reward: { secs: 180 } },
  { text: 'Перейди в бронзовый век', check: s => s.era >= 1, reward: { secs: 180 } },
  { text: 'Найми земледельца', check: s => s.w.farmer >= 1, reward: { secs: 180 } },
  { text: 'Собери племя из 60 человек', check: s => totalW(s) >= 60, reward: { secs: 240 } },
  { text: 'Заверши Зиккурат', check: s => s.wonder.idx >= 2, reward: { secs: 300 } },
  { text: 'Перейди в феодализм', check: s => s.era >= 2, reward: { secs: 300 } },
  { text: 'Заверши Собор', check: s => s.wonder.idx >= 3, reward: { secs: 600 } },
];

// ---------- camp layout (world offsets from camp center) ----------
S.WALL_R = 340;
S.STOCK = { dx: -70, dy: 70 };
S.SLOTS = {
  center: [[0, 0]],
  house: [[-170, -70], [170, -70], [-195, 120], [195, 120], [-90, -215], [90, -215], [-265, 20], [265, 20]],
  sawmill: [[0, -180]],
  quarry: [[140, 235]],
  garden: [[0, 540]],
  tower: [[230, -230], [-230, -230], [-230, 230], [230, 230]],
  wonder: [[0, -520], [520, -40], [-520, -40]],
};
// world.js keeps these spots clear of trees and water
S.LAYOUT = [];
for (const k in S.SLOTS) for (const [dx, dy] of S.SLOTS[k]) S.LAYOUT.push({ type: k === 'wonder' ? 'wonder0' : k === 'garden' ? 'farm' : k, dx, dy });
})();
