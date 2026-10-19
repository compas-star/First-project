// A fighter's day in the city (user: like Punch Club). The day is three parts (morning, day,
// evening) and the night; the player spends the parts on training, work and rest, and the
// day ends only when he sends them to sleep. Two needs: satiety (food costs money) and
// energy (sleep and rest give it back). Numbers balanced with tools/econ.ts.
import {
  type Career, type CareerFighter, type StatKey, type Intensity, type Craft,
  busy, bookedOn, gainOf, craftGain, save, short, STAT_INFO, CRAFT_NAME, CRAFT_TIERS, TIER_OPEN, moveName, tonusOf, TONUS_GAIN,
} from './career';
import { addMood, moodOf } from './life';
import { gymK } from './gyms';

export const PARTS = ['утро', 'день', 'вечер', 'ночь'];
export const DOW = (day: number) => (day - 1) % 7; // 0 = Monday

export const satOf = (f: CareerFighter) => f.sat ?? 80;
export const energyOf = (f: CareerFighter) => f.energy ?? 100;
export const partOf = (f: CareerFighter) => f.parts ?? 0;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Energy a session takes, by intensity. */
export const TRAIN_ENERGY: Record<Intensity['id'], number> = { light: 15, normal: 30, hard: 45 };
const TRAIN_SAT: Record<Intensity['id'], number> = { light: 8, normal: 15, hard: 22 };
/** A session is this share of what a whole day in the gym used to give. */
const SESSION = 0.8;
export const HUNGRY = 30;
export const MIN_TRAIN_ENERGY = 25;

/** Parts of today he can still spend (the evening stays free on a fight day). */
export function partsLeft(c: Career, f: CareerFighter): number {
  const fight = bookedOn(c, f, c.day) || c.tour?.fighter === f.id ? 1 : 0;
  return Math.max(0, 3 - partOf(f) - fight);
}

/** Training gain factor from food: hungry trains at half, sports food adds a fifth. */
export const feedK = (f: CareerFighter) => (satOf(f) < HUNGRY ? 0.5 : 1) * (f.boost ?? 1);

export const sessionGain = (f: CareerFighter, k: StatKey, it: Intensity, c: Career) => SESSION * feedK(f) * gainOf(f, k, it, c);
export const sessionCraft = (f: CareerFighter, k: Craft, it: Intensity, c: Career) => SESSION * feedK(f) * craftGain(f, k, it, c);

function spend(f: CareerFighter, parts: number, e: number, s: number): void {
  f.parts = partOf(f) + parts;
  f.energy = clamp(energyOf(f) - e, 0, 100);
  f.sat = clamp(satOf(f) - s, 0, 100);
}

/** Why he cannot spend `parts` now on something taking `e` energy; null if he can. */
export function cannot(c: Career, f: CareerFighter, parts: number, e: number): string | null {
  if (busy(c, f)) return f.busyWhat || 'восстанавливается';
  if (partsLeft(c, f) < parts) return partsLeft(c, f) ? 'не хватит времени сегодня' : bookedOn(c, f, c.day) ? 'вечером бой' : 'день кончился — спать';
  if (energyOf(f) < e) return 'нет сил';
  return null;
}

/** One session in the gym, right now: the gain lands at once. Returns a line or an error. */
export function trainNow(c: Career, f: CareerFighter, k: StatKey, it: Intensity, move?: Craft): { ok: boolean; text: string } {
  const e = TRAIN_ENERGY[it.id];
  const why = cannot(c, f, 1, Math.max(e, MIN_TRAIN_ENERGY));
  if (why) return { ok: false, text: why };
  const luck = 0.75 + 0.5 * Math.random();
  let text: string;
  if (move) {
    f.craft ??= { hands: 0, legs: 0 };
    const was = f.craft[move];
    f.craft[move] = Math.min(1, was + sessionCraft(f, move, it, c) * luck);
    text = `${CRAFT_NAME[move]} ${Math.round(was * 100)}→${Math.round(f.craft[move] * 100)}%`;
    const opened = TIER_OPEN.findIndex((o) => was < o && f.craft![move] >= o);
    if (opened > 0) text += `. Новые удары: ${CRAFT_TIERS[move][opened].map(moveName).join(', ')}`;
  } else {
    const before = f.stats[k];
    f.stats[k] = Math.min(f.caps[k], before + sessionGain(f, k, it, c) * luck);
    const d = f.stats[k] - before;
    const shown = k === 'skill' || k === 'evasion' ? `${(d * 100).toFixed(1)}%` : `×${d.toFixed(3)}`;
    text = `${STAT_INFO[k].name} +${shown}${d < 1e-4 ? ' (потолок, но тонус держит)' : ''}`;
  }
  if (satOf(f) < HUNGRY) text += ' — голодный, вполсилы';
  f.tonus = Math.min(100, tonusOf(f) + TONUS_GAIN[it.id] * 0.6 * gymK(c, 'tonus'));
  f.trainedDay = c.day;
  spend(f, 1, e, TRAIN_SAT[it.id]);
  if (Math.random() < it.injury) {
    f.busyFrom = c.day;
    f.busyUntil = c.day + 3;
    f.busyWhat = 'потянул мышцу на тренировке';
    text += '. Потянул мышцу: 2 дня без зала и работы';
  }
  save(c);
  return { ok: true, text };
}

// ---------- Work ----------

export interface Job {
  id: 'site' | 'market' | 'bouncer';
  name: string;
  desc: string;
  parts: number;
  pay: number;
  e: number;
  s: number;
}

export const JOBS: Job[] = [
  { id: 'site', name: 'Стройка', desc: 'Таскать мешки с цементом. Только по будням, полдня.', parts: 2, pay: 45, e: 35, s: 25 },
  { id: 'market', name: 'Грузчик на рынке', desc: 'Ящики с овощами. Каждый день.', parts: 1, pay: 25, e: 20, s: 12 },
  { id: 'bouncer', name: 'Вышибала в «Подкове»', desc: 'Вечер пятницы и субботы. Бывают драки.', parts: 1, pay: 60, e: 25, s: 10 },
];

/** Why this job is closed now (null = open). */
export function jobClosed(c: Career, f: CareerFighter, j: Job): string | null {
  if (j.id === 'site' && DOW(c.day) > 4) return 'в выходные стройка стоит';
  if (j.id === 'bouncer') {
    if (DOW(c.day) !== 4 && DOW(c.day) !== 5) return 'только пятница и суббота';
    if (partOf(f) !== 2) return 'только вечером';
  }
  return cannot(c, f, j.parts, j.e);
}

export function work(c: Career, f: CareerFighter, j: Job): { ok: boolean; text: string } {
  const why = jobClosed(c, f, j);
  if (why) return { ok: false, text: why };
  spend(f, j.parts, j.e, j.s);
  c.money += j.pay;
  addMood(f, -2);
  let text = `${j.name}: +$${j.pay}`;
  if (j.id === 'bouncer' && Math.random() < 0.25) {
    // Step 1: the brawl is a coin by his strength; a real fight in the bar comes later.
    const p = 0.45 + 0.25 * Math.min(1, f.stats.strength - 0.6) + 0.15 * f.stats.skill;
    if (Math.random() < p) {
      f.fame += 1;
      addMood(f, 4);
      text += '. Выкинул буйного пьяного, известность +1';
    } else {
      addMood(f, -6);
      f.energy = Math.max(0, energyOf(f) - 15);
      text += '. Пьяный попал по лицу, настроение хуже';
      if (Math.random() < 0.25) {
        f.busyFrom = c.day;
        f.busyUntil = c.day + 2;
        f.busyWhat = 'побит в баре';
        text += ': день отлежаться';
      }
    }
  }
  c.log.unshift(`${short(f)}: ${text}`);
  save(c);
  return { ok: true, text };
}

// ---------- Food and rest ----------

export interface Food {
  id: 'cheap' | 'cafe' | 'sport';
  name: string;
  price: number;
  sat: number;
  mood: number;
  note: string;
}

export const FOODS: Food[] = [
  { id: 'cheap', name: 'Доширак', price: 5, sat: 30, mood: -1, note: 'дёшево и грустно' },
  { id: 'cafe', name: 'Обед в кафе', price: 15, sat: 60, mood: 2, note: 'нормальная еда' },
  { id: 'sport', name: 'Спортпит', price: 40, sat: 50, mood: 1, note: 'тренировки сегодня ×1.2' },
];

export function eat(c: Career, f: CareerFighter, food: Food): { ok: boolean; text: string } {
  if (c.money < food.price) return { ok: false, text: 'не хватает денег' };
  if (satOf(f) >= 95) return { ok: false, text: 'он сыт' };
  c.money -= food.price;
  f.sat = Math.min(100, satOf(f) + food.sat);
  addMood(f, food.mood);
  if (food.id === 'sport') f.boost = 1.2;
  save(c);
  return { ok: true, text: `${food.name}: сытость ${Math.round(satOf(f))}` };
}

export function rest(c: Career, f: CareerFighter): { ok: boolean; text: string } {
  if (partsLeft(c, f) < 1) return { ok: false, text: 'день кончился — спать' };
  spend(f, 1, -15, 5);
  addMood(f, 6);
  save(c);
  return { ok: true, text: `Отдохнул: энергия ${Math.round(energyOf(f))}` };
}

// ---------- The night ----------

export const RENT = 70;

/** Midnight for each of ours (called from endDay before the date moves on). */
export function cityNight(c: Career): string[] {
  const out: string[] = [];
  for (const f of c.roster) {
    const idle = Math.max(0, 3 - partOf(f));
    f.sat = Math.max(0, satOf(f) - 4 * idle - 15);
    f.energy = Math.min(100, energyOf(f) + 70 * (satOf(f) < HUNGRY ? 0.8 : 1));
    if (satOf(f) <= 0) {
      f.tonus = Math.max(0, tonusOf(f) - 10);
      addMood(f, -8);
      out.push(`${short(f)} голодает: теряет форму, злой`);
    } else if (satOf(f) < HUNGRY) {
      addMood(f, -3);
      out.push(`${short(f)} ложится голодным`);
    }
    f.parts = 0;
    f.boost = 1;
  }
  // Sunday night: the rent for the flat over the basement.
  if (DOW(c.day) === 6 && !c.act2?.flags.sewer) {
    if (c.money >= RENT) {
      c.money -= RENT;
      out.push(`Квартплата за неделю: −$${RENT}`);
    } else {
      for (const f of c.roster) addMood(f, -10);
      out.push(`Нечем заплатить за квартиру ($${RENT}): хозяйка ругается, всем тошно`);
    }
  }
  return out;
}

/** Spends the fight's toll (energy, food) and the rest of his day. */
export function fightToll(f: CareerFighter, tour = false): void {
  f.energy = Math.max(0, energyOf(f) - (tour ? 25 : 40));
  f.sat = Math.max(0, satOf(f) - (tour ? 12 : 20));
  f.parts = 3;
}

/** How a tired or hungry man fights: shorter wind, a bit weaker. */
export function needsK(f: CareerFighter): { cardio: number; power: number } {
  const e = energyOf(f), s = satOf(f);
  return { cardio: (0.7 + 0.3 * Math.min(1, e / 70)) * (s < HUNGRY ? 0.85 : 1), power: s < HUNGRY ? 0.95 : 1 };
}

export const needWord = (v: number) => (v >= 70 ? 'good' : v >= HUNGRY ? 'mid' : 'low');
export { moodOf };

// ---------- Places in town ----------

/** Hospital: pay per day left and the recovery takes half as long. */
export function treatCost(c: Career, f: CareerFighter): number {
  return busy(c, f) && !f.treated ? 40 * (f.busyUntil - c.day) : 0;
}

export function treat(c: Career, f: CareerFighter): { ok: boolean; text: string } {
  const cost = treatCost(c, f);
  if (!cost) return { ok: false, text: f.treated ? 'уже лечат' : 'лечить нечего' };
  if (c.money < cost) return { ok: false, text: 'не хватает денег' };
  c.money -= cost;
  const left = f.busyUntil - c.day;
  f.busyUntil = c.day + Math.ceil(left / 2);
  f.treated = true;
  save(c);
  return { ok: true, text: `Врачи взялись: в строю через ${f.busyUntil - c.day || 'один'} дн.` };
}

/** A beer in the bar: the evening goes, the mood comes back. */
export function beer(c: Career, f: CareerFighter): { ok: boolean; text: string } {
  if (partsLeft(c, f) < 1) return { ok: false, text: 'день кончился — спать' };
  if (c.money < 8) return { ok: false, text: 'не хватает денег' };
  c.money -= 8;
  spend(f, 1, -5, -5);
  addMood(f, 10);
  save(c);
  return { ok: true, text: 'Пиво с мужиками: настроение лучше' };
}
