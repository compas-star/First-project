// Manager mode: you own fighters, train them (slowly, in real time), buy new ones and
// enter them in fights and tournaments, from basement brawls to a world title.
// Pure state and rules here; the screen is in careerUi.ts. Stand-up fighting only.
import { RED, BLUE, type FighterParams } from './config';
import type { DisciplineId } from './disciplines';
import type { MapId } from './maps';
import type { Rules } from './sim';
import type { SkinId } from './skins';
import { MOVES } from './moves';
import { storyDay, storyAfterFight, type StoryState } from './story';
import { gymDay, gymK, type GymId } from './gyms';
import { DISCIPLINE_BY_ID } from './disciplines';
import { rollTraits, ensureLife, dailyLife, trainK, lifeParams, moodAfterFight, type TraitId, type Incident } from './life';

export type StatKey = 'bodySpeed' | 'strength' | 'mindSpeed' | 'skill' | 'evasion' | 'cardio';
export type Stats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = ['bodySpeed', 'strength', 'mindSpeed', 'skill', 'evasion', 'cardio'];

export const STAT_INFO: Record<StatKey, { name: string; drill: string; desc: string; lo: number; hi: number; base: number }> = {
  bodySpeed: { name: 'Скорость', drill: 'Спринты и скакалка', desc: 'Быстрее руки, ноги и шаги.', lo: 0.6, hi: 1.6, base: 0.009 },
  strength: { name: 'Сила удара', drill: 'Мешок и штанга', desc: 'Тяжелее удары.', lo: 0.45, hi: 1.7, base: 0.011 },
  mindSpeed: { name: 'Реакция', drill: 'Лапы и реакция на свет', desc: 'Раньше видит удар, чаще решает.', lo: 0.6, hi: 1.6, base: 0.008 },
  skill: { name: 'Техника', drill: 'Бой с тенью и разбор', desc: 'Чище удары, дистанция, защита.', lo: 0, hi: 1, base: 0.01 },
  evasion: { name: 'Уклоны', drill: 'Маятник и нырки', desc: 'Чаще и точнее уворачивается.', lo: 0, hi: 1, base: 0.011 },
  cardio: { name: 'Выносливость', drill: 'Кроссы и раунды', desc: 'Дольше не выдыхается.', lo: 0.6, hi: 1.6, base: 0.01 },
};

export interface CareerFighter {
  id: string;
  name: string;
  story: string;
  discipline: DisciplineId;
  height: number;
  weight: number;
  aggression: number;
  stats: Stats;
  /** How far each quality can grow: his talent, hidden from the manager as an exact number. */
  caps: Stats;
  record: { w: number; l: number; ko: number };
  /** Name in the fight world: opens bigger events. */
  fame: number;
  /** Busy until (ms since epoch): training or getting over a fight. */
  busyUntil: number;
  busyFrom: number;
  busyWhat: string;
  /** A training session in progress, applied when it ends. */
  session?: { stat: StatKey; gain: number; injury: number; move?: string; tonus?: number };
  /** Ranking points (Elo): wins over better men raise them more. */
  elo?: number;
  /** Planned sessions, one a day, started as days go by. */
  queue?: { stat: StatKey; it: Intensity['id']; move?: string }[];
  /** Character (life.ts): drinker, hothead, lazy... and mood -100..100. */
  traits?: TraitId[];
  mood?: number;
  /** Hungover on this day: training gives half. */
  hangover?: number;
  /** A look of his own instead of his style's (a bouncer in a leather jacket). */
  skin?: SkinId;
  /** Sharpness 0..100: kept up by training (even at his ceiling), lost on days off. */
  tonus?: number;
  /** Hands and legs worked on in the gym, 0..1 (see craftMoves). */
  craft?: { hands: number; legs: number };
  /** Old saves: single strikes drilled (turned into craft on load). */
  drills?: Record<string, number>;
  /** The manager's plan for each round of his next fights (PlanId or 'auto'). */
  gamePlan?: string[];
}

export interface Tier {
  id: string;
  name: string;
  desc: string;
  map: MapId;
  rules: Rules;
  /** Opponents' level, 0 = a beginner from the street .. 1 = the best in the world. */
  level: [number, number];
  fame: number;
  purse: [number, number];
  fee: number;
  prize: number;
  tokens: number;
  size: 8 | 16;
}

export const TIERS: Tier[] = [
  { id: 'basement', name: 'Подвал', desc: 'Подпольные бои в подворотне. Три раунда по три минуты, судит толпа, деньги наличкой.', map: 'alley', rules: { roundLen: 180, clock: 3, rounds: 3, tough: 1, standing: true }, level: [0, 0.12], fame: 0, purse: [70, 15], fee: 40, prize: 400, tokens: 3, size: 8 },
  { id: 'roof', name: 'Крыши', desc: 'Бои на крышах для богатых зевак. Три раунда по три минуты, соперники злее.', map: 'roof', rules: { roundLen: 180, clock: 3, rounds: 3, tough: 1.2, standing: true }, level: [0.12, 0.28], fame: 6, purse: [150, 35], fee: 90, prize: 900, tokens: 4, size: 8 },
  { id: 'club', name: 'Клубная лига', desc: 'Додзё и залы. Три раунда по три минуты, судьи.', map: 'dojo', rules: { roundLen: 180, clock: 3, rounds: 3, tough: 1.6, standing: true }, level: [0.28, 0.45], fame: 18, purse: [320, 80], fee: 200, prize: 2200, tokens: 5, size: 16 },
  { id: 'city', name: 'Городской ринг', desc: 'Настоящий ринг и зрители. Три раунда по три минуты.', map: 'ring', rules: { roundLen: 180, clock: 3, rounds: 3, tough: 2, standing: true }, level: [0.45, 0.63], fame: 40, purse: [700, 170], fee: 450, prize: 5200, tokens: 7, size: 16 },
  { id: 'nation', name: 'Чемпионат страны', desc: 'Лучшие бойцы страны в клетке. Пять раундов по три минуты.', map: 'cage', rules: { roundLen: 180, clock: 3, rounds: 5, tough: 2.4, standing: true }, level: [0.63, 0.82], fame: 80, purse: [1600, 400], fee: 1000, prize: 12000, tokens: 10, size: 16 },
  { id: 'world', name: 'Мировой титул', desc: 'Лучшие из лучших. Пять раундов по три минуты, пояс.', map: 'ring', rules: { roundLen: 180, clock: 3, rounds: 5, tough: 2.6, standing: true }, level: [0.82, 1], fame: 140, purse: [4000, 900], fee: 2500, prize: 32000, tokens: 16, size: 16 },
];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<string, Tier>;

/** One pairing in the bracket, by fighter id; `w` is the winner's id once decided. */
export interface Match {
  a: string;
  b: string;
  w: string | null;
}

export interface Tour {
  tier: string;
  /** Our fighter's id. */
  fighter: string;
  /** Everyone else in the draw. */
  field: CareerFighter[];
  /** The bracket, round by round; the last round is the one being fought. */
  rounds: Match[][];
  /** The calendar event it belongs to. */
  ev?: number;
}

export interface Career {
  money: number;
  tokens: number;
  roster: CareerFighter[];
  market: CareerFighter[];
  marketAt: number;
  tour: Tour | null;
  log: string[];
  /** The fighter the manager is looking at. */
  pick: string;
  /** One-off gifts already given to this save (e.g. 'tokens100'). */
  gifts?: string[];
  /** The how-to card was closed. */
  seenHelp?: boolean;
  /** Everyone else in the fight world: they fight each other, rise and fall. */
  world?: CareerFighter[];
  /** Holder of the belt before weight classes (kept for old saves). */
  champion?: string | null;
  /** Holder of each weight class's belt. */
  belts?: Record<string, string | null>;
  /** Feelings between two fighters, -100 (sworn enemies) .. 100, by pair key. */
  rel?: Record<string, number>;
  /** What happened in the fight world, newest first. */
  news?: string[];
  /** When the world last had a fight night (before the calendar). */
  worldAt?: number;
  nights?: number;
  /** Today's number in the calendar (day 1 is a Monday) and when it began, real time. */
  day: number;
  dayAt: number;
  /** What is on in the fight world, day by day: fight nights, tournaments, title bouts. */
  events: Ev[];
  /** Days already filled with events. */
  planned: number;
  nextEv: number;
  /** Things that happened to ours and wait for the manager's word (life.ts). */
  incidents?: Incident[];
  nextInc?: number;
  /** Story lines (story.ts). */
  story?: StoryState;
  /** The gym the team trains in (gyms.ts), paid until this day. */
  gym?: GymId;
  gymUntil?: number;
}

export type EvKind = 'night' | 'tour' | 'title';

/** Something on the calendar. Ours can sign up for it; the rest of the world fights anyway. */
export interface Ev {
  id: number;
  day: number;
  kind: EvKind;
  tier: string;
  /** Our fighter signed up, and for a single fight whom he meets. */
  f?: string;
  opp?: string;
  /** Our part in it is over. */
  done?: boolean;
}

const KEY = 'arena-career-v1';
export const MAX_ROSTER = 4;

// ---------- People ----------

const FIRST = ['Антон', 'Егор', 'Никита', 'Сергей', 'Денис', 'Арсен', 'Эрик', 'Глеб', 'Игорь', 'Артём', 'Дима', 'Саша', 'Руслан', 'Тимур', 'Миша', 'Гоша', 'Костя', 'Олег', 'Вадим', 'Стас', 'Рома', 'Женя', 'Леха', 'Марат', 'Самир', 'Паша', 'Ярик', 'Федя', 'Гена', 'Влад', 'Ильдар', 'Борис'];
const LAST = ['Белов', 'Сафин', 'Гусев', 'Жуков', 'Абрамов', 'Котов', 'Назаров', 'Пахомов', 'Ветров', 'Крюков', 'Шаталов', 'Гром', 'Бурков', 'Соколов', 'Рябов', 'Лисин', 'Каримов', 'Зуев', 'Медведев', 'Орлов', 'Ткач', 'Седых', 'Ковалёв', 'Мамаев', 'Чернов', 'Воронин', 'Хан', 'Дубов'];
const NICK = ['Молот', 'Шрам', 'Тень', 'Бетон', 'Лис', 'Кувалда', 'Пуля', 'Сквозняк', 'Медведь', 'Гвоздь', 'Ворон', 'Зубило', 'Дизель', 'Призрак', 'Кирпич', 'Скат', 'Ураган', 'Лом', 'Пёс', 'Монах'];

interface Story {
  text: string;
  disc: DisciplineId[];
  /** Added to the base of each quality (and a little to its ceiling). */
  bias: Partial<Stats>;
  height: [number, number];
  weight: [number, number];
  aggression: [number, number];
}

const STORIES: Story[] = [
  { text: 'Вышибала из ночного клуба. Бьёт тяжело, двигается как шкаф.', disc: ['street'], bias: { strength: 0.18, bodySpeed: -0.07, skill: -0.08, cardio: -0.05 }, height: [1.85, 1.98], weight: [95, 120], aggression: [0.6, 0.9] },
  { text: 'Боксёр-любитель, бросил зал после армии. Руки помнят.', disc: ['boxing'], bias: { skill: 0.12, mindSpeed: 0.04 }, height: [1.72, 1.88], weight: [68, 88], aggression: [0.4, 0.7] },
  { text: 'Пацан с района. Дрался во дворах с двенадцати лет.', disc: ['street'], bias: { bodySpeed: 0.03, skill: -0.05 }, height: [1.68, 1.85], weight: [62, 82], aggression: [0.7, 1] },
  { text: 'Ушёл из тайского зала после травмы колена. Хочет вернуться.', disc: ['muaythai'], bias: { skill: 0.1, cardio: 0.06, bodySpeed: -0.03 }, height: [1.7, 1.86], weight: [65, 82], aggression: [0.5, 0.8] },
  { text: 'Каратист из детской секции. Лёгкий, быстрый, держит дистанцию.', disc: ['karate'], bias: { bodySpeed: 0.08, evasion: 0.1, strength: -0.1 }, height: [1.68, 1.84], weight: [60, 75], aggression: [0.3, 0.6] },
  { text: 'Грузчик с рынка. Тягает мешки по двенадцать часов, не устаёт.', disc: ['street', 'boxing'], bias: { cardio: 0.18, strength: 0.08, skill: -0.08, mindSpeed: -0.05 }, height: [1.75, 1.92], weight: [80, 100], aggression: [0.4, 0.7] },
  { text: 'Студент, ходит на кикбоксинг по вечерам. Думает быстрее, чем бьёт.', disc: ['kickboxing'], bias: { mindSpeed: 0.1, skill: 0.06, strength: -0.06 }, height: [1.74, 1.9], weight: [66, 80], aggression: [0.3, 0.6] },
  { text: 'Бывший спарринг-партнёр чемпиона. Видел всё, сам ничего не выиграл.', disc: ['boxing', 'kickboxing'], bias: { skill: 0.16, evasion: 0.06, bodySpeed: -0.04 }, height: [1.72, 1.88], weight: [70, 90], aggression: [0.3, 0.5] },
  { text: 'Охранник на стройке. Спокойный, пока не разозлят.', disc: ['street', 'mma'], bias: { strength: 0.1 }, height: [1.78, 1.94], weight: [82, 105], aggression: [0.3, 0.6] },
  { text: 'Танцор брейка. Ни одного боя, но поймать его невозможно.', disc: ['kickboxing', 'street'], bias: { evasion: 0.2, bodySpeed: 0.06, strength: -0.12, skill: -0.06 }, height: [1.68, 1.82], weight: [58, 72], aggression: [0.2, 0.5] },
];

// ---------- Weight classes ----------

export interface WClass {
  id: 'light' | 'middle' | 'heavy';
  name: string;
  lo: number;
  hi: number;
}

/** Fights are made inside a weight class: a two-metre biker does not meet a 65 kg kid. */
export const WCLASSES: WClass[] = [
  { id: 'light', name: 'Лёгкий вес', lo: 56, hi: 70 },
  { id: 'middle', name: 'Средний вес', lo: 71, hi: 85 },
  { id: 'heavy', name: 'Тяжёлый вес', lo: 86, hi: 122 },
];
export const classOf = (f: CareerFighter): WClass => (f.weight <= 70 ? WCLASSES[0] : f.weight <= 85 ? WCLASSES[1] : WCLASSES[2]);
export const sameClass = (a: CareerFighter, b: CareerFighter) => classOf(a) === classOf(b);

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickOf = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Quality at a level 0..1 across the fight world (what a typical fighter there has). */
function levelStat(k: StatKey, L: number): number {
  const at: Record<StatKey, [number, number]> = {
    bodySpeed: [0.78, 1.42],
    strength: [0.62, 1.52],
    mindSpeed: [0.78, 1.42],
    skill: [0.15, 0.9],
    evasion: [0.1, 0.7],
    cardio: [0.8, 1.42],
  };
  const [a, b] = at[k];
  return a + (b - a) * L;
}

let idSeq = Date.now() % 1e6;

/**
 * A fighter with a story. `level` is where he stands now (0 = fresh off the street),
 * `talent` how far he can go (0..1, 1 = a future world champion).
 */
export function makeFighter(level: number, talent: number, cls?: WClass): CareerFighter {
  // A story that fits the weight class, if one is asked for.
  const fits = cls ? STORIES.filter((x) => x.weight[0] <= cls.hi && x.weight[1] >= cls.lo) : STORIES;
  const st = pickOf(fits.length ? fits : STORIES);
  const stats = {} as Stats;
  const caps = {} as Stats;
  for (const k of STAT_KEYS) {
    const info = STAT_INFO[k];
    const b = st.bias[k] ?? 0;
    const now = levelStat(k, level) + b * (k === 'skill' || k === 'evasion' ? 0.8 : 1) + rnd(-0.05, 0.05);
    stats[k] = clamp(now, info.lo, info.hi);
    // The ceiling: talent mostly, his story a little, and luck per quality.
    const top = levelStat(k, clamp(0.35 + 0.7 * talent + rnd(-0.12, 0.12), 0.25, 1.05)) + 0.5 * b;
    caps[k] = clamp(Math.max(top, stats[k] + 0.03), info.lo, info.hi);
  }
  return {
    id: `f${(idSeq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: `${pickOf(FIRST)} «${pickOf(NICK)}» ${pickOf(LAST)}`,
    story: st.text,
    discipline: pickOf(st.disc),
    ...bodyOf(st, cls),
    aggression: Math.round(rnd(...st.aggression) * 100) / 100,
    stats,
    caps,
    record: { w: 0, l: 0, ko: 0 },
    fame: Math.round(level * 120),
    busyUntil: 0,
    busyFrom: 0,
    busyWhat: '',
    traits: rollTraits(),
    mood: Math.round(rnd(10, 50)),
  };
}

/** Height and weight from his story, inside the weight class when there is one. */
function bodyOf(st: Story, cls?: WClass): { height: number; weight: number } {
  if (!cls) return { height: Math.round(rnd(...st.height) * 100) / 100, weight: Math.round(rnd(...st.weight)) };
  const lo = Math.max(st.weight[0], cls.lo);
  const hi = Math.min(st.weight[1], cls.hi);
  const weight = Math.round(lo <= hi ? rnd(lo, hi) : rnd(cls.lo, cls.hi));
  // Height goes with the weight: a light man is not two metres tall.
  const h = clamp(rnd(...st.height), 1.6 + (weight - 56) * 0.0055, 1.74 + (weight - 56) * 0.0055);
  return { height: Math.round(h * 100) / 100, weight };
}

/** One number for how good he is right now, 0..100. Speed matters most in this game. */
export function rating(f: CareerFighter): number {
  const s = f.stats;
  const n = (k: StatKey) => (s[k] - STAT_INFO[k].lo) / (STAT_INFO[k].hi - STAT_INFO[k].lo);
  const v = 0.3 * n('bodySpeed') + 0.17 * n('mindSpeed') + 0.18 * n('strength') + 0.2 * n('skill') + 0.07 * n('evasion') + 0.08 * n('cardio');
  return Math.round(100 * v);
}

/** How far he could go, as a coach would say it. */
export function talentWord(f: CareerFighter): string {
  const s = { ...f.stats, ...f.caps } as Stats;
  const r = rating({ ...f, stats: s });
  return r >= 85 ? 'будущий чемпион мира' : r >= 72 ? 'большой талант' : r >= 58 ? 'крепкий профи' : r >= 45 ? 'середняк' : 'потолок близко';
}

export function value(f: CareerFighter): number {
  const r = rating(f);
  const pot = rating({ ...f, stats: f.caps });
  return Math.round((40 * Math.exp(r / 18) + 12 * Math.exp(pot / 28)) / 10) * 10;
}

export function toParams(f: CareerFighter, team: 0 | 1, angry = false): FighterParams {
  const p: FighterParams = {
    name: f.name.replace(/^(\S+) «(.+)» (\S+)$/, '$2'),
    color: team === 0 ? RED : BLUE,
    height: f.height,
    weight: f.weight,
    strength: f.stats.strength,
    bodySpeed: f.stats.bodySpeed,
    mindSpeed: f.stats.mindSpeed,
    linkMind: false,
    // Against a sworn enemy he comes forward harder and a little more carelessly.
    aggression: angry ? Math.min(1, f.aggression + 0.25) : f.aggression,
    skill: angry ? f.stats.skill * 0.93 : f.stats.skill,
    evasion: f.stats.evasion,
    cardio: f.stats.cardio,
    discipline: f.discipline,
    grappling: 0,
    powers: [],
  };
  if (f.skin) p.skin = f.skin;
  // Sharp or rusty: a fighter who keeps training is a bit quicker, harder and fresher.
  const tk = tonusK(f);
  p.bodySpeed *= tk;
  p.strength *= tk;
  p.cardio = (p.cardio ?? 1) * tk;
  p.mindSpeed *= 1 + (tk - 1) * 0.5;
  if (f.craft) p.moves = craftMoves(f);
  if (f.gamePlan?.some((x) => x !== 'auto')) p.roundPlan = [...f.gamePlan];
  lifeParams(f, p);
  return p;
}

// ---------- Sharpness (tonus) ----------

export const TONUS_START = 60;
export const tonusOf = (f: CareerFighter) => f.tonus ?? TONUS_START;
/** 100 = +5% speed, power and wind; 0 = -7.5%. World fighters keep in shape on their own. */
export const tonusK = (f: CareerFighter) => 1 + 0.05 * (tonusOf(f) - TONUS_START) / 40;
export function tonusWord(f: CareerFighter): string {
  const t = tonusOf(f);
  return t >= 85 ? 'отличная' : t >= 65 ? 'хорошая' : t >= 45 ? 'средняя' : t >= 25 ? 'уходит' : 'заржавел';
}
const TONUS_GAIN: Record<Intensity['id'], number> = { light: 8, normal: 14, hard: 22 };

// ---------- Hands and legs (strike craft) and style ----------

/** Two things to work on instead of twenty strikes (user): hands and legs. The higher, the
 *  more and harder strikes he has: the basics first, then the tricky ones, then the
 *  spinning and flying ones. A strike his style does not teach becomes his once open. */
export type Craft = 'hands' | 'legs';
export const CRAFT_NAME: Record<Craft, string> = { hands: 'Руки', legs: 'Ноги' };
export const CRAFT_TIERS: Record<Craft, string[][]> = {
  hands: [
    ['jab', 'cross', 'hook', 'rhook', 'luppercut', 'uppercut'],
    ['overhand', 'shovel', 'checkhook', 'lelbow', 'relbow'],
    ['superman', 'backfist', 'spinelbow'],
  ],
  legs: [
    ['teep', 'lowkick', 'calfkick', 'frontkick', 'rknee', 'lknee'],
    ['bodykick', 'leadkick', 'headkick', 'sweep'],
    ['spinkick', 'flyknee'],
  ],
};
/** Level a tier opens at. */
export const TIER_OPEN = [0, 0.35, 0.7];
export const craftOf = (f: CareerFighter, k: Craft) => f.craft?.[k] ?? 0;
/** How well he has each strike from his hands and legs (FighterParams.moves). */
export function craftMoves(f: CareerFighter): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ['hands', 'legs'] as Craft[]) {
    const L = craftOf(f, k);
    CRAFT_TIERS[k].forEach((ids, t) => {
      // Fresh in a tier = a little; grows to full over the next stretch. Fancy strikes
      // stay rarer even when mastered.
      if (L <= 0 || L < TIER_OPEN[t]) return;
      const v = Math.min(1, 0.25 + (L - TIER_OPEN[t]) / 0.4) * [1, 0.7, 0.4][t];
      for (const id of ids) out[id] = v;
    });
  }
  return out;
}
/** What a day on hands or legs adds: less as he masters them, more with good technique. */
export function craftGain(f: CareerFighter, k: Craft, it: Intensity, c?: Career): number {
  return 0.05 * gymK(c, k) * it.k * trainK(f) * (0.55 + 0.6 * f.stats.skill) * (1 - 0.6 * craftOf(f, k));
}
export const styleCost = (f: CareerFighter) => 150 + Math.round(f.fame * 3);
/** A new school: 3 days of learning; his hands and legs stay what they are. */
export function changeStyle(c: Career, f: CareerFighter, d: DisciplineId): string | null {
  if (d === f.discipline) return 'Уже этот стиль';
  if (busy(c, f)) return 'Боец занят';
  for (let x = c.day; x < c.day + 3; x++) if (bookedOn(c, f, x)) return `В ${dayName(x)} у него бой`;
  const cost = styleCost(f);
  if (c.money < cost) return 'Не хватает денег';
  c.money -= cost;
  f.discipline = d;
  f.queue = [];
  f.busyFrom = c.day;
  f.busyUntil = c.day + 3;
  f.busyWhat = `переучивается: ${DISCIPLINE_BY_ID[d].name}`;
  save(c);
  return null;
}

// ---------- Training ----------

export interface Intensity {
  id: 'light' | 'normal' | 'hard';
  name: string;
  /** Days it takes: he does nothing else then. */
  days: number;
  cost: number;
  k: number;
  injury: number;
}

export const INTENSITY: Intensity[] = [
  { id: 'light', name: 'Лёгкая', days: 1, cost: 10, k: 0.45, injury: 0 },
  { id: 'normal', name: 'Обычная', days: 1, cost: 30, k: 1, injury: 0.02 },
  { id: 'hard', name: 'Тяжёлая', days: 1, cost: 75, k: 2, injury: 0.1 },
];

/** What a session would add: small, and less the closer he is to his ceiling. */
export function gainOf(f: CareerFighter, k: StatKey, it: Intensity, c?: Career): number {
  const info = STAT_INFO[k];
  const room = (f.caps[k] - f.stats[k]) / Math.max(0.05, f.caps[k] - info.lo);
  return Math.max(0, info.base * it.k * trainK(f) * gymK(c, k) * Math.min(1, 0.15 + 1.6 * room) * (room > 0 ? 1 : 0));
}

/** Busy today (training, getting over a fight); `busyUntil` is the first day he is free. */
export const busy = (c: Career, f: CareerFighter, day = c.day) => f.busyUntil > day;

/** His fight booked on that day, if any. */
export const bookedOn = (c: Career, f: CareerFighter, day: number) => c.events.find((e) => e.f === f.id && e.day === day && !e.done) ?? null;

export function startTraining(c: Career, f: CareerFighter, k: StatKey, it: Intensity, move?: string): string | null {
  if (busy(c, f)) return 'Боец занят';
  if (c.tour?.fighter === f.id) return 'Боец на турнире';
  for (let d = c.day; d < c.day + it.days; d++) if (bookedOn(c, f, d)) return `В ${dayName(d)} у него бой`;
  if (c.money < it.cost) return 'Не хватает денег';
  c.money -= it.cost;
  // Real rounds of real work: a hard week can also leave him hurt.
  const hurt = Math.random() < it.injury ? 1 : 0;
  const luck = 0.75 + 0.5 * Math.random();
  f.session = move
    ? { stat: k, gain: craftGain(f, move as Craft, it, c) * luck, injury: hurt, move, tonus: TONUS_GAIN[it.id] * gymK(c, 'tonus') }
    : { stat: k, gain: gainOf(f, k, it, c) * luck, injury: hurt, tonus: TONUS_GAIN[it.id] * gymK(c, 'tonus') };
  f.busyFrom = c.day;
  f.busyUntil = c.day + it.days;
  f.busyWhat = move ? `${move === 'hands' ? 'работа рук' : 'работа ног'} (${it.name.toLowerCase()})` : `${STAT_INFO[k].drill} (${it.name.toLowerCase()})`;
  save(c);
  return null;
}

/** Adds a session to his plan; if he is free today, the first one starts right away. */
export function queueTraining(c: Career, f: CareerFighter, k: StatKey, it: Intensity, move?: string): string | null {
  (f.queue ??= []).push(move ? { stat: k, it: it.id, move } : { stat: k, it: it.id });
  const err = startQueued(c, f);
  save(c);
  return err;
}

/** Starts the next planned session if he can train today. Null = started or nothing to do. */
export function startQueued(c: Career, f: CareerFighter): string | null {
  const q = f.queue;
  if (!q?.length || busy(c, f) || c.tour?.fighter === f.id || bookedOn(c, f, c.day)) return null;
  const next = q[0];
  const it = INTENSITY.find((x) => x.id === next.it)!;
  const err = startTraining(c, f, next.stat, it, next.move);
  if (err) {
    // Cannot go on (no money): the rest of the plan is dropped, said once.
    f.queue = [];
    return err;
  }
  q.shift();
  return null;
}

/** Days and tokens to get through what he is doing now and his whole plan. */
export function planSkip(c: Career, f: CareerFighter): { days: number; tokens: number } {
  const days = (busy(c, f) ? f.busyUntil - c.day : 0) + (f.queue?.length ?? 0);
  return { days, tokens: days ? dayCost(c) + 3 * (days - 1) : 0 };
}

/** Skips day after day (paying tokens) until he is free and the plan is done. */
export function skipPlan(c: Career, f: CareerFighter): string | null {
  const need = planSkip(c, f);
  if (!need.days) return 'План пуст';
  if (c.tokens < need.tokens) return `Нужно ${need.tokens} ◆`;
  for (let n = 0; n < 40 && (busy(c, f) || f.queue?.length); n++) {
    const before = c.day;
    const err = nextDay(c);
    if (err === 'fight' || err === 'tour') return 'Сегодня бой: план остановлен, сходи на бой';
    if (err) return err;
    if (c.day === before) break;
    // A day the plan could not go on (no money, a fight): stop there.
    if (!busy(c, f) && f.queue?.length) {
      const why = startQueued(c, f);
      if (why) return `План остановлен: ${why.toLowerCase()}`;
      if (!busy(c, f)) return bookedOn(c, f, c.day) ? 'Сегодня бой: план остановлен' : null;
    }
  }
  return null;
}

// ---------- The calendar ----------

/** Real time a day lasts; it can be ended sooner with tokens. */
export const DAY_MS = 3 * 60000;
const BASE = new Date(2025, 2, 3);
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export const dateOf = (day: number) => new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + day - 1);
/** '12 марта' */
export const dayName = (day: number) => dateOf(day).toLocaleDateString('ru', { day: 'numeric', month: 'long' });
export const weekday = (day: number) => WD[(day - 1) % 7];
export const weekStart = (day: number) => day - ((day - 1) % 7);

/** How often each league holds what, in days (and on which day of the cycle). */
const SCHEDULE: Record<string, { night: [number, number]; tour: [number, number] }> = {
  basement: { night: [2, 0], tour: [5, 2] },
  roof: { night: [3, 1], tour: [6, 3] },
  club: { night: [3, 2], tour: [7, 5] },
  city: { night: [4, 0], tour: [9, 6] },
  nation: { night: [5, 3], tour: [12, 8] },
  world: { night: [6, 4], tour: [14, 12] },
};
const TITLE_EVERY = 10;

/** Fills the calendar four weeks ahead and forgets what is long past. */
export function plan(c: Career): void {
  for (let d = c.planned + 1; d <= c.day + 34; d++) {
    for (const t of TIERS) {
      const s = SCHEDULE[t.id];
      if ((d + s.night[1]) % s.night[0] === 0) c.events.push({ id: c.nextEv++, day: d, kind: 'night', tier: t.id });
      if ((d + s.tour[1]) % s.tour[0] === 0) c.events.push({ id: c.nextEv++, day: d, kind: 'tour', tier: t.id });
    }
    if (d % TITLE_EVERY === 0) c.events.push({ id: c.nextEv++, day: d, kind: 'title', tier: 'world' });
    c.planned = d;
  }
  c.events = c.events.filter((e) => e.day >= weekStart(c.day) - 7);
}

export const eventsOn = (c: Career, day: number) => c.events.filter((e) => e.day === day);
export const evById = (c: Career, id: number) => c.events.find((e) => e.id === id) ?? null;

/** Our fight waiting today: the day does not end by itself until it is fought or dropped. */
export function waiting(c: Career): Ev | null {
  return c.events.find((e) => e.day === c.day && e.f && !e.done) ?? null;
}

/** Tokens to end the day now: one per started minute left. */
export function dayCost(c: Career, now = Date.now()): number {
  return Math.max(0, Math.ceil((c.dayAt + DAY_MS - now) / 60000));
}

/** Days that have run out in real time: they pass (while the game was closed too). */
export function tick(c: Career, now = Date.now()): string[] {
  const out: string[] = [];
  let n = 0;
  while (now - c.dayAt >= DAY_MS && !waiting(c) && !c.tour && n++ < 10) {
    c.dayAt += DAY_MS;
    out.push(...endDay(c));
  }
  // Away for long, or a fight waiting today: the next day starts when this one is done.
  if (now - c.dayAt > DAY_MS) c.dayAt = now - DAY_MS;
  if (out.length) {
    c.log.unshift(...out);
    c.log.length = Math.min(c.log.length, 40);
  }
  if (n) save(c);
  return out;
}

/** The player ends the day: tokens if its time is not up; a fight left today is dropped. */
export function nextDay(c: Career, force = false): string | null {
  const w = waiting(c);
  if (c.tour) {
    const t = c.tour;
    const alive = !!myMatch(t) && !myMatch(t)!.w;
    if (alive && !finished(t) && !force) return 'tour';
    if (alive && !finished(t)) {
      const m = myMatch(t)!;
      settle(c, m, m.a === t.fighter ? m.b : m.a);
      c.log.unshift('Снялся с турнира');
    }
    closeTour(c);
  } else if (w && !force) return 'fight';
  else if (w) unbook(c, w);
  const cost = dayCost(c);
  if (c.tokens < cost) return 'Не хватает жетонов';
  c.tokens -= cost;
  c.dayAt = Date.now();
  const out = endDay(c);
  c.log.unshift(...out);
  c.log.length = Math.min(c.log.length, 40);
  save(c);
  return null;
}

/** Midnight: the world's fights of the day, sessions finished, a new day planned. */
function endDay(c: Career): string[] {
  const out = worldDay(c, c.day);
  c.day++;
  const trained = new Set<CareerFighter>();
  for (const f of c.roster) {
    if (f.session && f.busyUntil <= c.day) {
      const s = f.session;
      f.session = undefined;
      f.tonus = Math.min(100, tonusOf(f) + (s.tonus ?? 12));
      trained.add(f);
      if (s.move) {
        const k = s.move as Craft;
        f.craft ??= { hands: 0, legs: 0 };
        const was = f.craft[k];
        f.craft[k] = Math.min(1, was + s.gain);
        out.push(`${short(f)}: ${CRAFT_NAME[k]} ${Math.round(was * 100)}→${Math.round(f.craft[k] * 100)}%`);
        const opened = TIER_OPEN.findIndex((o) => was < o && f.craft![k] >= o);
        if (opened > 0) out.push(`${short(f)} освоил новые удары: ${CRAFT_TIERS[k][opened].map(moveName).join(', ')}`);
      } else {
        const before = f.stats[s.stat];
        f.stats[s.stat] = Math.min(f.caps[s.stat], before + s.gain);
        const d = f.stats[s.stat] - before;
        const shown = s.stat === 'skill' || s.stat === 'evasion' ? `${(d * 100).toFixed(1)}%` : `×${d.toFixed(3)}`;
        out.push(`${short(f)}: ${STAT_INFO[s.stat].name} +${shown}${d < 1e-4 ? ' — потолок, но тонус держит' : ''}`);
      }
      if (s.injury) {
        f.busyFrom = c.day;
        f.busyUntil = c.day + 3;
        f.busyWhat = 'потянул мышцу на тренировке';
        out.push(`${short(f)} потянул мышцу: 3 дня отдыха`);
      } else f.busyWhat = '';
    } else if (!f.session && f.busyWhat && f.busyUntil <= c.day) {
      out.push(`${short(f)} восстановился`);
      f.busyWhat = '';
    }
  }
  // A day without the gym: he goes soft (slower while getting over a fight).
  for (const f of c.roster) {
    if (trained.has(f)) continue;
    const before = tonusOf(f);
    f.tonus = Math.max(0, before - (f.busyWhat && !f.session ? 3 : 6));
    if (before >= 45 && f.tonus < 45) out.push(`${short(f)} теряет форму: пора в зал`);
  }
  if (c.day - c.marketAt >= MARKET_DAYS) refreshMarket(c);
  plan(c);
  // The new day's planned sessions begin.
  for (const f of c.roster) {
    const why = startQueued(c, f);
    if (why) out.push(`${short(f)}: план тренировок встал (${why.toLowerCase()})`);
  }
  out.push(...dailyLife(c));
  out.push(...gymDay(c));
  out.push(...storyDay(c));
  out.unshift(`— ${dayName(c.day)}, ${weekday(c.day)} —`);
  return out;
}

/** Can he sign up for this? Null if yes. */
export function canBook(c: Career, f: CareerFighter, e: Ev): string | null {
  const t = TIER_BY_ID[e.tier];
  if (e.day < c.day || e.done) return 'уже прошло';
  if (e.f) return e.f === f.id ? 'уже записан' : 'записан другой твой боец';
  if (bookedOn(c, f, e.day)) return 'в этот день у него уже бой';
  if (busy(c, f, e.day)) return e.day === c.day ? (f.session ? 'сегодня он в зале' : 'восстанавливается') : 'ещё не восстановится';
  if (e.kind === 'title') return titleBout(c, f) ? null : 'нужно быть в тройке рейтинга';
  if (f.fame < t.fame) return `нужна известность ${t.fame}`;
  if (e.kind === 'tour' && c.money < t.fee) return 'мало денег на взнос';
  return null;
}

/** Signs him up: a tournament's fee is paid now; a single fight gets its opponent now. */
export function book(c: Career, f: CareerFighter, e: Ev, opp?: CareerFighter): string | null {
  const why = canBook(c, f, e);
  if (why) return why;
  const t = TIER_BY_ID[e.tier];
  if (e.kind === 'tour') c.money -= t.fee;
  if (e.kind === 'night') e.opp = (opp ?? worldOpponent(c, t, f)).id;
  e.f = f.id;
  c.log.unshift(`${short(f)} записан: ${evTitle(e)}, ${dayName(e.day)}`);
  save(c);
  return null;
}

/** Drops out. A tournament's fee is not returned; a no-show on the day costs a little name. */
export function unbook(c: Career, e: Ev): void {
  const f = c.roster.find((x) => x.id === e.f);
  if (f && e.day === c.day) f.fame = Math.max(0, f.fame - 1);
  if (f) c.log.unshift(`${short(f)} снялся: ${evTitle(e)}`);
  e.f = undefined;
  e.opp = undefined;
  save(c);
}

/** Another opponent for a booked single fight. */
export function rebook(c: Career, e: Ev): void {
  const f = c.roster.find((x) => x.id === e.f);
  if (f) e.opp = worldOpponent(c, TIER_BY_ID[e.tier], f).id;
  save(c);
}

/** A call-out: the next fight night of his league that ours is free for. */
export function challenge(c: Career, f: CareerFighter, opp: CareerFighter): string | null {
  if (!sameClass(f, opp)) return `Он в другом весе (${classOf(opp).name.toLowerCase()}): бои только в своей категории`;
  const t = tierOf(opp);
  if (f.fame < t.fame) return `Чтобы вызвать его, нужна известность ${t.fame} (лига «${t.name}»)`;
  const e = c.events.find((x) => x.kind === 'night' && x.tier === t.id && !canBook(c, f, x));
  if (!e) return 'Ближайшие вечера боёв заняты';
  return book(c, f, e, opp);
}

export function evTitle(e: Ev): string {
  const t = TIER_BY_ID[e.tier];
  return e.kind === 'title' ? 'бой за пояс чемпиона мира' : e.kind === 'tour' ? `турнир «${t.name}» на ${t.size}` : `вечер боёв «${t.name}»`;
}

// ---------- Market ----------

export function refreshMarket(c: Career): void {
  const best = Math.max(0, ...c.roster.map((f) => rating(f)));
  c.market = Array.from({ length: 4 }, (_, i) => {
    // Mostly people around your level, now and then someone a step up, and a raw talent.
    const L = clamp(best / 100 - 0.05 + rnd(-0.1, 0.12) + (i === 3 ? 0.12 : 0), 0, 0.85);
    return makeFighter(i === 0 ? Math.max(0, L - 0.15) : L, i === 0 ? rnd(0.55, 0.95) : rnd(0.1, 0.8));
  });
  c.marketAt = c.day;
}

/** Days between new faces on the market. */
export const MARKET_DAYS = 5;

export function buy(c: Career, f: CareerFighter): string | null {
  if (c.roster.length >= MAX_ROSTER) return `В команде максимум ${MAX_ROSTER} бойца`;
  const price = value(f);
  if (c.money < price) return 'Не хватает денег';
  c.money -= price;
  c.market = c.market.filter((x) => x !== f);
  c.roster.push(f);
  c.pick = f.id;
  c.log.unshift(`Подписан ${f.name} за $${price}`);
  save(c);
  return null;
}

export function sell(c: Career, f: CareerFighter): string | null {
  if (c.roster.length <= 1) return 'Нельзя остаться без бойцов';
  if (c.tour?.fighter === f.id) return 'Боец на турнире';
  const price = Math.round(value(f) * 0.6);
  c.money += price;
  c.roster = c.roster.filter((x) => x !== f);
  if (c.pick === f.id) c.pick = c.roster[0].id;
  // His bookings go with him.
  for (const e of c.events) if (e.f === f.id && !e.done) {
    e.f = undefined;
    e.opp = undefined;
  }
  c.log.unshift(`Контракт ${f.name} продан за $${price}`);
  save(c);
  return null;
}

// ---------- Fights ----------

export function opponent(t: Tier, cls?: WClass): CareerFighter {
  const f = makeFighter(rnd(t.level[0], t.level[1]), rnd(0.2, 0.8), cls);
  f.record = { w: Math.floor(rnd(0, 6 + t.fame / 4)), l: Math.floor(rnd(0, 5)), ko: 0 };
  f.record.ko = Math.floor(f.record.w * rnd(0.2, 0.7));
  return f;
}

export interface FightResult {
  won: boolean;
  ko: boolean;
  reason: string;
  /** Condition after the fight, for the doctor. */
  trauma: number;
  body: number;
  broken: number;
  seconds: number;
}

/** Days he is out after a fight, besides the fight day itself. */
function recovery(r: FightResult): number {
  return Math.round((12 * r.trauma + 5 * r.body + 10 * r.broken + (!r.won && r.ko ? 3 : 0)) / 5);
}

/** After the fight: money, name, experience, the doctor. Returns lines for the screen. */
export function afterFight(c: Career, f: CareerFighter, t: Tier, opp: CareerFighter, r: FightResult, tour: boolean, title = false): string[] {
  const out: string[] = [];
  const grudge = relOf(c, f, opp) <= -50;
  const purseK = (grudge ? 1.5 : 1) * (title ? 1 : 1);
  if (r.won) {
    f.record.w++;
    if (r.ko) f.record.ko++;
    const fame = Math.max(1, Math.round((1 + (r.ko ? 1 : 0)) * (1 + rating(opp) / 30) * (grudge ? 2 : 1) * (title ? 3 : 1)));
    f.fame += fame;
    out.push(`Победа над ${opp.name}${r.ko ? ' досрочно' : ''}. Известность +${fame}`);
    if (title) {
      c.money += TITLE_PURSE[0];
      c.tokens += 10;
      out.push(`Титульный гонорар $${TITLE_PURSE[0]}, жетонов +10`);
    } else if (!tour) {
      const purse = Math.round(t.purse[0] * purseK);
      c.money += purse;
      c.tokens += 2;
      out.push(`Гонорар $${purse}${grudge ? ' (бой с заклятым врагом)' : ''}, жетонов +2`);
    }
  } else {
    f.record.l++;
    f.fame = Math.max(0, f.fame - 1);
    out.push(`Поражение от ${opp.name} (${r.reason})`);
    if (title) {
      c.money += TITLE_PURSE[1];
      out.push(`За титульный бой $${TITLE_PURSE[1]}`);
    } else if (!tour) {
      const purse = Math.round(t.purse[1] * purseK);
      c.money += purse;
      out.push(`За выход $${purse}`);
    }
  }
  // A fight teaches more than a week in the gym, a little.
  const learn = (k: StatKey, x: number) => {
    const room = Math.max(0, f.caps[k] - f.stats[k]);
    f.stats[k] = Math.min(f.caps[k], f.stats[k] + Math.min(room, x * (0.3 + room)));
  };
  moodAfterFight(f, r.won, r.ko);
  if (!title) out.push(...storyAfterFight(c, f, r.won));
  learn('skill', 0.012);
  learn('mindSpeed', 0.004);
  out.push(...recordBout(c, r.won ? f : opp, r.won ? opp : f, r.ko, title));
  const days = recovery(r);
  f.busyFrom = c.day;
  f.busyUntil = c.day + 1 + days;
  f.busyWhat = r.broken ? 'лечит перелом' : 'восстанавливается после боя';
  out.push(days ? `Восстановление: ${days} дн., в строю с ${dayName(f.busyUntil)}` : 'Цел, завтра снова в строю');
  c.log.unshift(...out.map((s) => `${short(f)}: ${s}`));
  c.log.length = Math.min(c.log.length, 30);
  save(c);
  return out;
}

/** Tournament day: the bracket is drawn (the fee was paid when he signed up). */
export function startTour(c: Career, f: CareerFighter, e: Ev): string | null {
  if (c.tour) return 'Уже идёт турнир';
  if (e.day !== c.day || e.f !== f.id) return 'Турнир не сегодня';
  if (busy(c, f)) return `${short(f)} не готов к бою`;
  const t = TIER_BY_ID[e.tier];
  const field = worldField(c, t, t.size - 1, classOf(f));
  // The draw: everyone shuffled into pairs.
  const ids = [f.id, ...field.map((x) => x.id)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const first: Match[] = [];
  for (let i = 0; i < ids.length; i += 2) first.push({ a: ids[i], b: ids[i + 1], w: null });
  c.tour = { tier: t.id, fighter: f.id, field, rounds: [first], ev: e.id };
  c.log.unshift(`${short(f)} на турнире «${t.name}», ${t.size} бойцов`);
  save(c);
  return null;
}

/** Odds between two fighters we do not watch. */
export function odds(a: CareerFighter, b: CareerFighter): number {
  return 1 / (1 + Math.exp(-(rating(a) - rating(b)) / 7));
}

/** Name of a round by how many fights are in it. */
export const roundName = (fights: number) =>
  fights === 1 ? 'финал' : fights === 2 ? 'полуфинал' : fights === 4 ? 'четвертьфинал' : `1/${fights} финала`;

export function person(c: Career, id: string): CareerFighter {
  return c.roster.find((x) => x.id === id) ?? c.world?.find((x) => x.id === id) ?? c.tour!.field.find((x) => x.id === id)!;
}

export const current = (t: Tour) => t.rounds[t.rounds.length - 1];

/** Our man's fight in this round, if he is still in. */
export function myMatch(t: Tour): Match | null {
  return current(t).find((m) => m.a === t.fighter || m.b === t.fighter) ?? null;
}

/** A fight between two others: watched (winner given) or decided by the odds. */
export function settle(c: Career, m: Match, winner?: string): void {
  if (m.w) return;
  m.w = winner ?? (Math.random() < odds(person(c, m.a), person(c, m.b)) ? m.a : m.b);
  recordBout(c, person(c, m.w), person(c, m.w === m.a ? m.b : m.a), Math.random() < 0.4);
  advance(c);
  save(c);
}

/** All fights of the round decided: the winners are paired for the next one. */
function advance(c: Career): void {
  const t = c.tour!;
  const round = current(t);
  if (round.some((m) => !m.w) || round.length === 1) return;
  const next: Match[] = [];
  for (let i = 0; i < round.length; i += 2) next.push({ a: round[i].w!, b: round[i + 1].w!, w: null });
  t.rounds.push(next);
}

/** The tournament is over: the final is decided. */
export const finished = (t: Tour) => current(t).length === 1 && !!current(t)[0].w;

/** Settle every fight of the round except ours (watch only your own). */
export function settleOthers(c: Career): void {
  const t = c.tour!;
  for (const m of [...current(t)]) if (m.a !== t.fighter && m.b !== t.fighter) settle(c, m);
}

/** Our man's fight in the bracket is over. A loss knocks him out; the rest plays out. */
export function tourFight(c: Career, f: CareerFighter, r: FightResult): string[] {
  const tour = c.tour!;
  const t = TIER_BY_ID[tour.tier];
  const m = myMatch(tour)!;
  const name = roundName(current(tour).length);
  const opp = person(c, m.a === f.id ? m.b : m.a);
  const out = [`${name}: ` + afterFight(c, f, t, opp, r, true).join('. ')];
  m.w = r.won ? f.id : opp.id;
  advance(c);
  if (!r.won) {
    out.push(`Вылет: ${name}. Остальные бои можно досмотреть или пропустить.`);
  } else if (finished(tour)) {
    c.money += t.prize;
    c.tokens += t.tokens;
    f.fame += 4 + Math.round(t.fame / 6);
    out.push(`ЧЕМПИОН турнира «${t.name}»! Приз $${t.prize}, жетонов +${t.tokens}`);
  } else {
    // Between rounds of a tournament night there is no time to heal properly, only a short rest.
    f.busyUntil = c.day;
    f.busyWhat = '';
    out.push('Прошёл дальше. Остальные бои раунда — в турнирной сетке: смотри или пропускай.');
  }
  c.log.unshift(...out.slice(1));
  save(c);
  return out;
}

/** Closes a finished tournament (or one our man is out of) after the bracket is played out. */
export function closeTour(c: Career): string {
  const t = c.tour!;
  while (!finished(t)) for (const m of [...current(t)]) settle(c, m);
  const champ = person(c, current(t)[0].w!);
  c.tour = null;
  const e = t.ev !== undefined ? evById(c, t.ev) : null;
  if (e) e.done = true;
  const line = `Турнир «${TIER_BY_ID[t.tier].name}» выиграл ${champ.name}`;
  c.log.unshift(line);
  save(c);
  return line;
}

// ---------- The world: rankings, the belt, feelings ----------

/** Fighters in each weight class of the world. */
const PER_CLASS = 24;
export const TITLE_PURSE: [number, number] = [15000, 3000];

const eloOf = (f: CareerFighter) => 900 + 12 * rating(f);

/** Which league a fighter of this rating belongs in. */
export function tierOf(f: CareerFighter): Tier {
  const r = rating(f);
  return r < 26 ? TIERS[0] : r < 34 ? TIERS[1] : r < 45 ? TIERS[2] : r < 57 ? TIERS[3] : r < 70 ? TIERS[4] : TIERS[5];
}

function makeWorld(): CareerFighter[] {
  const taken = new Set<string>();
  const out: CareerFighter[] = [];
  for (const cls of WCLASSES) for (let i = 0; i < PER_CLASS; i++) out.push(worldMan(taken, cls, Math.pow(i / (PER_CLASS - 1), 0.85)));
  return out;
}

/** One man of the world: his level, record and ranking points fitting where he stands. */
function worldMan(taken: Set<string>, cls: WClass, L: number): CareerFighter {
  {
    let f = makeFighter(L, clamp(L + rnd(-0.1, 0.25), 0, 1), cls);
    // Everyone in the world has his own name.
    for (let k = 0; k < 20 && taken.has(short(f)); k++) f = makeFighter(L, clamp(L + rnd(-0.1, 0.25), 0, 1), cls);
    taken.add(short(f));
    f.elo = eloOf(f) + rnd(-30, 30);
    const fights = Math.round(2 + 25 * L + rnd(0, 6));
    const w = Math.round(fights * clamp(0.45 + 0.35 * L + rnd(-0.15, 0.15), 0.2, 0.95));
    f.record = { w, l: fights - w, ko: Math.round(w * rnd(0.2, 0.7)) };
    return f;
  }
}

/** Builds the world for a new career, or for a save from before it existed. */
export function ensureWorld(c: Career): void {
  if (!c.world) {
    c.world = makeWorld();
    c.rel = {};
    c.news = ['В мире бойцов новый менеджер. Тебя пока никто не знает.'];
    c.worldAt = Date.now();
    c.nights = 0;
  }
  c.rel ??= {};
  c.news ??= [];
  for (const f of c.roster) f.elo ??= eloOf(f);
  // Weight classes (also for saves from before them): every class full enough, with a belt.
  if (!c.belts) {
    const taken = new Set(c.world.map(short));
    for (const cls of WCLASSES) {
      const have = c.world.filter((x) => classOf(x) === cls).length;
      for (let i = have; i < PER_CLASS; i++) c.world.push(worldMan(taken, cls, Math.pow(Math.random(), 0.85)));
    }
    c.belts = {};
    const old = c.champion ? everyone(c).find((x) => x.id === c.champion) : null;
    for (const cls of WCLASSES) {
      const best = c.world.filter((x) => classOf(x) === cls).sort((a, b) => b.elo! - a.elo!)[0];
      c.belts[cls.id] = old && classOf(old) === cls ? old.id : best.id;
    }
    c.champion = null;
  }
}

/** Is he the champion of his weight class? */
export const isChamp = (c: Career, f: CareerFighter) => c.belts?.[classOf(f).id] === f.id;
/** The champion of a class, if any. */
export const champOf = (c: Career, cls: WClass): CareerFighter | null => {
  const id = c.belts?.[cls.id];
  return id ? everyone(c).find((x) => x.id === id) ?? null : null;
};
const holdsBelt = (c: Career, f: CareerFighter) => Object.values(c.belts ?? {}).includes(f.id);

export const everyone = (c: Career) => [...c.roster, ...(c.world ?? [])];

/** Everyone of a weight class by ranking points; the champion is listed first. */
export function rankings(c: Career, cls: WClass): CareerFighter[] {
  const all = everyone(c).filter((x) => classOf(x) === cls).sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  const champ = all.find((x) => x.id === c.belts?.[cls.id]);
  return champ ? [champ, ...all.filter((x) => x !== champ)] : all;
}

/** Place in his class's rankings: 0 for the champion, then 1, 2, ... */
export function rankOf(c: Career, f: CareerFighter): number {
  const cls = classOf(f);
  return rankings(c, cls).indexOf(f) + (c.belts?.[cls.id] ? 0 : 1);
}

const relKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const relOf = (c: Career, a: CareerFighter, b: CareerFighter) => c.rel?.[relKey(a.id, b.id)] ?? 0;

export function addRel(c: Career, a: CareerFighter, b: CareerFighter, d: number): number {
  const k = relKey(a.id, b.id);
  const before = c.rel![k] ?? 0;
  c.rel![k] = Math.round(clamp(before + d, -100, 100));
  return before;
}

export function relWord(v: number): string {
  return v <= -50 ? 'заклятые враги' : v <= -20 ? 'неприязнь' : v >= 40 ? 'уважают друг друга' : '';
}

/** His sworn enemies. */
export function rivalsOf(c: Career, f: CareerFighter): CareerFighter[] {
  return everyone(c).filter((x) => x !== f && relOf(c, f, x) <= -50);
}

function news(c: Career, s: string): void {
  c.news!.unshift(s);
  c.news!.length = Math.min(c.news!.length, 40);
}

const TRASH = [
  (a: string, b: string) => `${a}: «${b} бегает от меня уже год»`,
  (a: string, b: string) => `${a} и ${b} толкались на взвешивании`,
  (a: string, b: string) => `${a}: «${b} — бумажный боец, я его сломаю»`,
  (a: string, b: string) => `${a} в интервью: «${b}? Не знаю такого»`,
  (a: string, b: string) => `${a} и ${b} подрались в ресторане, растащила охрана`,
];

/** A bout's outcome for the world: ranking points, records of world fighters, feelings, the belt. */
export function recordBout(c: Career, w: CareerFighter, l: CareerFighter, ko: boolean, title = false): string[] {
  ensureWorld(c);
  const out: string[] = [];
  w.elo ??= eloOf(w);
  l.elo ??= eloOf(l);
  const expect = 1 / (1 + 10 ** ((l.elo - w.elo) / 400));
  const k = title ? 60 : 40;
  w.elo += k * (1 - expect);
  l.elo -= k * (1 - expect);
  if (!c.roster.includes(w)) {
    w.record.w++;
    if (ko) w.record.ko++;
  }
  if (!c.roster.includes(l)) l.record.l++;
  // A knockout leaves bad blood; a hard, close fight can end in respect.
  const before = addRel(c, w, l, ko ? -rnd(15, 35) : rnd(-15, 20));
  const now = relOf(c, w, l);
  if (before > -50 && now <= -50) {
    const line = `${short(w)} и ${short(l)} теперь заклятые враги`;
    news(c, line);
    out.push(line);
  }
  const cls = classOf(w);
  if (title && c.belts?.[cls.id] === l.id) {
    c.belts[cls.id] = w.id;
    const line = `НОВЫЙ ЧЕМПИОН (${cls.name.toLowerCase()}): ${w.name}${ko ? ' нокаутом' : ' решением судей'}`;
    news(c, line);
    out.push(line);
  } else if (title && c.belts?.[cls.id] === w.id) {
    const line = `Защита пояса (${cls.name.toLowerCase()}): ${short(w)} — ${short(l)}, пояс остаётся у чемпиона`;
    news(c, line);
    out.push(line);
  }
  return out;
}

/** Fighters of the world who belong in this league and weight class, to fight ours. */
function worldField(c: Career, t: Tier, n: number, cls: WClass): CareerFighter[] {
  ensureWorld(c);
  const busyIds = new Set(c.tour ? c.tour.field.map((x) => x.id) : []);
  const pool = c.world!.filter((x) => tierOf(x) === t && classOf(x) === cls && !holdsBelt(c, x) && !busyIds.has(x.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, n);
  // Not enough men in this league: new faces come in.
  while (out.length < n) {
    const f = opponent(t, cls);
    f.elo = eloOf(f);
    c.world!.push(f);
    out.push(f);
  }
  return out;
}

/** An opponent from the world for a single fight in this league: someone near his level. */
export function worldOpponent(c: Career, t: Tier, f: CareerFighter): CareerFighter {
  const pool = worldField(c, t, 6, classOf(f));
  pool.sort((a, b) => Math.abs((a.elo ?? 0) - (f.elo ?? 0)) - Math.abs((b.elo ?? 0) - (f.elo ?? 0)));
  return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
}

/** Who the title is fought against now: the champion, or (ours holding it) the best contender. */
export function titleBout(c: Career, f: CareerFighter): CareerFighter | null {
  ensureWorld(c);
  const cls = classOf(f);
  if (isChamp(c, f)) return rankings(c, cls).find((x) => x.id !== f.id && !c.roster.includes(x)) ?? null;
  const champ = champOf(c, cls);
  if (!champ || c.roster.includes(champ)) return null;
  // Only the top three contenders get a shot.
  return rankOf(c, f) <= 3 ? champ : null;
}

/** The world's side of a day: bouts, the title fight and tournaments ours were not in, bad blood, growth. */
function worldDay(c: Career, day: number): string[] {
  ensureWorld(c);
  const out: string[] = [];
  const inTour = new Set(c.tour ? c.tour.field.map((x) => x.id) : []);
  // Bouts between men of about the same standing, in the same weight class.
  for (let k = 0; k < 6; k++) {
    const cls = WCLASSES[k % WCLASSES.length];
    const npcs = c.world!.filter((x) => classOf(x) === cls && !inTour.has(x.id) && !holdsBelt(c, x)).sort((a, b) => b.elo! - a.elo!);
    if (npcs.length < 2) continue;
    const i = Math.floor(Math.random() * (npcs.length - 1));
    const a = npcs[i];
    const b = npcs[i + 1];
    const aWins = Math.random() < odds(a, b);
    const ko = Math.random() < 0.4;
    out.push(...recordBout(c, aWins ? a : b, aWins ? b : a, ko));
    if (k < 1) news(c, `Бой: ${short(a)} — ${short(b)}, победил ${short(aWins ? a : b)}${ko ? ' нокаутом' : ''}`);
  }
  for (const e of eventsOn(c, day)) {
    // The title night: in every class the champion defends, except where ours fought for it.
    if (e.kind === 'title') {
      const oursCls = e.f && e.done ? classOf(person(c, e.f)) : null;
      for (const cls of WCLASSES) {
        if (cls === oursCls) continue;
        const champ = champOf(c, cls);
        if (!champ || c.roster.includes(champ)) continue;
        const contender = rankings(c, cls).find((x) => x !== champ && !c.roster.includes(x) && !inTour.has(x.id));
        if (contender) {
          const cWins = Math.random() < odds(contender, champ);
          out.push(...recordBout(c, cWins ? contender : champ, cWins ? champ : contender, Math.random() < 0.45, true));
        }
      }
    }
    if (e.kind === 'tour' && !(e.f && e.done)) npcTour(c, TIER_BY_ID[e.tier], pickOf(WCLASSES));
  }
  // Bad blood: someone calls someone out, now and then one of yours.
  const all = everyone(c);
  const a = pickOf(all.filter((x) => !c.roster.includes(x)));
  const near = all.filter((x) => x !== a && Math.abs((x.elo ?? 0) - (a.elo ?? 0)) < 120);
  if (near.length && Math.random() < 0.8) {
    const mine = near.filter((x) => c.roster.includes(x));
    const b = mine.length && Math.random() < 0.35 ? pickOf(mine) : pickOf(near);
    addRel(c, a, b, -(c.roster.includes(b) ? rnd(30, 55) : rnd(20, 40)));
    const line = pickOf(TRASH)(short(a), short(b));
    news(c, line);
    if (c.roster.includes(b)) out.push(line);
    if (relOf(c, a, b) <= -50) news(c, `${short(a)} и ${short(b)} теперь заклятые враги`);
  }
  // The world trains too: everyone creeps toward his ceiling.
  for (const f of c.world!) for (const k of STAT_KEYS) f.stats[k] += (f.caps[k] - f.stats[k]) * 0.01;
  return out;
}

/** A league's tournament without ours: played out by the odds, the winner in the news. */
function npcTour(c: Career, t: Tier, cls: WClass): void {
  const inTour = new Set(c.tour ? c.tour.field.map((x) => x.id) : []);
  let pool = c.world!.filter((x) => tierOf(x) === t && classOf(x) === cls && !holdsBelt(c, x) && !inTour.has(x.id));
  const n = pool.length >= 8 ? 8 : pool.length >= 4 ? 4 : 0;
  if (!n) return;
  pool = pool.sort(() => Math.random() - 0.5).slice(0, n);
  while (pool.length > 1) {
    const next: CareerFighter[] = [];
    for (let i = 0; i < pool.length; i += 2) {
      const [a, b] = [pool[i], pool[i + 1]];
      const aWins = Math.random() < odds(a, b);
      recordBout(c, aWins ? a : b, aWins ? b : a, Math.random() < 0.4);
      next.push(aWins ? a : b);
    }
    pool = next;
  }
  news(c, `Турнир «${t.name}» (${cls.name.toLowerCase()}) выиграл ${short(pool[0])}`);
}

// ---------- Save ----------

export function newCareer(): Career {
  const first = makeFighter(0.02, rnd(0.45, 0.85));
  const c: Career = {
    money: 300, tokens: 100, roster: [first], market: [], marketAt: 1, tour: null, log: ['Карьера началась. У тебя один боец и немного денег.'], pick: first.id,
    day: 1, dayAt: Date.now(), events: [], planned: 0, nextEv: 1,
  };
  c.gifts = ['tokens100'];
  ensureWorld(c);
  ensureLife(c);
  plan(c);
  refreshMarket(c);
  return c;
}

export function load(): Career | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    // A gift for saves made before the start went up to 100 tokens.
    c.gifts ??= [];
    ensureWorld(c);
    ensureLife(c);
    // Single drilled strikes from before hands/legs: the best of each kind carries over.
    for (const f of c.roster) {
      if (!f.drills) continue;
      const best = (k: Craft) => Math.max(0, ...CRAFT_TIERS[k].flat().map((id) => f.drills![id] ?? 0));
      f.craft = { hands: best('hands'), legs: best('legs') };
      delete f.drills;
      for (const q of f.queue ?? []) if (q.move && q.move !== 'hands' && q.move !== 'legs') q.move = CRAFT_TIERS.legs.flat().includes(q.move) ? 'legs' : 'hands';
      if (f.session?.move && f.session.move !== 'hands' && f.session.move !== 'legs') f.session.move = CRAFT_TIERS.legs.flat().includes(f.session.move) ? 'legs' : 'hands';
    }
    // A tournament from before the brackets: give the fee back.
    if (c.tour && !(c.tour as Partial<Tour>).rounds) {
      c.money += TIER_BY_ID[c.tour.tier]?.fee ?? 0;
      c.tour = null;
      c.log.unshift('Старый турнир отменён, взнос возвращён');
    }
    // A save from before the calendar: today is day 1, real-time waits are over.
    if (!c.day) {
      c.day = 1;
      c.dayAt = Date.now();
      c.events = [];
      c.planned = 0;
      c.nextEv = 1;
      c.marketAt = 1;
      for (const f of c.roster) {
        f.busyFrom = 1;
        f.busyUntil = f.session ? 2 : 0;
        if (!f.session) f.busyWhat = '';
      }
      plan(c);
      if (c.tour) {
        const e = c.events.find((x) => x.day === 1 && x.kind === 'tour') ?? { id: c.nextEv++, day: 1, kind: 'tour' as const, tier: c.tour.tier };
        if (!c.events.includes(e)) c.events.push(e);
        e.tier = c.tour.tier;
        e.f = c.tour.fighter;
        c.tour.ev = e.id;
      }
      c.log.unshift('Карьера теперь идёт по календарю');
    }
    if (!c.gifts.includes('tokens100')) {
      c.gifts.push('tokens100');
      c.tokens += 100;
      c.log.unshift('Подарок: +100 жетонов');
    }
    return c;
  } catch {
    return null;
  }
}

/** Called after every save (main.ts hooks the cloud copy here). */
export const saveHook: { after: (() => void) | null } = { after: null };

export function save(c: Career): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
  saveHook.after?.();
}

export function reset(): Career {
  const c = newCareer();
  save(c);
  return c;
}

export const moveName = (id: string) => MOVES.find((m) => m.id === id)?.name ?? id;

export const short = (f: CareerFighter) => f.name.replace(/^(\S+) «(.+)» (\S+)$/, '$1 $3');
