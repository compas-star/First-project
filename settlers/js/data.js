// Data: eras, buildings, camp layout, unit stats, quests.
(() => {
'use strict';

S.RES = ['wood', 'stone', 'food'];
S.RES_NAME = { wood: 'Дерево', stone: 'Камень', food: 'Еда' };

S.ERAS = [
  { name: 'Каменный век', short: 'Камень' },
  { name: 'Бронзовый век', short: 'Бронза' },
  { name: 'Феодализм', short: 'Феодализм' },
];
S.eraOf = centerLevel => centerLevel >= 6 ? 2 : centerLevel >= 4 ? 1 : 0;

// levels[i] describes level i (cost is what it takes to reach it). req = camp-center level needed.
S.BLD = {
  center: { pad: [80, 60], levels: [null,
    { name: 'Костёр' },
    { name: 'Стоянка', cost: { wood: 20, food: 5 }, req: 1, note: 'Открывает склад и вышку' },
    { name: 'Деревня', cost: { wood: 60, stone: 25, food: 15 }, req: 2, note: 'Открывает частокол и чудо' },
    { name: 'Бронзовый век', cost: { wood: 120, stone: 80, food: 50 }, req: 3, needs: 'wonder0', note: 'Новая эпоха: бронзовые орудия' },
    { name: 'Бронзовый город', cost: { wood: 200, stone: 150, food: 80 }, req: 4 },
    { name: 'Феодализм', cost: { wood: 350, stone: 300, food: 150 }, req: 5, needs: 'wonder1', note: 'Новая эпоха' },
  ]},
  hut: { pad: [0, 52], levels: [null,
    { name: 'Шалаш', cost: { wood: 10 }, req: 1, pop: 2 },
    { name: 'Хижина', cost: { wood: 25, stone: 10 }, req: 3, pop: 4 },
    { name: 'Глинобитный дом', cost: { wood: 40, stone: 30 }, req: 4, pop: 7 },
  ]},
  storage: { pad: [0, 58], levels: [null,
    { name: 'Склад', cost: { wood: 15 }, req: 2, carry: 4 },
    { name: 'Большой склад', cost: { wood: 30, stone: 15 }, req: 3, carry: 8 },
    { name: 'Амбар', cost: { wood: 60, stone: 40 }, req: 5, carry: 14 },
  ]},
  tower: { pad: [0, 44], levels: [null,
    { name: 'Деревянная вышка', cost: { wood: 25, stone: 5 }, req: 2, dmg: 6, range: 210, cd: 1.1, hp: 150 },
    { name: 'Каменная башня', cost: { wood: 30, stone: 40 }, req: 4, dmg: 13, range: 250, cd: .85, hp: 400 },
  ]},
  wall: { pad: [0, 0], levels: [null,
    { name: 'Частокол', cost: { wood: 60 }, req: 3, hp: 400 },
    { name: 'Каменная стена', cost: { wood: 20, stone: 120 }, req: 4, hp: 1200 },
  ]},
  wonder0: { pad: [0, 100], levels: [null,
    { name: 'Каменный круг', cost: { wood: 40, stone: 120, food: 30 }, req: 3, gp: 1, note: 'Чудо каменного века: даёт очки богов' },
  ]},
  wonder1: { pad: [0, 110], levels: [null,
    { name: 'Зиккурат', cost: { wood: 150, stone: 300, food: 100 }, req: 5, gp: 3, note: 'Чудо бронзового века' },
  ]},
  farm: { pad: [0, 78], levels: [null,
    { name: 'Поле', cost: { wood: 40, stone: 10 }, req: 4, food: 5 },
    { name: 'Орошаемое поле', cost: { wood: 60, stone: 40 }, req: 5, food: 2.5 },
  ]},
};

S.WALL_R = 340;

// Player camp layout, offsets from the camp center. minC = center level at which the empty plot appears.
S.LAYOUT = [
  { type: 'center', dx: 0, dy: 0, minC: 0 },
  { type: 'hut', dx: -170, dy: -70, minC: 1 },
  { type: 'hut', dx: 170, dy: -70, minC: 2 },
  { type: 'hut', dx: -190, dy: 120, minC: 3 },
  { type: 'hut', dx: 190, dy: 120, minC: 3 },
  { type: 'storage', dx: 0, dy: -175, minC: 2 },
  { type: 'tower', dx: 225, dy: -225, minC: 2 },
  { type: 'tower', dx: -225, dy: -225, minC: 3 },
  { type: 'tower', dx: -225, dy: 225, minC: 3 },
  { type: 'tower', dx: 225, dy: 225, minC: 5 },
  { type: 'wall', dx: 0, dy: 290, minC: 3 },
  { type: 'wonder0', dx: 0, dy: -500, minC: 3 },
  { type: 'wonder1', dx: 500, dy: -40, minC: 5 },
  { type: 'farm', dx: -500, dy: -110, minC: 4 },
  { type: 'farm', dx: -500, dy: 130, minC: 5 },
];
S.STOCK = { dx: -70, dy: 70 };

// Rival tribe build order (indexes into its own layout copy).
S.RIVAL_ORDER = ['hut', 'storage', 'center', 'tower', 'hut', 'center', 'hut', 'tower', 'wall', 'hut', 'tower', 'center', 'center'];

S.UNIT = {
  player:  { hp: 100, speed: 150, dmg: 10, cd: .55, range: 38 },
  worker:  { hp: 40, speed: 112, dmg: 4, cd: 1, range: 30, carry: 3 },
  neutral: { hp: 40, speed: 95 },
  warrior: { hp: 60, speed: 128, dmg: 8, cd: 1, range: 32 },
  wolf:    { hp: 30, speed: 168, dmg: 5, cd: .9, range: 30, aggro: 170, leash: 420 },
  bear:    { hp: 140, speed: 120, dmg: 16, cd: 1.3, range: 36, aggro: 110, leash: 280 },
  deer:    { hp: 15, speed: 185, flee: 150, meat: 4 },
};

S.DAY_LEN = 130; S.NIGHT_LEN = 55;

// Guided goals. check() returns true when done; target() gives a point for the guide arrow.
S.QUESTS = [
  { text: 'Подойди к деревьям, рубка идёт сама. Отнеси 10 брёвен к костру', check: g => g.stats.wood >= 10, target: g => g.nearestRes('tree') },
  { text: 'Построй шалаш: встань на площадку рядом с лагерем', check: g => g.lvl('hut') >= 1, target: g => g.buildTarget('hut') },
  { text: 'Найди поселенца со знаком «!» и приведи его в лагерь', check: g => g.workers().length >= 1, target: g => g.nearestNeutral() },
  { text: 'Улучши костёр до стоянки', check: g => g.lvl('center') >= 2, target: g => g.buildTarget('center') },
  { text: 'Добудь 10 камня и принеси в лагерь', check: g => g.stats.stone >= 10, target: g => g.nearestRes('rock') },
  { text: 'Построй сторожевую вышку против волков', check: g => g.lvl('tower') >= 1, target: g => g.buildTarget('tower') },
  { text: 'Улучши лагерь до деревни', check: g => g.lvl('center') >= 3, target: g => g.buildTarget('center') },
  { text: 'Окружи лагерь частоколом', check: g => g.lvl('wall') >= 1, target: g => g.buildTarget('wall') },
  { text: 'Найди ещё поселенцев: нужно 3 работника и жильё для них', check: g => g.workers().length >= 3, target: g => S.popCap('p') <= g.workers().length ? g.buildTarget('hut') : g.nearestNeutral() },
  { text: 'Возведи чудо каменного века: Каменный круг', check: g => g.lvl('wonder0') >= 1, target: g => g.buildTarget('wonder0') },
  { text: 'Перейди в бронзовый век', check: g => g.lvl('center') >= 4, target: g => g.buildTarget('center') },
  { text: 'Засей поле, чтобы еда росла сама', check: g => g.lvl('farm') >= 1, target: g => g.buildTarget('farm') },
  { text: 'Улучши лагерь до бронзового города', check: g => g.lvl('center') >= 5, target: g => g.buildTarget('center') },
  { text: 'Возведи Зиккурат', check: g => g.lvl('wonder1') >= 1, target: g => g.buildTarget('wonder1') },
  { text: 'Перейди в феодализм', check: g => g.lvl('center') >= 6, target: g => g.buildTarget('center') },
  { text: 'Эпоха феодализма открыта. Боги, стратегическая карта и армии появятся в следующих версиях', check: () => false, target: () => null },
];
})();
