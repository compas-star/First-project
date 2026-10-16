// Manager mode: you own fighters, train them (slowly, in real time), buy new ones and
// enter them in fights and tournaments, from basement brawls to a world title.
// Pure state and rules here; the screen is in careerUi.ts. Stand-up fighting only.
import { RED, BLUE, type FighterParams } from './config';
import type { DisciplineId } from './disciplines';
import type { MapId } from './maps';
import type { Rules } from './sim';

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
  session?: { stat: StatKey; gain: number; injury: number };
  /** Ranking points (Elo): wins over better men raise them more. */
  elo?: number;
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
  { id: 'basement', name: 'Подвал', desc: 'Подпольные бои в подворотне. Три коротких раунда, судит толпа, деньги наличкой.', map: 'alley', rules: { roundLen: 90, rounds: 3, tough: 1, standing: true }, level: [0, 0.12], fame: 0, purse: [70, 15], fee: 40, prize: 400, tokens: 3, size: 8 },
  { id: 'roof', name: 'Крыши', desc: 'Бои на крышах для богатых зевак. Три раунда по две минуты, соперники злее.', map: 'roof', rules: { roundLen: 120, rounds: 3, tough: 1.2, standing: true }, level: [0.12, 0.28], fame: 6, purse: [150, 35], fee: 90, prize: 900, tokens: 4, size: 8 },
  { id: 'club', name: 'Клубная лига', desc: 'Додзё и залы. Три раунда по две минуты, судьи.', map: 'dojo', rules: { roundLen: 120, rounds: 3, tough: 1.6, standing: true }, level: [0.28, 0.45], fame: 18, purse: [320, 80], fee: 200, prize: 2200, tokens: 5, size: 16 },
  { id: 'city', name: 'Городской ринг', desc: 'Настоящий ринг и зрители. Три раунда по три минуты.', map: 'ring', rules: { roundLen: 180, rounds: 3, tough: 2, standing: true }, level: [0.45, 0.63], fame: 40, purse: [700, 170], fee: 450, prize: 5200, tokens: 7, size: 16 },
  { id: 'nation', name: 'Чемпионат страны', desc: 'Лучшие бойцы страны в клетке. Пять раундов по три минуты.', map: 'cage', rules: { roundLen: 180, rounds: 5, tough: 2.4, standing: true }, level: [0.63, 0.82], fame: 80, purse: [1600, 400], fee: 1000, prize: 12000, tokens: 10, size: 16 },
  { id: 'world', name: 'Мировой титул', desc: 'Лучшие из лучших. Пять раундов по три минуты, пояс.', map: 'ring', rules: { roundLen: 180, rounds: 5, tough: 2.6, standing: true }, level: [0.82, 1], fame: 140, purse: [4000, 900], fee: 2500, prize: 32000, tokens: 16, size: 16 },
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
  /** Holder of the belt (any fighter's id). */
  champion?: string | null;
  /** Feelings between two fighters, -100 (sworn enemies) .. 100, by pair key. */
  rel?: Record<string, number>;
  /** What happened in the fight world, newest first. */
  news?: string[];
  /** When the world last had a fight night. */
  worldAt?: number;
  nights?: number;
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
export function makeFighter(level: number, talent: number): CareerFighter {
  const st = pickOf(STORIES);
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
    height: Math.round(rnd(...st.height) * 100) / 100,
    weight: Math.round(rnd(...st.weight)),
    aggression: Math.round(rnd(...st.aggression) * 100) / 100,
    stats,
    caps,
    record: { w: 0, l: 0, ko: 0 },
    fame: Math.round(level * 120),
    busyUntil: 0,
    busyFrom: 0,
    busyWhat: '',
  };
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
  return {
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
}

// ---------- Training ----------

export interface Intensity {
  id: 'light' | 'normal' | 'hard';
  name: string;
  minutes: number;
  cost: number;
  k: number;
  injury: number;
}

export const INTENSITY: Intensity[] = [
  { id: 'light', name: 'Лёгкая', minutes: 2, cost: 10, k: 0.35, injury: 0 },
  { id: 'normal', name: 'Обычная', minutes: 6, cost: 30, k: 1, injury: 0.02 },
  { id: 'hard', name: 'Тяжёлая', minutes: 15, cost: 75, k: 2.3, injury: 0.1 },
];

/** What a session would add: small, and less the closer he is to his ceiling. */
export function gainOf(f: CareerFighter, k: StatKey, it: Intensity): number {
  const info = STAT_INFO[k];
  const room = (f.caps[k] - f.stats[k]) / Math.max(0.05, f.caps[k] - info.lo);
  return Math.max(0, info.base * it.k * Math.min(1, 0.15 + 1.6 * room) * (room > 0 ? 1 : 0));
}

export const busy = (f: CareerFighter, now = Date.now()) => f.busyUntil > now;

export function startTraining(c: Career, f: CareerFighter, k: StatKey, it: Intensity): string | null {
  if (busy(f)) return 'Боец занят';
  if (c.tour?.fighter === f.id) return 'Боец на турнире';
  if (c.money < it.cost) return 'Не хватает денег';
  c.money -= it.cost;
  const now = Date.now();
  // Real rounds of real work: a hard week can also leave him hurt.
  const hurt = Math.random() < it.injury ? 1 : 0;
  f.session = { stat: k, gain: gainOf(f, k, it) * (0.75 + 0.5 * Math.random()), injury: hurt };
  f.busyFrom = now;
  f.busyUntil = now + it.minutes * 60000;
  f.busyWhat = `${STAT_INFO[k].drill} (${it.name.toLowerCase()})`;
  save(c);
  return null;
}

/** Sessions and recoveries that have run out: apply them. Returns what happened. */
export function tick(c: Career, now = Date.now()): string[] {
  const out: string[] = [];
  for (const f of c.roster) {
    if (f.session && f.busyUntil <= now) {
      const s = f.session;
      f.session = undefined;
      const before = f.stats[s.stat];
      f.stats[s.stat] = Math.min(f.caps[s.stat], before + s.gain);
      const d = f.stats[s.stat] - before;
      const shown = s.stat === 'skill' || s.stat === 'evasion' ? `${(d * 100).toFixed(1)}%` : `×${d.toFixed(3)}`;
      out.push(`${short(f)}: ${STAT_INFO[s.stat].name} +${shown}${d < 1e-4 ? ' — упёрся в потолок' : ''}`);
      if (s.injury) {
        f.busyFrom = now;
        f.busyUntil = now + 10 * 60000;
        f.busyWhat = 'потянул мышцу на тренировке';
        out.push(`${short(f)} потянул мышцу: 10 минут отдыха`);
      } else f.busyWhat = '';
    } else if (!f.session && f.busyWhat && f.busyUntil <= now) {
      out.push(`${short(f)} восстановился`);
      f.busyWhat = '';
    }
  }
  if (now - c.marketAt > 20 * 60000) refreshMarket(c, now);
  out.push(...worldTick(c, now));
  if (out.length) {
    c.log.unshift(...out);
    c.log.length = Math.min(c.log.length, 30);
    save(c);
  }
  return out;
}

/** Tokens to finish what he is doing now: one per started three minutes. */
export function skipCost(f: CareerFighter, now = Date.now()): number {
  return Math.max(1, Math.ceil((f.busyUntil - now) / 180000));
}

export function skip(c: Career, f: CareerFighter): string | null {
  if (!busy(f)) return null;
  const n = skipCost(f);
  if (c.tokens < n) return 'Не хватает жетонов';
  c.tokens -= n;
  f.busyUntil = Date.now();
  tick(c);
  save(c);
  return null;
}

// ---------- Market ----------

export function refreshMarket(c: Career, now = Date.now()): void {
  const best = Math.max(0, ...c.roster.map((f) => rating(f)));
  c.market = Array.from({ length: 4 }, (_, i) => {
    // Mostly people around your level, now and then someone a step up, and a raw talent.
    const L = clamp(best / 100 - 0.05 + rnd(-0.1, 0.12) + (i === 3 ? 0.12 : 0), 0, 0.85);
    return makeFighter(i === 0 ? Math.max(0, L - 0.15) : L, i === 0 ? rnd(0.55, 0.95) : rnd(0.1, 0.8));
  });
  c.marketAt = now;
}

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
  c.log.unshift(`Контракт ${f.name} продан за $${price}`);
  save(c);
  return null;
}

// ---------- Fights ----------

export function opponent(t: Tier): CareerFighter {
  const f = makeFighter(rnd(t.level[0], t.level[1]), rnd(0.2, 0.8));
  f.record = { w: Math.floor(rnd(0, 6 + t.fame / 4)), l: Math.floor(rnd(0, 5)), ko: 0 };
  f.record.ko = Math.floor(f.record.w * rnd(0.2, 0.7));
  return f;
}

export function canEnter(c: Career, f: CareerFighter, t: Tier): string | null {
  if (busy(f)) return f.session ? 'Боец на тренировке' : 'Боец восстанавливается';
  if (c.tour && c.tour.fighter !== f.id) return 'Идёт турнир другого бойца';
  if (f.fame < t.fame) return `Нужна известность ${t.fame}`;
  return null;
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

/** How long he is out after a fight, minutes. */
function recovery(r: FightResult): number {
  return Math.round(2 + 12 * r.trauma + 5 * r.body + 10 * r.broken + (!r.won && r.ko ? 3 : 0));
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
  learn('skill', 0.012);
  learn('mindSpeed', 0.004);
  out.push(...recordBout(c, r.won ? f : opp, r.won ? opp : f, r.ko, title));
  const mins = recovery(r);
  f.busyFrom = Date.now();
  f.busyUntil = Date.now() + mins * 60000;
  f.busyWhat = r.broken ? 'лечит перелом' : 'восстанавливается после боя';
  out.push(`Восстановление: ${mins} мин`);
  c.log.unshift(...out.map((s) => `${short(f)}: ${s}`));
  c.log.length = Math.min(c.log.length, 30);
  save(c);
  return out;
}

/** Signs him up: the fee, and the bracket drawn. */
export function enterTour(c: Career, f: CareerFighter, t: Tier): string | null {
  const why = canEnter(c, f, t);
  if (why) return why;
  if (c.tour) return 'Уже идёт турнир';
  if (c.money < t.fee) return 'Не хватает на взнос';
  c.money -= t.fee;
  const field = worldField(c, t, t.size - 1);
  // The draw: everyone shuffled into pairs.
  const ids = [f.id, ...field.map((x) => x.id)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const first: Match[] = [];
  for (let i = 0; i < ids.length; i += 2) first.push({ a: ids[i], b: ids[i + 1], w: null });
  c.tour = { tier: t.id, fighter: f.id, field, rounds: [first] };
  c.log.unshift(`${short(f)} заявлен на турнир «${t.name}» на ${t.size} человек ($${t.fee})`);
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
    f.busyUntil = Date.now();
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
  const line = `Турнир «${TIER_BY_ID[t.tier].name}» выиграл ${champ.name}`;
  c.log.unshift(line);
  save(c);
  return line;
}

// ---------- The world: rankings, the belt, feelings ----------

const WORLD_SIZE = 60;
/** Real time between the world's fight nights. */
export const NIGHT_MS = 4 * 60000;
export const TITLE_PURSE: [number, number] = [15000, 3000];

const eloOf = (f: CareerFighter) => 900 + 12 * rating(f);

/** Which league a fighter of this rating belongs in. */
export function tierOf(f: CareerFighter): Tier {
  const r = rating(f);
  return r < 26 ? TIERS[0] : r < 34 ? TIERS[1] : r < 45 ? TIERS[2] : r < 57 ? TIERS[3] : r < 70 ? TIERS[4] : TIERS[5];
}

function makeWorld(): CareerFighter[] {
  const taken = new Set<string>();
  return Array.from({ length: WORLD_SIZE }, (_, i) => {
    const L = Math.pow(i / (WORLD_SIZE - 1), 0.85);
    let f = makeFighter(L, clamp(L + rnd(-0.1, 0.25), 0, 1));
    // Everyone in the world has his own name.
    for (let k = 0; k < 20 && taken.has(short(f)); k++) f = makeFighter(L, clamp(L + rnd(-0.1, 0.25), 0, 1));
    taken.add(short(f));
    f.elo = eloOf(f) + rnd(-30, 30);
    const fights = Math.round(2 + 25 * L + rnd(0, 6));
    const w = Math.round(fights * clamp(0.45 + 0.35 * L + rnd(-0.15, 0.15), 0.2, 0.95));
    f.record = { w, l: fights - w, ko: Math.round(w * rnd(0.2, 0.7)) };
    return f;
  });
}

/** Builds the world for a new career, or for a save from before it existed. */
export function ensureWorld(c: Career): void {
  if (!c.world) {
    c.world = makeWorld();
    c.rel = {};
    c.news = ['В мире бойцов новый менеджер. Тебя пока никто не знает.'];
    c.worldAt = Date.now();
    c.nights = 0;
    c.champion = [...c.world].sort((a, b) => b.elo! - a.elo!)[0].id;
  }
  c.rel ??= {};
  c.news ??= [];
  for (const f of c.roster) f.elo ??= eloOf(f);
}

export const everyone = (c: Career) => [...c.roster, ...(c.world ?? [])];

/** Everyone by ranking points; the champion is listed first. */
export function rankings(c: Career): CareerFighter[] {
  const all = everyone(c).sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  const champ = all.find((x) => x.id === c.champion);
  return champ ? [champ, ...all.filter((x) => x !== champ)] : all;
}

/** Place in the rankings: 0 for the champion, then 1, 2, ... */
export function rankOf(c: Career, f: CareerFighter): number {
  return rankings(c).indexOf(f) + (c.champion ? 0 : 1);
}

const relKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const relOf = (c: Career, a: CareerFighter, b: CareerFighter) => c.rel?.[relKey(a.id, b.id)] ?? 0;

function addRel(c: Career, a: CareerFighter, b: CareerFighter, d: number): number {
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
  if (title && c.champion === l.id) {
    c.champion = w.id;
    const line = `НОВЫЙ ЧЕМПИОН: ${w.name}${ko ? ' нокаутом' : ' решением судей'}`;
    news(c, line);
    out.push(line);
  } else if (title && c.champion === w.id) {
    const line = `Защита пояса: ${short(w)} — ${short(l)}, пояс остаётся у чемпиона`;
    news(c, line);
    out.push(line);
  }
  return out;
}

/** Fighters of the world who belong in this league, to fight ours. */
function worldField(c: Career, t: Tier, n: number): CareerFighter[] {
  ensureWorld(c);
  const busyIds = new Set(c.tour ? c.tour.field.map((x) => x.id) : []);
  const pool = c.world!.filter((x) => tierOf(x) === t && x.id !== c.champion && !busyIds.has(x.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, n);
  // Not enough men in this league: new faces come in.
  while (out.length < n) {
    const f = opponent(t);
    f.elo = eloOf(f);
    c.world!.push(f);
    out.push(f);
  }
  return out;
}

/** An opponent from the world for a single fight in this league: someone near his level. */
export function worldOpponent(c: Career, t: Tier, f: CareerFighter): CareerFighter {
  const pool = worldField(c, t, 6);
  pool.sort((a, b) => Math.abs((a.elo ?? 0) - (f.elo ?? 0)) - Math.abs((b.elo ?? 0) - (f.elo ?? 0)));
  return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
}

/** Who the title is fought against now: the champion, or (ours holding it) the best contender. */
export function titleBout(c: Career, f: CareerFighter): CareerFighter | null {
  ensureWorld(c);
  if (c.champion === f.id) return rankings(c).find((x) => x.id !== f.id && !c.roster.includes(x)) ?? null;
  const champ = c.champion ? person(c, c.champion) : null;
  if (!champ || c.roster.includes(champ)) return null;
  // Only the top three contenders get a shot.
  return rankOf(c, f) <= 3 ? champ : null;
}

/** The world's fight nights since last time: bouts, a title defence, bad blood, growth. */
export function worldTick(c: Career, now = Date.now()): string[] {
  ensureWorld(c);
  const out: string[] = [];
  let n = 0;
  while (now - c.worldAt! >= NIGHT_MS && n++ < 6) {
    c.worldAt! += NIGHT_MS;
    c.nights = (c.nights ?? 0) + 1;
    out.push(...fightNight(c));
  }
  if (n > 6) c.worldAt = now;
  if (out.length) save(c);
  return out;
}

function fightNight(c: Career): string[] {
  const out: string[] = [];
  const inTour = new Set(c.tour ? c.tour.field.map((x) => x.id) : []);
  const npcs = c.world!.filter((x) => !inTour.has(x.id) && x.id !== c.champion).sort((a, b) => b.elo! - a.elo!);
  // Eight bouts between men of about the same standing.
  for (let k = 0; k < 8 && npcs.length > 2; k++) {
    const i = Math.floor(Math.random() * (npcs.length - 1));
    const a = npcs[i];
    const b = npcs[i + 1];
    npcs.splice(i, 2);
    const aWins = Math.random() < odds(a, b);
    const ko = Math.random() < 0.4;
    out.push(...recordBout(c, aWins ? a : b, aWins ? b : a, ko));
    if (k < 2) news(c, `Бой: ${short(a)} — ${short(b)}, победил ${short(aWins ? a : b)}${ko ? ' нокаутом' : ''}`);
  }
  // Every third night the champion defends against the best contender of the world.
  const champ = c.champion ? person(c, c.champion) : null;
  if (champ && !c.roster.includes(champ) && (c.nights ?? 0) % 3 === 0) {
    const contender = rankings(c).find((x) => x !== champ && !c.roster.includes(x) && !inTour.has(x.id));
    if (contender) {
      const cWins = Math.random() < odds(contender, champ);
      out.push(...recordBout(c, cWins ? contender : champ, cWins ? champ : contender, Math.random() < 0.45, true));
    }
  }
  // Bad blood: someone calls someone out, now and then one of yours.
  const all = everyone(c);
  const a = pickOf(all.filter((x) => !c.roster.includes(x)));
  const near = all.filter((x) => x !== a && Math.abs((x.elo ?? 0) - (a.elo ?? 0)) < 120);
  if (near.length) {
    const mine = near.filter((x) => c.roster.includes(x));
    const b = mine.length && Math.random() < 0.35 ? pickOf(mine) : pickOf(near);
    addRel(c, a, b, -(c.roster.includes(b) ? rnd(30, 55) : rnd(20, 40)));
    const line = pickOf(TRASH)(short(a), short(b));
    news(c, line);
    if (c.roster.includes(b)) out.push(line);
    if (relOf(c, a, b) <= -50) news(c, `${short(a)} и ${short(b)} теперь заклятые враги`);
  }
  // The world trains too: everyone creeps toward his ceiling.
  for (const f of c.world!) for (const k of STAT_KEYS) f.stats[k] += (f.caps[k] - f.stats[k]) * 0.012;
  return out;
}

// ---------- Save ----------

export function newCareer(): Career {
  const first = makeFighter(0.02, rnd(0.45, 0.85));
  const c: Career = { money: 300, tokens: 100, roster: [first], market: [], marketAt: 0, tour: null, log: ['Карьера началась. У тебя один боец и немного денег.'], pick: first.id };
  c.gifts = ['tokens100'];
  ensureWorld(c);
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
    // A tournament from before the brackets: give the fee back.
    if (c.tour && !(c.tour as Partial<Tour>).rounds) {
      c.money += TIER_BY_ID[c.tour.tier]?.fee ?? 0;
      c.tour = null;
      c.log.unshift('Старый турнир отменён, взнос возвращён');
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

export function save(c: Career): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function reset(): Career {
  const c = newCareer();
  save(c);
  return c;
}

export const short = (f: CareerFighter) => f.name.replace(/^(\S+) «(.+)» (\S+)$/, '$1 $3');
