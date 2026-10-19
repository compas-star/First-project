// Clubs and the ladder (user: different clubs with their own looks; competitions open one
// by one as part of the story; a weekly tournament where you meet club men and loners,
// paid for 1st-3rd; held over two days; before the final a club may send a man to beat you
// up). Design in the doc tab «Клубы и турниры».
import {
  makeFighter, rating, odds, short, save, STAT_INFO, WCLASSES,
  type Career, type CareerFighter, type StatKey, type Tier,
} from './career';
import { addMood } from './life';
import { energyOf } from './city';
import type { SkinId } from './skins';
import type { DisciplineId } from './disciplines';

export interface Club {
  id: string;
  name: string;
  /** Ladder stage it belongs to. */
  stage: number;
  motto: string;
  desc: string;
  /** Club colours: main, accent (CSS). */
  colors: [string, string];
  skin: SkinId;
  leader: string;
  members: CareerFighter[];
}

/** What the career keeps about the ladder and this week's tournament. */
export interface Ladder {
  /** Highest open stage (1 = the basement of «Подкова»). */
  stage: number;
  /** The weekly tournament is open to us (act 1 opens it). */
  open: boolean;
  clubs: Club[];
  cup: Cup | null;
  cupWins: number;
  /** Leaders beaten by ours (club ids). */
  beaten: string[];
  /** Past results, newest first. */
  history: string[];
}

export interface CupMatch {
  a: string;
  b: string;
  w: string | null;
}

/** One weekly tournament: day 1 quarter- and semi-finals, day 2 the final and third place. */
export interface Cup {
  /** Career day of day 1 (a Saturday). */
  day: number;
  entrants: CareerFighter[];
  /** Ours, if signed up. */
  ours: string | null;
  qf: CupMatch[];
  sf: CupMatch[];
  final: CupMatch | null;
  third: CupMatch | null;
  done: boolean;
  /** A club man waiting at the door before the final. */
  ambush?: { club: string; man: CareerFighter; settled: boolean };
}

export const CUP_FEE = 30;
export const CUP_PRIZE = [300, 150, 80];
/** The cup's place: the cellar of the bar, one round of three clock minutes. */
export const CUP_TIER: Tier = {
  id: 'cup', name: 'Подвальный турнир', desc: '', map: 'bar',
  rules: { roundLen: 180, clock: 3, rounds: 1, tough: 1.2, standing: true },
  level: [0, 0.2], fame: 0, purse: [0, 0], fee: CUP_FEE, prize: CUP_PRIZE[0], tokens: 2, size: 8,
};
/** A night fight at the door. */
export const STREET_TIER: Tier = {
  id: 'street', name: 'У подъезда', desc: '', map: 'alley',
  rules: { roundLen: 0, rounds: 0, tough: 1, standing: true },
  level: [0, 0], fame: 0, purse: [0, 0], fee: 0, prize: 0, tokens: 0, size: 8,
};

const DOW = (d: number) => (d - 1) % 7;
const SAT = 5;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---------- The clubs of the basement ----------

interface Man {
  name: string;
  level: number;
  disc: DisciplineId;
  weight: number;
  height: number;
  /** Stat multipliers: who he is. */
  tilt: Partial<Record<StatKey, number>>;
  story: string;
  legs?: number;
  aggression?: number;
}

const BIKERS: Man[] = [
  { name: 'Шатун «Хозяин дороги» Громов', level: 0.25, disc: 'street', weight: 104, height: 1.88, tilt: { strength: 1.18, bodySpeed: 0.9, cardio: 0.9 }, story: 'Лидер «Железных коней». Медленный, но один его хук кладёт. Говорит мало, курит в углу.', aggression: 0.7 },
  { name: 'Глушитель «Без тормозов» Рябов', level: 0.15, disc: 'street', weight: 88, height: 1.82, tilt: { strength: 1.08, skill: 0.85 }, story: 'Правая рука Шатуна. Злой, бьёт после гонга. Его ненавидит весь подвал.', aggression: 0.95 },
  { name: 'Ржавый «Бывший» Котельников', level: 0.12, disc: 'boxing', weight: 80, height: 1.78, tilt: { skill: 1.15, evasion: 1.1, cardio: 0.82 }, story: 'Бывший боксёр, выгнали из секции за пьянку. Защита хорошая, дыхалка — нет.' },
  { name: 'Шина «Медведь» Бурков', level: 0.06, disc: 'street', weight: 125, height: 1.97, tilt: { strength: 1.2, bodySpeed: 0.85, skill: 0.8 }, story: 'Огромный и неуклюжий новичок. Сила как у медведя.' },
  { name: 'Рита «Лиса» Ветрова', level: 0.1, disc: 'kickboxing', weight: 60, height: 1.68, tilt: { bodySpeed: 1.12, evasion: 1.12, strength: 0.85 }, story: 'Единственная у байкеров, кто бьёт ногами. Быстрая, в лёгком весе.', legs: 0.4 },
];

const FACTORY: Man[] = [
  { name: 'Палыч «Мастер» Сафонов', level: 0.24, disc: 'boxing', weight: 84, height: 1.76, tilt: { skill: 1.25, mindSpeed: 1.12, bodySpeed: 0.88, cardio: 0.9 }, story: 'Лидер «Цеха №5», мастер с тракторного. Учился у того же тренера, что и Михалыч. Техника и хитрость вместо скорости.' },
  { name: 'Сварщик «Двужильный» Зуев', level: 0.13, disc: 'mma', weight: 86, height: 1.8, tilt: { cardio: 1.25, strength: 1.05 }, story: 'Ни разу не устал. Работает в две смены и тренируется в третью.' },
  { name: 'Лёха «Близнец» Котов', level: 0.1, disc: 'boxing', weight: 76, height: 1.79, tilt: { bodySpeed: 1.05 }, story: 'Один из близнецов Котовых. Пока не начнут драться — не различишь.' },
  { name: 'Серый «Близнец» Котов', level: 0.1, disc: 'kickboxing', weight: 76, height: 1.79, tilt: { bodySpeed: 1.05 }, story: 'Второй из близнецов. Этот бьёт ногами.', legs: 0.3 },
  { name: 'Малой «Пацан» Лаптев', level: 0.03, disc: 'street', weight: 66, height: 1.72, tilt: { bodySpeed: 1.08 }, story: 'Ровесник Тимохи. Смотрит на наш подвал с интересом.' },
];

function man(m: Man, skin: SkinId): CareerFighter {
  const cls = WCLASSES.find((w) => m.weight <= w.hi) ?? WCLASSES[2];
  const f = makeFighter(m.level, 0.4 + m.level, cls);
  f.name = m.name;
  f.story = m.story;
  f.discipline = m.disc;
  f.weight = m.weight;
  f.height = m.height;
  f.skin = skin;
  if (m.aggression !== undefined) f.aggression = m.aggression;
  for (const [k, v] of Object.entries(m.tilt) as [StatKey, number][]) {
    const info = STAT_INFO[k];
    f.stats[k] = clamp(f.stats[k] * v, info.lo, info.hi);
    f.caps[k] = clamp(Math.max(f.caps[k] * v, f.stats[k] + 0.02), info.lo, info.hi);
  }
  if (m.legs) f.craft = { hands: 0.2, legs: m.legs };
  return f;
}

function makeClubs(): Club[] {
  const bikers = BIKERS.map((m) => man(m, 'biker'));
  const factory = FACTORY.map((m) => man(m, 'boxer'));
  return [
    { id: 'horses', name: '«Железные кони»', stage: 1, motto: 'Кто не с нами — тот под колёсами', desc: 'Байкеры. Чёрная кожа, жилетки с конём на спине. Дерутся грязно и тяжело. Тусуются у «Подковы».', colors: ['#1a1a1e', '#ff5d3a'], skin: 'biker', leader: bikers[0].id, members: bikers },
    { id: 'shop5', name: '«Цех №5»', stage: 1, motto: 'Смена кончилась — смена началась', desc: 'Заводские с тракторного. Синие комбинезоны, номер цеха на спине. Дисциплина, выносливость, честные бои. Враждуют с байкерами.', colors: ['#2a4a8a', '#f2c14e'], skin: 'boxer', leader: factory[0].id, members: factory },
  ];
}

export function ladder(c: Career): Ladder {
  c.ladder ??= { stage: 1, open: false, clubs: makeClubs(), cup: null, cupWins: 0, beaten: [], history: [] };
  return c.ladder;
}

/** Known beyond the basement (district champion or higher): before that no sponsors, no
 * interviews, no champions calling him out (user: odd for a nobody from a basement). */
export const known = (c: Career) => ladder(c).stage >= 3;

export const clubOf = (c: Career, id: string): Club | null => ladder(c).clubs.find((k) => k.members.some((m) => m.id === id)) ?? null;
export const isLeader = (c: Career, id: string) => ladder(c).clubs.some((k) => k.leader === id);
/** Club members by strength. */
export const ranked = (k: Club) => [...k.members].sort((a, b) => rating(b) - rating(a));

/** Who stands where in the ladder's tiers of the old calendar (tier ids allowed at each stage). */
const STAGE_TIERS: Record<number, string[]> = { 1: [], 2: ['basement', 'roof'], 3: ['basement', 'roof', 'club', 'city'], 4: ['basement', 'roof', 'club', 'city', 'nation'], 5: ['basement', 'roof', 'club', 'city', 'nation', 'world'] };
export const STAGE_NAME = ['', 'Подвал', 'Район', 'Город', 'Страна', 'Мир'];

/** Why a calendar event is closed by the ladder (null = open). */
export function ladderLock(c: Career, tierId: string, title: boolean): string | null {
  const L = ladder(c);
  if (title) return L.stage >= 5 ? null : 'бои за мировой пояс — на последней ступени';
  return STAGE_TIERS[L.stage]?.includes(tierId) ? null : `откроется на ступени «${STAGE_NAME[Math.min(5, L.stage + 1)]}»`;
}

/** What is still needed for the next stage. */
export function nextStageNeeds(c: Career): string {
  const L = ladder(c);
  if (L.stage >= 2) return 'дальше — по сюжету';
  const need: string[] = [];
  if (!L.cupWins) need.push('выиграть подвальный турнир');
  for (const k of L.clubs.filter((x) => x.stage === 1)) if (!L.beaten.includes(k.id)) need.push(`победить лидера ${k.name}`);
  return need.length ? need.join(', ') : 'всё сделано';
}

function checkStage(c: Career): string[] {
  const L = ladder(c);
  if (L.stage === 1 && L.cupWins > 0 && L.clubs.filter((k) => k.stage === 1).every((k) => L.beaten.includes(k.id))) {
    L.stage = 2;
    return ['🏆 Открыта ступень «Район»: крыши и лиги района'];
  }
  return [];
}

// ---------- The weekly tournament ----------

/** The next Saturday (today if it is one). */
const nextSat = (day: number) => day + ((SAT - DOW(day) + 7) % 7);

/** Loners of the district, about the clubs' level. */
function loner(c: Career): CareerFighter {
  const f = makeFighter(0.02 + Math.random() * 0.14, 0.5, WCLASSES[Math.floor(Math.random() * 3)]);
  f.story = `${f.story} Без клуба.`;
  return f;
}

/** This week's tournament: made when first asked for, the field drawn on day 1. */
export function cup(c: Career): Cup {
  const L = ladder(c);
  if (!L.cup || (L.cup.done && c.day > L.cup.day + 1)) {
    L.cup = { day: nextSat(c.day), entrants: [], ours: null, qf: [], sf: [], final: null, third: null, done: false };
  }
  return L.cup;
}

const findIn = (c: Career, cp: Cup, id: string) => c.roster.find((f) => f.id === id) ?? cp.entrants.find((f) => f.id === id)!;

export function cupCanJoin(c: Career, f: CareerFighter): string | null {
  const L = ladder(c);
  const cp = cup(c);
  if (!L.open) return 'откроется по сюжету';
  if (cp.ours) return cp.ours === f.id ? 'уже записан' : 'записан другой твой боец';
  if (c.day > cp.day || (c.day === cp.day && cp.qf.length)) return 'запись закрыта';
  if (c.money < CUP_FEE) return `взнос $${CUP_FEE}`;
  return null;
}

export function cupJoin(c: Career, f: CareerFighter): string {
  const why = cupCanJoin(c, f);
  if (why) return why;
  const cp = cup(c);
  c.money -= CUP_FEE;
  cp.ours = f.id;
  save(c);
  return `${short(f)} записан на турнир (${dayWord(c, cp.day)}). Взнос $${CUP_FEE}`;
}

const dayWord = (c: Career, d: number) => (d === c.day ? 'сегодня' : d === c.day + 1 ? 'завтра' : `через ${d - c.day} дн.`);

/** Draws the field on day 1: two or three from each club, loners for the rest. */
function draw(c: Career, cp: Cup): void {
  const L = ladder(c);
  const field: CareerFighter[] = [];
  for (const k of L.clubs.filter((x) => x.stage === 1)) {
    const r = ranked(k);
    // The leader comes most weeks; the others take turns.
    const pick = [r[0], ...r.slice(1).sort(() => Math.random() - 0.5)].slice(0, 2 + (Math.random() < 0.4 ? 1 : 0));
    if (Math.random() < 0.25) pick.shift();
    field.push(...pick);
  }
  const need = 8 - (cp.ours ? 1 : 0);
  while (field.length > need) field.splice(1 + Math.floor(Math.random() * (field.length - 1)), 1);
  while (field.length < need) field.push(loner(c));
  cp.entrants = field;
  const ids = [...(cp.ours ? [cp.ours] : []), ...field.map((f) => f.id)].sort(() => Math.random() - 0.5);
  cp.qf = [0, 2, 4, 6].map((i) => ({ a: ids[i], b: ids[i + 1], w: null }));
}

const coin = (c: Career, cp: Cup, m: CupMatch) => (m.w ??= Math.random() < odds(findIn(c, cp, m.a), findIn(c, cp, m.b)) ? m.a : m.b);
const loserOf = (m: CupMatch) => (m.w === m.a ? m.b : m.a);
const ours = (cp: Cup, m: CupMatch) => !!cp.ours && (m.a === cp.ours || m.b === cp.ours);

/** Our next fight today, if any. */
export function cupMyMatch(c: Career): CupMatch | null {
  cupAdvance(c);
  const cp = ladder(c).cup;
  if (!cp?.ours || cp.done) return null;
  if (c.day === cp.day) return [...cp.qf, ...cp.sf].find((m) => ours(cp, m) && !m.w) ?? null;
  if (c.day === cp.day + 1) return [cp.third, cp.final].find((m) => m && ours(cp, m) && !m.w) ?? null;
  return null;
}

/** Moves the bracket on: settles others' fights up to ours, builds the next round. */
export function cupAdvance(c: Career): void {
  const cp = ladder(c).cup;
  if (!cp || cp.done) return;
  if (c.day >= cp.day && !cp.qf.length) draw(c, cp);
  if (c.day < cp.day) return;
  for (const m of cp.qf) if (!ours(cp, m)) coin(c, cp, m);
  if (!cp.sf.length && cp.qf.every((m) => m.w)) cp.sf = [{ a: cp.qf[0].w!, b: cp.qf[1].w!, w: null }, { a: cp.qf[2].w!, b: cp.qf[3].w!, w: null }];
  for (const m of cp.sf) if (!ours(cp, m)) coin(c, cp, m);
  if (c.day < cp.day + 1 || !cp.sf.length || !cp.sf.every((m) => m.w)) return;
  cp.final ??= { a: cp.sf[0].w!, b: cp.sf[1].w!, w: null };
  cp.third ??= { a: loserOf(cp.sf[0]), b: loserOf(cp.sf[1]), w: null };
  for (const m of [cp.third, cp.final]) if (!ours(cp, m)) coin(c, cp, m);
}

/** After our fight in the cup. Returns lines for the result screen. */
export function cupFought(c: Career, f: CareerFighter, m: CupMatch, won: boolean): string[] {
  const L = ladder(c);
  const cp = L.cup!;
  const oppId = m.a === f.id ? m.b : m.a;
  m.w = won ? f.id : oppId;
  const out: string[] = [];
  const opp = findIn(c, cp, oppId);
  const k = clubOf(c, oppId);
  if (won) {
    f.record.w++;
    f.fame += 1;
    if (k && k.leader === oppId && !L.beaten.includes(k.id)) {
      L.beaten.push(k.id);
      f.fame += 3;
      out.push(`Лидер ${k.name} повержен! Известность +3`);
    }
  } else f.record.l++;
  addMood(f, won ? 6 : -6);
  cupAdvance(c);
  out.push(...settleIfDone(c));
  save(c);
  return [`${won ? 'Победа' : 'Поражение'}: ${short(opp)}${k ? ` (${k.name})` : ''}`, ...out];
}

/** Hands out prizes once the final and the bronze are decided. */
function settleIfDone(c: Career): string[] {
  const L = ladder(c);
  const cp = L.cup!;
  if (cp.done || !cp.final?.w || !cp.third?.w) return [];
  cp.done = true;
  const out: string[] = [];
  const places = [cp.final.w, loserOf(cp.final), cp.third.w];
  const champ = findIn(c, cp, places[0]);
  L.history.unshift(`Неделя ${Math.ceil(cp.day / 7)}: победил ${short(champ)}${clubOf(c, champ.id) ? ` (${clubOf(c, champ.id)!.name})` : ''}`);
  L.history.length = Math.min(L.history.length, 12);
  const i = cp.ours ? places.indexOf(cp.ours) : -1;
  if (i >= 0) {
    c.money += CUP_PRIZE[i];
    const f = c.roster.find((x) => x.id === cp.ours)!;
    f.fame += [5, 3, 1][i];
    if (i === 0) L.cupWins++;
    out.push(`${['🥇 Первое место', '🥈 Второе место', '🥉 Третье место'][i]}: +$${CUP_PRIZE[i]}`);
  } else if (cp.ours) out.push('Без призов. Платят только за 1–3 место');
  out.push(...checkStage(c));
  // The clubs' men get a little better every week.
  for (const k of L.clubs) for (const m of k.members) for (const s of Object.keys(m.stats) as StatKey[]) m.stats[s] = Math.min(m.caps[s], m.stats[s] + 0.004);
  c.log.unshift(...out.map((x) => `🏆 ${x}`));
  return out;
}

/** Midnight: day 1 over — maybe a club sends a man to the door before our final; day 2
 *  over — whatever we did not fight is lost. Called after the date moved on. */
export function cupDay(c: Career): string[] {
  const L = ladder(c);
  const cp = L.cup;
  if (!cp || cp.done) return [];
  const out: string[] = [];
  if (c.day > cp.day && cp.qf.length) {
    // Day 1 fights left unfought are lost.
    for (const m of [...cp.qf, ...cp.sf]) if (ours(cp, m) && !m.w) {
      m.w = m.a === cp.ours ? m.b : m.a;
      out.push('Не вышел на бой турнира — техническое поражение');
    }
    cupAdvance(c);
  }
  if (c.day === cp.day + 1 && cp.ours && cp.final && ours(cp, cp.final) && !cp.ambush && Math.random() < 0.4) {
    // Before the final: the club of the man we beat in the semi, or of the finalist, sends someone.
    const opp = cp.final.a === cp.ours ? cp.final.b : cp.final.a;
    const semi = cp.sf.find((m) => ours(cp, m));
    const k = clubOf(c, opp) ?? (semi ? clubOf(c, semi.a === cp.ours ? semi.b : semi.a) : null) ?? L.clubs[0];
    const pool = ranked(k).filter((m) => m.id !== opp);
    const thug = pool[Math.floor(Math.random() * pool.length)] ?? k.members[0];
    cp.ambush = { club: k.id, man: thug, settled: false };
    out.push(`Утром у подъезда ждёт ${short(thug)} из ${k.name}`);
  }
  if (c.day > cp.day + 1) {
    for (const m of [cp.third, cp.final]) if (m && ours(cp, m) && !m.w) {
      m.w = m.a === cp.ours ? m.b : m.a;
      out.push('Не вышел на бой турнира — техническое поражение');
    }
    cupAdvance(c);
    out.push(...settleIfDone(c));
  }
  if (!cp.ours && c.day > cp.day + 1) {
    cupAdvance(c);
    out.push(...settleIfDone(c));
  }
  return out;
}

/** The man at the door: fight him (no way round it). */
export function ambushFight(c: Career): { opp: CareerFighter; club: Club } | null {
  const cp = ladder(c).cup;
  if (!cp?.ambush || cp.ambush.settled) return null;
  const club = ladder(c).clubs.find((k) => k.id === cp.ambush!.club)!;
  return { opp: cp.ambush.man, club };
}

export function ambushDone(c: Career, f: CareerFighter, won: boolean): string[] {
  const cp = ladder(c).cup!;
  cp.ambush!.settled = true;
  if (won) {
    f.fame += 2;
    addMood(f, 8);
    save(c);
    return ['Отбился у подъезда. Весь подвал уже знает. Известность +2'];
  }
  f.energy = Math.max(0, energyOf(f) - 45);
  addMood(f, -10);
  save(c);
  return ['Избили у подъезда. На финал выйдешь помятым: энергии почти нет'];
}

