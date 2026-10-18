import type { FighterParams } from './config';
import {
  type Career, type CareerFighter, type Tier, addRel, busy, bookedOn, makeFighter, WCLASSES, classOf, short, save,
} from './career';

// Life between fights: who the fighter is (traits), how he feels (mood), and what he gets up
// to (incidents the manager has to deal with: a bar brawl, a night in the cells, a sponsor,
// a girl). Each morning may bring one; most ask for a choice.

export type TraitId = 'drinker' | 'hothead' | 'lazy' | 'grinder' | 'star' | 'ladies' | 'loyal';

export const TRAITS: Record<TraitId, { name: string; icon: string; desc: string }> = {
  drinker: { icon: '🍺', name: 'Пьющий', desc: 'Любит выпить. Иногда напивается и дерётся в барах.' },
  hothead: { icon: '🔥', name: 'Вспыльчивый', desc: 'Заводится с пол-оборота: уличные драки, злее в бою.' },
  lazy: { icon: '💤', name: 'Ленивый', desc: 'Тренируется хуже, иногда прогуливает.' },
  grinder: { icon: '💪', name: 'Трудяга', desc: 'Тренировки дают больше, но легче перетренироваться.' },
  star: { icon: '⭐', name: 'Звезда', desc: 'Любит камеры: спонсоры и интервью, слава растёт быстрее.' },
  ladies: { icon: '💘', name: 'Бабник', desc: 'Влюбляется и пропадает.' },
  loyal: { icon: '🤝', name: 'Верный', desc: 'Настроение держится, не бросит менеджера.' },
};
const ALL: TraitId[] = Object.keys(TRAITS) as TraitId[];
const OPPOSED: [TraitId, TraitId][] = [['lazy', 'grinder']];

export type IncidentKind = 'bar' | 'street' | 'skip' | 'sponsor' | 'interview' | 'love' | 'leave' | 'binge';

export interface Incident {
  id: number;
  f: string;
  kind: IncidentKind;
  day: number;
  text: string;
  opts: { id: string; label: string }[];
  /** Someone else involved (a rival for a street fight or an interview), and money at stake. */
  who?: string;
  money?: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const BARS = ['«Подкова»', '«Красный фонарь»', '«У Михалыча»', '«Ржавый якорь»', '«Неон»', '«Пятый угол»'];

/** One or two traits, never two opposite ones. */
export function rollTraits(): TraitId[] {
  const a = pick(ALL);
  if (Math.random() < 0.45) return [a];
  let b = pick(ALL);
  for (let i = 0; i < 5 && (b === a || OPPOSED.some(([x, y]) => (x === a && y === b) || (x === b && y === a))); i++) b = pick(ALL);
  return b === a ? [a] : [a, b];
}

export const has = (f: CareerFighter, t: TraitId) => !!f.traits?.includes(t);
export const moodOf = (f: CareerFighter) => f.mood ?? 30;

export function moodWord(f: CareerFighter): { icon: string; text: string } {
  const m = moodOf(f);
  return m > 60 ? { icon: '😄', text: 'рвётся в бой' } : m > 20 ? { icon: '🙂', text: 'в порядке' } : m > -20 ? { icon: '😐', text: 'так себе' } : m > -60 ? { icon: '😠', text: 'недоволен' } : { icon: '🤬', text: 'на грани ухода' };
}

export function addMood(f: CareerFighter, d: number): void {
  // A loyal man takes the bad days easier.
  const k = d < 0 && has(f, 'loyal') ? 0.5 : 1;
  f.mood = Math.max(-100, Math.min(100, moodOf(f) + d * k));
}

/** Training gain factor: mood and character. */
export function trainK(f: CareerFighter): number {
  let k = 0.85 + 0.3 * ((moodOf(f) + 100) / 200);
  if (has(f, 'lazy')) k *= 0.85;
  if (has(f, 'grinder')) k *= 1.15;
  if (f.hangover !== undefined) k *= 0.5;
  return k;
}

/** How he fights with this mood and character (on top of his stats). */
export function lifeParams(f: CareerFighter, p: FighterParams): void {
  const m = moodOf(f);
  if (has(f, 'hothead')) p.aggression = Math.min(1, p.aggression + 0.12);
  // A man who does not want to be there fights a little worse; one who is fired up, better.
  p.skill *= 1 + 0.04 * (m / 100);
}

/** Everybody gets a character (old saves too) and a starting mood. */
export function ensureLife(c: Career): void {
  for (const f of [...c.roster, ...c.market, ...(c.world ?? [])]) {
    f.traits ??= rollTraits();
    f.mood ??= Math.round(rnd(10, 50));
  }
  c.incidents ??= [];
  c.nextInc ??= 1;
}

function add(c: Career, i: Omit<Incident, 'id'>): void {
  c.incidents!.push({ ...i, id: c.nextInc!++ });
}

/**
 * The morning: yesterday's unanswered incidents settle the way they go when nobody acts,
 * moods drift, and something may happen to each of ours.
 */
export function dailyLife(c: Career): string[] {
  ensureLife(c);
  const out: string[] = [];
  for (const i of [...c.incidents!]) if (i.day < c.day) out.push(...resolve(c, i, 'ignore').lines);
  for (const f of c.roster) {
    if (f.hangover !== undefined && f.hangover < c.day) f.hangover = undefined;
    // Rest days lift the mood a little toward fair.
    if (!busy(c, f)) addMood(f, moodOf(f) < 30 ? 2 : 0);
    if (c.incidents!.some((x) => x.f === f.id)) continue;
    const name = short(f);
    const fighting = !!bookedOn(c, f, c.day);
    const free = !busy(c, f) && !fighting;
    const r = Math.random();
    const low = moodOf(f) < -10 ? 1.6 : 1;
    if (moodOf(f) < -60 && !has(f, 'loyal') && r < 0.35) {
      add(c, { f: f.id, kind: 'leave', day: c.day, text: `${name} собирает вещи: «Найду себе менеджера получше».`, opts: [{ id: 'talk', label: 'Уговорить (10 ◆)' }, { id: 'ignore', label: 'Пусть уходит' }] });
    } else if (has(f, 'drinker') && r < 0.11 * low) {
      const bill = Math.round(rnd(60, 140));
      add(c, {
        f: f.id, kind: 'bar', day: c.day, money: bill,
        text: `Звонок ночью: ${name} напился в баре ${pick(BARS)} и машется с вышибалой. Бармен грозит полицией.`,
        opts: [{ id: 'fetch', label: 'Ехать вытаскивать' }, { id: 'pay', label: `Заплатить бармену $${bill}` }, { id: 'ignore', label: 'Пусть сидит' }],
      });
    } else if (has(f, 'drinker') && moodOf(f) < 0 && r < 0.16 && free) {
      add(c, { f: f.id, kind: 'binge', day: c.day, text: `${name} ушёл в загул и не берёт трубку.`, opts: [{ id: 'search', label: 'Искать по барам (3 ◆)' }, { id: 'ignore', label: 'Сам вернётся' }] });
    } else if (has(f, 'hothead') && r < 0.06 * low) {
      const same = (c.world ?? []).filter((x) => classOf(x) === classOf(f));
      const rival = same.length ? pick(same) : null;
      const bail = Math.round(rnd(80, 160));
      add(c, {
        f: f.id, kind: 'street', day: c.day, who: rival?.id, money: bail,
        text: `${name} подрался на улице с ${rival ? short(rival) : 'каким-то бойцом'}. Обоих забрали в участок, залог $${bail}.`,
        opts: [{ id: 'pay', label: `Внести залог $${bail}` }, { id: 'ignore', label: 'Пусть посидит' }],
      });
    } else if (has(f, 'lazy') && f.session && r < 0.15) {
      add(c, { f: f.id, kind: 'skip', day: c.day, text: `${name} прогулял тренировку: «Голова болит».`, opts: [{ id: 'talk', label: 'Поговорить' }, { id: 'fine', label: 'Оштрафовать' }] });
      f.session = { ...f.session, gain: f.session.gain * 0.3 };
    } else if ((has(f, 'star') ? 0.07 : 0.015) + Math.min(0.05, f.fame / 2000) > r && free) {
      const pay = Math.round(rnd(80, 200) + f.fame * 3);
      add(c, { f: f.id, kind: 'sponsor', day: c.day, money: pay, text: `Спонсор хочет снять ${name} в рекламе энергетика: $${pay}, займёт день.`, opts: [{ id: 'yes', label: 'Согласиться' }, { id: 'ignore', label: 'Отказать' }] });
    } else if (has(f, 'star') && r < 0.12) {
      const next = c.events.find((e) => e.f === f.id && !e.done && e.opp);
      if (next) {
        add(c, {
          f: f.id, kind: 'interview', day: c.day, who: next.opp,
          text: `Журналист зовёт ${name} на интервью перед боем. Можно наговорить гадостей про соперника — бой станет злее и громче.`,
          opts: [{ id: 'trash', label: 'Поливать соперника' }, { id: 'calm', label: 'Вежливо' }, { id: 'ignore', label: 'Не ходить' }],
        });
      }
    } else if (has(f, 'ladies') && r < 0.08) {
      add(c, { f: f.id, kind: 'love', day: c.day, text: `${name} влюбился и просит выходной, чтобы сводить её на свидание.`, opts: [{ id: 'yes', label: 'Отпустить' }, { id: 'no', label: 'Запретить' }] });
    }
  }
  return out;
}

export interface Outcome {
  lines: string[];
  /** Go to the bar and get him out: a fight with the bouncer, drunk. */
  brawl?: { f: CareerFighter; opp: CareerFighter; tier: Tier };
}

/** The bar as a place to fight: a cramped room, no rounds, no referee. */
export const BAR_TIER: Tier = {
  id: 'bar', name: 'Бар', desc: '', map: 'bar', rules: { roundLen: 0, rounds: 0, tough: 1, standing: true },
  level: [0.05, 0.2], fame: 0, purse: [0, 0], fee: 0, prize: 0, tokens: 0, size: 8,
};

export function bouncer(): CareerFighter {
  const b = makeFighter(rnd(0.08, 0.2), 0.3, WCLASSES[2]);
  b.name = `${pick(['Гоша', 'Толик', 'Бугай', 'Шкаф', 'Михалыч'])} «Вышибала» ${pick(['Бочкин', 'Громов', 'Ломов'])}`;
  b.discipline = 'street';
  b.weight = Math.round(rnd(105, 130));
  b.height = Math.round(rnd(1.86, 1.98) * 100) / 100;
  b.aggression = 0.8;
  b.skin = 'robot';
  return b;
}

/** Drunk: slow to see, sloppy, too brave. */
export function drunk(p: FighterParams): void {
  p.skill *= 0.6;
  p.mindSpeed *= 0.7;
  p.bodySpeed *= 0.93;
  p.aggression = Math.min(1, p.aggression + 0.3);
}

export function resolve(c: Career, i: Incident, opt: string): Outcome {
  const f = c.roster.find((x) => x.id === i.f);
  c.incidents = c.incidents!.filter((x) => x !== i);
  if (!f) return { lines: [] };
  const name = short(f);
  const lines: string[] = [];
  const away = (days: number, what: string) => {
    f.busyFrom = c.day;
    f.busyUntil = Math.max(f.busyUntil, c.day + days);
    f.busyWhat = what;
    f.session = undefined;
    f.queue = [];
    // A fight booked while he is away is lost.
    for (const e of c.events) if (e.f === f.id && !e.done && e.day < c.day + days && e.day >= c.day) {
      e.f = undefined;
      e.opp = undefined;
      lines.push(`${name} пропускает бой: запись снята`);
    }
  };
  switch (i.kind) {
    case 'bar':
      if (opt === 'fetch') return { lines: [`Едешь в бар за ${name}…`], brawl: { f, opp: bouncer(), tier: BAR_TIER } };
      if (opt === 'pay' && c.money >= (i.money ?? 0)) {
        c.money -= i.money ?? 0;
        f.hangover = c.day;
        addMood(f, -3);
        lines.push(`Заплатил бармену $${i.money}. ${name} спит дома, сегодня с похмелья`);
      } else {
        c.money = Math.max(0, c.money - 150);
        away(2, 'сидит в обезьяннике после бара');
        addMood(f, -12);
        f.fame = Math.max(0, f.fame - 2);
        lines.push(`${name} провёл ночь в участке: штраф $150, два дня потеряно, известность −2`);
      }
      break;
    case 'binge':
      if (opt === 'search' && c.tokens >= 3) {
        c.tokens -= 3;
        f.hangover = c.day;
        addMood(f, 5);
        lines.push(`Нашёл ${name} в третьем баре, отвёз домой. Сегодня с похмелья`);
      } else {
        away(3, 'в загуле');
        addMood(f, 8);
        lines.push(`${name} вернулся через три дня, помятый, но повеселевший`);
      }
      break;
    case 'street': {
      const rival = (c.world ?? []).find((x) => x.id === i.who);
      if (rival) addRel(c, f, rival, -30);
      if (opt === 'pay' && c.money >= (i.money ?? 0)) {
        c.money -= i.money ?? 0;
        addMood(f, 6);
        lines.push(`Внёс залог $${i.money}. ${name} на свободе и злой на ${rival ? short(rival) : 'обидчика'}`);
      } else {
        away(2, 'сидит в участке после драки');
        addMood(f, -10);
        lines.push(`${name} два дня в участке. Вражда с ${rival ? short(rival) : 'обидчиком'} разгорелась`);
      }
      break;
    }
    case 'skip':
      if (opt === 'fine') {
        c.money += 50;
        addMood(f, -12);
        lines.push(`Штраф $50 в кассу. ${name} надулся`);
      } else {
        addMood(f, -2);
        lines.push(`Поговорил с ${name}. Обещает больше не прогуливать`);
      }
      break;
    case 'sponsor':
      if (opt === 'yes' && !busy(c, f)) {
        c.money += i.money ?? 0;
        f.fame += 2;
        addMood(f, 6);
        away(1, 'снимается в рекламе');
        lines.push(`${name} снялся в рекламе: +$${i.money}, известность +2`);
      } else if (opt === 'yes') lines.push(`${name} занят, спонсор ушёл`);
      else {
        addMood(f, has(f, 'star') ? -8 : 0);
        lines.push(`Отказали спонсору${has(f, 'star') ? `. ${name} обиделся` : ''}`);
      }
      break;
    case 'interview': {
      const opp = [...(c.world ?? []), ...c.roster].find((x) => x.id === i.who);
      if (opt === 'trash' && opp) {
        addRel(c, f, opp, -35);
        f.fame += 3;
        addMood(f, 8);
        lines.push(`${name} назвал ${short(opp)} мешком с опилками. Известность +3, ${short(opp)} в ярости`);
      } else if (opt === 'calm') {
        f.fame += 1;
        lines.push(`${name} дал спокойное интервью. Известность +1`);
      } else {
        addMood(f, has(f, 'star') ? -6 : 0);
        lines.push(`Интервью не состоялось`);
      }
      break;
    }
    case 'love':
      if (opt === 'yes') {
        addMood(f, 18);
        if (!busy(c, f) && !bookedOn(c, f, c.day)) away(1, 'на свидании');
        lines.push(`${name} на свидании. Вернётся счастливым`);
      } else {
        addMood(f, -15);
        lines.push(`${name} остался в зале, но мысли не о тренировке`);
      }
      break;
    case 'leave':
      if (opt === 'talk' && c.tokens >= 10) {
        c.tokens -= 10;
        f.mood = 20;
        lines.push(`Уговорил ${name} остаться`);
      } else if (c.roster.length > 1) {
        c.roster = c.roster.filter((x) => x !== f);
        for (const e of c.events) if (e.f === f.id && !e.done) e.f = undefined;
        if (c.pick === f.id) c.pick = c.roster[0].id;
        (c.world ??= []).push(f);
        lines.push(`${name} ушёл из команды. Теперь он сам по себе`);
      } else {
        f.mood = -20;
        lines.push(`${name} грозился уйти, но идти ему некуда. Остался, ворчит`);
      }
      break;
  }
  c.log.unshift(...lines);
  save(c);
  return { lines };
}

/** After getting him out of the bar (or not). */
export function afterBrawl(c: Career, f: CareerFighter, won: boolean): string[] {
  const name = short(f);
  const lines: string[] = [];
  f.hangover = c.day;
  if (won) {
    c.money = Math.max(0, c.money - 40);
    addMood(f, 10);
    f.fame += 1;
    lines.push(`Вышибала лежит, ${name} уходит своими ногами. За сломанный стул $40. Весь район обсуждает`);
  } else {
    c.money = Math.max(0, c.money - 90);
    addMood(f, -8);
    f.busyFrom = c.day;
    f.busyUntil = Math.max(f.busyUntil, c.day + 2);
    f.busyWhat = 'отходит после бара';
    f.session = undefined;
    lines.push(`Вышибала уложил ${name}. Штраф $90, два дня отлёживается`);
  }
  c.log.unshift(...lines);
  save(c);
  return lines;
}

/** Mood after a fight of his. */
export function moodAfterFight(f: CareerFighter, won: boolean, ko: boolean): void {
  addMood(f, won ? (ko ? 18 : 12) : ko ? -16 : -9);
}
