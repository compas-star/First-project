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
}

const KEY = 'arena-career-v1';
export const MAX_ROSTER = 4;

// ---------- People ----------

const FIRST = ['Игорь', 'Артём', 'Дима', 'Саша', 'Руслан', 'Тимур', 'Миша', 'Гоша', 'Костя', 'Олег', 'Вадим', 'Стас', 'Рома', 'Женя', 'Леха', 'Марат', 'Самир', 'Паша', 'Ярик', 'Федя', 'Гена', 'Влад', 'Ильдар', 'Борис'];
const LAST = ['Ветров', 'Крюков', 'Шаталов', 'Гром', 'Бурков', 'Соколов', 'Рябов', 'Лисин', 'Каримов', 'Зуев', 'Медведев', 'Орлов', 'Ткач', 'Седых', 'Ковалёв', 'Мамаев', 'Чернов', 'Воронин', 'Хан', 'Дубов'];
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

export function toParams(f: CareerFighter, team: 0 | 1): FighterParams {
  return {
    name: f.name.replace(/^(\S+) «(.+)» (\S+)$/, '$2'),
    color: team === 0 ? RED : BLUE,
    height: f.height,
    weight: f.weight,
    strength: f.stats.strength,
    bodySpeed: f.stats.bodySpeed,
    mindSpeed: f.stats.mindSpeed,
    linkMind: false,
    aggression: f.aggression,
    skill: f.stats.skill,
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
export function afterFight(c: Career, f: CareerFighter, t: Tier, opp: CareerFighter, r: FightResult, tour: boolean): string[] {
  const out: string[] = [];
  if (r.won) {
    f.record.w++;
    if (r.ko) f.record.ko++;
    const fame = Math.max(1, Math.round((1 + (r.ko ? 1 : 0)) * (1 + rating(opp) / 30)));
    f.fame += fame;
    out.push(`Победа над ${opp.name}${r.ko ? ' досрочно' : ''}. Известность +${fame}`);
    if (!tour) {
      c.money += t.purse[0];
      c.tokens += 2;
      out.push(`Гонорар $${t.purse[0]}, жетонов +2`);
    }
  } else {
    f.record.l++;
    f.fame = Math.max(0, f.fame - 1);
    out.push(`Поражение от ${opp.name} (${r.reason})`);
    if (!tour) {
      c.money += t.purse[1];
      out.push(`За выход $${t.purse[1]}`);
    }
  }
  // A fight teaches more than a week in the gym, a little.
  const learn = (k: StatKey, x: number) => {
    const room = Math.max(0, f.caps[k] - f.stats[k]);
    f.stats[k] = Math.min(f.caps[k], f.stats[k] + Math.min(room, x * (0.3 + room)));
  };
  learn('skill', 0.012);
  learn('mindSpeed', 0.004);
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
  const field = Array.from({ length: t.size - 1 }, () => opponent(t));
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
  return c.roster.find((x) => x.id === id) ?? c.tour!.field.find((x) => x.id === id)!;
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
  // The winner's record grows; the loser's too.
  const w = person(c, m.w);
  const l = person(c, m.w === m.a ? m.b : m.a);
  if (!c.roster.includes(w)) w.record.w++;
  if (!c.roster.includes(l)) l.record.l++;
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
  opp.record[r.won ? 'l' : 'w']++;
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

// ---------- Save ----------

export function newCareer(): Career {
  const first = makeFighter(0.02, rnd(0.45, 0.85));
  const c: Career = { money: 300, tokens: 100, roster: [first], market: [], marketAt: 0, tour: null, log: ['Карьера началась. У тебя один боец и немного денег.'], pick: first.id };
  c.gifts = ['tokens100'];
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
