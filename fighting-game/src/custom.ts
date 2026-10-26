// Your own fighters and tournaments (user: make fighters, realistic, stats up to the story's
// best; a budget of points so nobody is maxed in everything; pick style, body and look; put
// them in tournaments; move them between devices). Stats use the career's scale (STAT_INFO),
// so a custom fighter fights exactly like a career one (`toFighter` -> `toParams`).
import { STAT_INFO, STAT_KEYS, TONUS_START, odds, rating, type CareerFighter, type StatKey, type Stats } from './career';
import type { DisciplineId } from './disciplines';
import { defaultSkin, type SkinId } from './skins';
import type { MapId } from './maps';
import { lang } from './i18n';

export type CStat = StatKey | 'hands' | 'legs';
export const CSTATS: CStat[] = ['bodySpeed', 'strength', 'mindSpeed', 'skill', 'evasion', 'cardio', 'hands', 'legs'];
export const CSTAT_NAME: Record<CStat, string> = {
  bodySpeed: 'Скорость', strength: 'Сила удара', mindSpeed: 'Реакция', skill: 'Техника', evasion: 'Уклоны', cardio: 'Выносливость', hands: 'Руки', legs: 'Ноги',
};
export const CSTAT_DESC: Record<CStat, string> = {
  bodySpeed: 'Быстрее руки, ноги и шаги. Самое сильное в игре.', strength: 'Тяжелее удары.', mindSpeed: 'Раньше видит удар, чаще решает.',
  skill: 'Чище удары, дистанция, защита.', evasion: 'Чаще и точнее уворачивается.', cardio: 'Дольше не выдыхается.',
  hands: 'Удары руками: чаще, быстрее, сильнее; открывает сложные.', legs: 'Удары ногами: чаще, быстрее, сильнее; открывает вертушки.',
};

/** Levels per stat, and the points to spend (user: 100, a stat to the top costs about 30). */
export const LEVELS = 10;
export const BUDGET = 100;
/** Cost of the l-th level (1, 1, 2, 2, 3, 3...): the top of one stat is 30 points. */
export const levelCost = (l: number) => Math.ceil(l / 2);
export const costTo = (l: number) => {
  let s = 0;
  for (let i = 1; i <= l; i++) s += levelCost(i);
  return s;
};

export const BODY = { hLo: 1.6, hHi: 2.05, wLo: 55, wHi: 130 };
export const STYLES: DisciplineId[] = ['boxing', 'mma', 'muaythai', 'kickboxing', 'karate', 'street'];

export interface CustomFighter {
  v: 1;
  id: string;
  first: string;
  nick: string;
  last: string;
  disc: DisciplineId;
  height: number;
  weight: number;
  skin?: SkinId;
  aggression: number;
  lv: Record<CStat, number>;
  wins: number;
  losses: number;
  titles: number;
}

export interface CMatch {
  a: string;
  b: string;
  w: string | null;
  how?: 'ring' | 'odds';
}

export interface CTour {
  /** Rounds per fight (0 = to the finish, no rounds). */
  rounds: number;
  map: MapId;
  men: string[];
  rounds_: CMatch[][];
  done: boolean;
  champ?: string;
  /** Copies of the fighters as they entered (a fighter edited or deleted later stays as he was). */
  roster: CustomFighter[];
}

export interface CustomStore {
  fighters: CustomFighter[];
  tour: CTour | null;
  /** Past champions, newest first. */
  hall: string[];
}

const KEY = 'arena-fighters-v1';

export function loadStore(): CustomStore {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CustomStore | null;
    if (s?.fighters) return { fighters: s.fighters, tour: s.tour ?? null, hall: s.hall ?? [] };
  } catch {
    /* storage unavailable */
  }
  return { fighters: [], tour: null, hall: [] };
}

export function saveStore(s: CustomStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const spent = (f: CustomFighter) => CSTATS.reduce((s, k) => s + costTo(f.lv[k] ?? 0), 0);
export const left = (f: CustomFighter) => BUDGET - spent(f);
export const fullName = (f: CustomFighter) => `${f.first} «${f.nick}» ${f.last}`;
export const shortName = (f: CustomFighter) => `${f.first} ${f.last}`;

const statOf = (k: StatKey, l: number) => STAT_INFO[k].lo + ((STAT_INFO[k].hi - STAT_INFO[k].lo) * l) / LEVELS;

/** The fighter as the career and the fight engine know him. */
export function toFighter(f: CustomFighter): CareerFighter {
  const stats = {} as Stats;
  for (const k of STAT_KEYS) stats[k] = statOf(k, f.lv[k] ?? 0);
  return {
    id: f.id, name: fullName(f), story: '', discipline: f.disc, height: f.height, weight: f.weight, aggression: f.aggression,
    stats, caps: { ...stats }, record: { w: f.wins, l: f.losses, ko: 0 }, fame: 0, busyUntil: 0, busyFrom: 0, busyWhat: '',
    traits: [], mood: 0, tonus: TONUS_START, sat: 100, energy: 100,
    craft: { hands: (f.lv.hands ?? 0) / LEVELS, legs: (f.lv.legs ?? 0) / LEVELS },
    skin: f.skin ?? defaultSkin(f.disc),
  } as CareerFighter;
}

export const ratingOf = (f: CustomFighter) => rating(toFighter(f));
export const chance = (a: CustomFighter, b: CustomFighter) => odds(toFighter(a), toFighter(b));

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const newId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const RU = {
  first: ['Антон', 'Егор', 'Никита', 'Сергей', 'Денис', 'Арсен', 'Глеб', 'Игорь', 'Артём', 'Руслан', 'Тимур', 'Олег', 'Вадим', 'Стас', 'Марат', 'Влад', 'Борис', 'Макс', 'Илья', 'Пётр'],
  last: ['Белов', 'Сафин', 'Гусев', 'Жуков', 'Котов', 'Назаров', 'Ветров', 'Крюков', 'Соколов', 'Рябов', 'Каримов', 'Зуев', 'Медведев', 'Орлов', 'Чернов', 'Воронин', 'Дубов', 'Громов', 'Волков', 'Левин'],
  nick: ['Молот', 'Тень', 'Бетон', 'Лис', 'Кувалда', 'Пуля', 'Медведь', 'Гвоздь', 'Ворон', 'Дизель', 'Призрак', 'Ураган', 'Лом', 'Монах', 'Скала', 'Молния', 'Кобра', 'Танк', 'Хирург', 'Зверь'],
};
const EN = {
  first: ['Jake', 'Marcus', 'Leo', 'Ivan', 'Diego', 'Kenji', 'Sam', 'Tyler', 'Omar', 'Rico', 'Dante', 'Viktor', 'Luke', 'Andre', 'Felix', 'Hugo', 'Nate', 'Rafael', 'Cole', 'Mason'],
  last: ['Stone', 'Hayes', 'Petrov', 'Silva', 'Tanaka', 'Brooks', 'Reyes', 'Kowalski', 'Novak', 'Grant', 'Cruz', 'Volkov', 'Walsh', 'Duarte', 'Moreau', 'Kane', 'Ortega', 'Fischer', 'Bishop', 'Wolfe'],
  nick: ['Hammer', 'Shadow', 'Concrete', 'Fox', 'Sledge', 'Bullet', 'Bear', 'Nail', 'Raven', 'Diesel', 'Ghost', 'Hurricane', 'Crowbar', 'Monk', 'Rock', 'Lightning', 'Cobra', 'Tank', 'Surgeon', 'Beast'],
};
const names = () => (lang === 'en' ? EN : RU);

/** Which stats each style leans on when the points are spent for him. */
const LEAN: Record<string, Partial<Record<CStat, number>>> = {
  boxing: { bodySpeed: 3, mindSpeed: 2, hands: 3, skill: 2, evasion: 2, strength: 2, cardio: 1.5, legs: 0.1 },
  mma: { bodySpeed: 2.5, strength: 2, hands: 2, legs: 2, cardio: 2, skill: 1.5, mindSpeed: 1.5, evasion: 1 },
  muaythai: { strength: 2, cardio: 2.5, legs: 3, hands: 1.5, skill: 1.5, bodySpeed: 2, mindSpeed: 1, evasion: 0.6 },
  kickboxing: { bodySpeed: 2.5, legs: 2.5, hands: 2, cardio: 2, skill: 1.5, strength: 1.5, mindSpeed: 1.5, evasion: 1 },
  karate: { bodySpeed: 3, legs: 3, mindSpeed: 2, skill: 2, evasion: 1.5, hands: 1, strength: 1, cardio: 1 },
  street: { strength: 3, bodySpeed: 2, cardio: 1.5, hands: 1.5, legs: 1, skill: 0.5, mindSpeed: 1, evasion: 0.5 },
};

/** Spends whatever points are left, leaning on what his style needs (a little luck too). */
export function autoSpend(f: CustomFighter): void {
  const lean = LEAN[f.disc] ?? LEAN.mma;
  for (let guard = 0; guard < 200; guard++) {
    const room = CSTATS.filter((k) => (f.lv[k] ?? 0) < LEVELS && levelCost((f.lv[k] ?? 0) + 1) <= left(f));
    if (!room.length) break;
    const w = room.map((k) => (lean[k] ?? 1) * rnd(0.5, 1.5) / (1 + 0.15 * (f.lv[k] ?? 0)));
    let r = Math.random() * w.reduce((s, x) => s + x, 0);
    let i = 0;
    while (r > w[i] && i < w.length - 1) r -= w[i++];
    f.lv[room[i]] = (f.lv[room[i]] ?? 0) + 1;
  }
}

/** A plain new fighter: the points are not spent yet. */
export function blankFighter(): CustomFighter {
  const n = names();
  const lv = Object.fromEntries(CSTATS.map((k) => [k, 0])) as Record<CStat, number>;
  return { v: 1, id: newId(), first: pick(n.first), nick: pick(n.nick), last: pick(n.last), disc: 'boxing', height: 1.8, weight: 78, aggression: 0.5, lv, wins: 0, losses: 0, titles: 0 };
}

/** A random, realistic fighter with all points spent. */
export function randomFighter(): CustomFighter {
  const f = blankFighter();
  f.disc = pick(STYLES);
  f.height = Math.round(rnd(1.65, 1.98) * 100) / 100;
  // Weight goes with height (BMI ~22-30), heavier for street brawlers.
  const bmi = rnd(22, f.disc === 'street' ? 31 : 28);
  f.weight = Math.round(Math.min(BODY.wHi, Math.max(BODY.wLo, bmi * f.height * f.height)));
  f.aggression = Math.round(rnd(0.3, f.disc === 'street' ? 0.95 : 0.75) * 100) / 100;
  f.skin = defaultSkin(f.disc);
  autoSpend(f);
  return f;
}

export function copyFighter(f: CustomFighter): CustomFighter {
  return { ...JSON.parse(JSON.stringify(f)), id: newId(), wins: 0, losses: 0, titles: 0 };
}

// ---------- Tournaments ----------

/** A new bracket: the strongest are kept apart until late (seeded by rating). */
export function startTour(men: CustomFighter[], rounds: number, map: MapId): CTour {
  const sorted = [...men].sort((a, b) => ratingOf(b) - ratingOf(a));
  const n = sorted.length;
  const SEED: Record<number, number[]> = {
    4: [0, 3, 1, 2],
    8: [0, 7, 3, 4, 1, 6, 2, 5],
    16: [0, 15, 7, 8, 4, 11, 3, 12, 1, 14, 6, 9, 5, 10, 2, 13],
  };
  const order = (SEED[n] ?? sorted.map((_, i) => i)).map((i) => sorted[i].id);
  const first: CMatch[] = [];
  for (let i = 0; i < order.length; i += 2) first.push({ a: order[i], b: order[i + 1], w: null });
  return { rounds, map, men: order, rounds_: [first], done: false, roster: men.map((m) => JSON.parse(JSON.stringify(m)) as CustomFighter) };
}

export const tourMan = (t: CTour, id: string) => t.roster.find((m) => m.id === id)!;

export function roundName(t: CTour, r: number): string {
  const left = t.men.length / 2 ** r;
  return left === 2 ? 'Финал' : left === 4 ? 'Полуфинал' : left === 8 ? 'Четвертьфинал' : left === 16 ? '1/8 финала' : `Раунд ${r + 1}`;
}

/** Records a fight's winner and builds the next round once this one is done. */
export function decideMatch(s: CustomStore, m: CMatch, w: string, how: CMatch['how']): void {
  const t = s.tour!;
  if (m.w) return;
  m.w = w;
  m.how = how;
  const loser = m.w === m.a ? m.b : m.a;
  for (const f of s.fighters) {
    if (f.id === w) f.wins++;
    if (f.id === loser) f.losses++;
  }
  const R = t.rounds_[t.rounds_.length - 1];
  if (!R.every((x) => x.w)) return;
  if (R.length === 1) {
    t.done = true;
    t.champ = w;
    const champ = tourMan(t, w);
    const mine = s.fighters.find((f) => f.id === w);
    if (mine) mine.titles++;
    s.hall.unshift(`${fullName(champ)} · ${t.men.length} бойцов`);
    s.hall.length = Math.min(s.hall.length, 20);
    return;
  }
  const next: CMatch[] = [];
  for (let i = 0; i < R.length; i += 2) next.push({ a: R[i].w!, b: R[i + 1].w!, w: null });
  t.rounds_.push(next);
}

/** A fight not watched: decided by the odds. */
export function countMatch(s: CustomStore, m: CMatch): void {
  const t = s.tour!;
  const p = chance(tourMan(t, m.a), tourMan(t, m.b));
  decideMatch(s, m, Math.random() < p ? m.a : m.b, 'odds');
}

export const currentRound = (t: CTour) => t.rounds_[t.rounds_.length - 1];
