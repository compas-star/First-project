// Gyms to train in (user: different gyms). The team trains in one at a time, paid by the
// week; each makes some sessions count for more. The rival «Железный кулак» opens to us
// after the gym-war story (story.ts).
import { STAT_INFO, type Career, type CareerFighter, type StatKey } from './career';

export type GymId = 'basement' | 'boxing' | 'thai' | 'power' | 'mind' | 'elite' | 'iron';
export type GymKey = StatKey | 'hands' | 'legs' | 'tonus';

export interface Gym {
  id: GymId;
  name: string;
  desc: string;
  /** Dollars a week. */
  price: number;
  /** Fame of the team's best man to be let in. */
  fame: number;
  bonus: Partial<Record<GymKey, number>>;
  /** Equipment: how far toward his talent a man can be trained here (0..1 of the way). */
  level: number;
}

export const GYMS: Gym[] = [
  { id: 'basement', name: 'Подвальный зал', desc: 'Ржавые гантели, мешок на цепи, капает с потолка. Бесплатно.', price: 0, fame: 0, bonus: {}, level: 0.6 },
  { id: 'boxing', name: 'Клуб «Перчатка»', desc: 'Старый боксёрский клуб: лапы, ринг, тренер-ворчун. Руки, техника, скорость.', price: 120, fame: 4, bonus: { hands: 1.4, skill: 1.15, bodySpeed: 1.1 }, level: 0.75 },
  { id: 'thai', name: 'Лагерь «Сиам»', desc: 'Тайский лагерь: голени о покрышки, бег в жару. Ноги, выносливость, сила.', price: 140, fame: 8, bonus: { legs: 1.4, cardio: 1.25, strength: 1.1 }, level: 0.75 },
  { id: 'power', name: 'Атлетический центр', desc: 'Штанги, спринты, прыжки. Сила и скорость.', price: 170, fame: 14, bonus: { strength: 1.3, bodySpeed: 1.2 }, level: 0.8 },
  { id: 'mind', name: 'Академия реакции', desc: 'Лампы, мячи на резинках, спарринги с лучшими. Реакция, уклоны, техника.', price: 190, fame: 22, bonus: { mindSpeed: 1.3, evasion: 1.25, skill: 1.1 }, level: 0.8 },
  { id: 'elite', name: 'Центр «Олимп»', desc: 'Лучший зал страны: врачи, сауна, видеоразбор. Всё растёт быстрее, форма держится.', price: 450, fame: 45, bonus: { bodySpeed: 1.25, strength: 1.25, mindSpeed: 1.25, skill: 1.25, evasion: 1.25, cardio: 1.25, hands: 1.25, legs: 1.25, tonus: 1.3 }, level: 1 },
  { id: 'iron', name: '«Железный кулак»', desc: 'Бывший зал Шрама. Теперь твой: бесплатно, сила, руки и ноги.', price: 0, fame: 0, bonus: { strength: 1.2, hands: 1.2, legs: 1.2, tonus: 1.1 }, level: 0.85 },
];

export const GYM_BY_ID = Object.fromEntries(GYMS.map((g) => [g.id, g])) as Record<GymId, Gym>;

export const gymOf = (c: Career): Gym => GYM_BY_ID[c.gym ?? 'basement'] ?? GYMS[0];

/** Where training in this gym stops for this stat: lo + level x (talent cap - lo). */
export const gymCap = (c: Career | undefined, f: CareerFighter, k: StatKey): number => {
  const lo = STAT_INFO[k].lo;
  return lo + (f.caps[k] - lo) * (c ? gymOf(c).level : 1);
};

/** How much more a session of this kind gives in the team's gym. */
export const gymK = (c: Career | undefined, k: GymKey): number =>
  c
    ? (gymOf(c).bonus[k] ?? 1) *
      // The yard (basement lost) or the sewer (act 2 lost): −20%.
      (gymOf(c).id === 'basement' && (c.act1?.flags.lost || c.act2?.flags.sewer) ? 0.8 : 1) *
      // Кирпич holds the pads through act 2.
      (k === 'strength' && c.act2?.flags.kirpichGym && !c.act2.ending ? 1.1 : 1) *
      // Act 3: Сталь spars with us; the basement sealed for a week.
      ((k === 'bodySpeed' || k === 'skill') && c.act3?.flags.stalFriend && !c.act3.ending ? 1.1 : 1) *
      (k === 'strength' && c.act3?.flags.kirpichPads ? 1.1 : 1) *
      (gymOf(c).id === 'basement' && (c.act3?.flags.sealed ?? 0) > c.day ? 0.8 : 1)
    : 1;

/** Whether this gym can be chosen now (and why not). */
export function gymOpen(c: Career, g: Gym): string | null {
  if (g.id === 'iron' && !c.story?.flags.iron) return 'закрыт';
  const best = Math.max(0, ...c.roster.map((f) => f.fame));
  if (best < g.fame) return `нужна известность ${g.fame}`;
  return null;
}

/** Moves the team to a gym, paying its first week. */
export function moveGym(c: Career, id: GymId): string | null {
  const g = GYM_BY_ID[id];
  if (!g) return 'Нет такого зала';
  const why = gymOpen(c, g);
  if (why) return `Зал ${why}`;
  if (c.money < g.price) return 'Не хватает денег на неделю';
  c.money -= g.price;
  c.gym = id;
  c.gymUntil = c.day + 7;
  return null;
}

/** At midnight: a new week is paid, or the team goes back to the basement. */
export function gymDay(c: Career): string[] {
  const g = gymOf(c);
  if (!g.price || (c.gymUntil ?? 0) > c.day) return [];
  if (c.money >= g.price) {
    c.money -= g.price;
    c.gymUntil = c.day + 7;
    return [`Неделя в зале «${g.name.replace(/[«»]/g, '')}» оплачена: −$${g.price}`];
  }
  c.gym = 'basement';
  return [`Не хватило денег на ${g.name}: команда вернулась в подвал`];
}
