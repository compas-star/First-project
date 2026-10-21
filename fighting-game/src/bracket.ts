// A small tournament bracket for the story's tournaments (act 3: Кубок Бархата, the city
// championship): 8 men, a round per fight night (two rounds may share a night), others' fights
// watched in the arena or counted by the odds, bets on any fight not yet decided. Ours is
// fought from the act (its scenes before and after). Men in `fate` (the story needs them
// further: Титан, Сталь) win their counted fights; a watched fight is decided in the ring.
import { odds, short, type Career, type CareerFighter } from './career';
import type { Bet, CupMatch } from './clubs';

export interface Bracket {
  name: string;
  men: CareerFighter[];
  ours: string | null;
  /** rounds[0] quarter-finals ... the final; built as the last one is decided. */
  rounds: CupMatch[][];
  /** Career day of each round's fight night. */
  nights: number[];
  /** Rounds per fight, by round. */
  len: number[];
  bets: Bet[];
  done: boolean;
  fate: string[];
}

export const ROUND_NAME = ['Четвертьфинал', 'Полуфинал', 'Финал'];

export const brPerson = (c: Career, br: Bracket, id: string) => c.roster.find((f) => f.id === id) ?? br.men.find((f) => f.id === id)!;
export const brOurs = (br: Bracket, m: CupMatch) => !!br.ours && (m.a === br.ours || m.b === br.ours);

/** Eight men in bracket order: [0 v 1], [2 v 3] (the top half), [4 v 5], [6 v 7]. */
export function makeBracket(name: string, order: CareerFighter[], ours: string | null, nights: number[], len: number[], fate: string[]): Bracket {
  const ids = order.map((m) => m.id);
  return {
    name, men: order.filter((m) => m.id !== ours), ours, nights, len, bets: [], done: false, fate,
    rounds: [[0, 2, 4, 6].map((i) => ({ a: ids[i], b: ids[i + 1], w: null }))],
  };
}

/** The bookmaker's coefficients for a fight: [on a, on b] (a 7% margin). */
export function brCoef(c: Career, br: Bracket, m: CupMatch): [number, number] {
  const p = odds(brPerson(c, br, m.a), brPerson(c, br, m.b));
  const k = (q: number) => Math.max(1.05, Math.round((0.93 / Math.max(0.04, q)) * 100) / 100);
  return [k(p), k(1 - p)];
}

/** Builds the next round once the last is decided. */
export function brAdvance(br: Bracket): void {
  for (let r = 0; r < br.rounds.length; r++) {
    const R = br.rounds[r];
    if (br.rounds[r + 1] || !R.every((m) => m.w)) continue;
    if (R.length === 1) {
      br.done = true;
      return;
    }
    const next: CupMatch[] = [];
    for (let i = 0; i < R.length; i += 2) next.push({ a: R[i].w!, b: R[i + 1].w!, w: null });
    br.rounds.push(next);
  }
}

/** The round being fought tonight (the first undecided round whose night is today). */
export function brTonight(c: Career, br: Bracket): number {
  brAdvance(br);
  for (let r = 0; r < br.rounds.length; r++) if (br.nights[r] === c.day && br.rounds[r].some((m) => !m.w)) return r;
  return -1;
}

/** Our fight tonight, if any. */
export function brMine(c: Career, br: Bracket): { m: CupMatch; r: number } | null {
  const r = brTonight(c, br);
  if (r < 0) return null;
  const m = br.rounds[r].find((x) => brOurs(br, x) && !x.w);
  return m ? { m, r } : null;
}

export function brDecide(c: Career, br: Bracket, m: CupMatch, w: string, how: CupMatch['how']): string[] {
  if (m.w) return [];
  m.w = w;
  m.how = how;
  const out: string[] = [];
  for (const b of br.bets) {
    if (br.rounds[b.r]?.[b.i] !== m || b.paid) continue;
    b.paid = true;
    if (b.on === w) {
      const win = Math.round(b.stake * b.k);
      c.money += win;
      out.push(`Ставка сыграла: +$${win}`);
    } else out.push(`Ставка $${b.stake} сгорела`);
  }
  if (out.length) c.log.unshift(...out.map((x) => `💵 ${x}`));
  brAdvance(br);
  return out;
}

function coin(c: Career, br: Bracket, m: CupMatch): string[] {
  const fa = br.fate.includes(m.a), fb = br.fate.includes(m.b);
  const p = fa && !fb ? 0.97 : fb && !fa ? 0.03 : odds(brPerson(c, br, m.a), brPerson(c, br, m.b));
  return brDecide(c, br, m, Math.random() < p ? m.a : m.b, 'odds');
}

/** Counts tonight's other fights (not ours). */
export function brCount(c: Career, br: Bracket): string[] {
  const out: string[] = [];
  for (let k = 0; k < 3; k++) {
    const r = brTonight(c, br);
    if (r < 0) break;
    const ms = br.rounds[r].filter((m) => !m.w && !brOurs(br, m));
    if (!ms.length) break;
    for (const m of ms) out.push(...coin(c, br, m));
  }
  return out;
}

/** Midnight: fights of past nights still open are counted; ours is lost by forfeit (returns true). */
export function brDay(c: Career, br: Bracket): { lines: string[]; forfeit: boolean } {
  const out: string[] = [];
  let forfeit = false;
  for (let k = 0; k < 6 && !br.done; k++) {
    brAdvance(br);
    const r = br.rounds.findIndex((R, i) => br.nights[i] < c.day && R.some((m) => !m.w));
    if (r < 0) break;
    for (const m of br.rounds[r]) {
      if (m.w) continue;
      if (brOurs(br, m)) {
        forfeit = true;
        out.push(...brDecide(c, br, m, m.a === br.ours ? m.b : m.a, 'forfeit'));
      } else out.push(...coin(c, br, m));
    }
  }
  return { lines: out, forfeit };
}

export function brBet(c: Career, br: Bracket, r: number, i: number, on: string, stake: number): string {
  const m = br.rounds[r]?.[i];
  if (!m || m.w) return 'Этот бой уже решён';
  if (c.money < stake) return 'Не хватает денег';
  if (br.bets.some((b) => b.r === r && b.i === i)) return 'На этот бой ставка уже есть';
  const [ka, kb] = brCoef(c, br, m);
  const k = on === m.a ? ka : kb;
  c.money -= stake;
  br.bets.push({ r, i, on, stake, k });
  return `Ставка $${stake} на ${short(brPerson(c, br, on))} ×${k.toFixed(2)}: выигрыш $${Math.round(stake * k)}`;
}

/** Where ours finished: 1 the winner, 2 the final lost, 0 out earlier (or not in it). */
export function brPlace(br: Bracket): number {
  const fin = br.rounds[2]?.[0];
  if (!br.ours) return 0;
  if (fin?.w) return fin.w === br.ours ? 1 : brOurs(br, fin) ? 2 : 0;
  return 0;
}
