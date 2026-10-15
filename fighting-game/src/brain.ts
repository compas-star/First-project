import type { Move } from './moves';
import type { Fighter, Sim } from './sim';

// The fighter's mind above reflexes, in two layers.
//
// Strategy: a game plan for the next few seconds (work the jab from range,
// press to the edge, wait and counter, chop the legs, go to the body, survive,
// finish). Every plan is scored from the situation and from what the fighter
// has learned about this opponent; the best one wins, with some loyalty to the
// current plan so he does not flip every second.
//
// Memory: what works and what does not. Which of my strikes land, how the
// opponent reacts to them (slips to the side, steps back, blocks, parries,
// counters, or does nothing), what he throws and how often. Tactics read this:
// a fighter who keeps slipping gets hooks and body shots, one who blocks gets
// kicks and feints, one who counters gets baited.

export type PlanId = 'outbox' | 'pressure' | 'counter' | 'legs' | 'body' | 'survive' | 'finish';

export const PLAN_NAME: Record<PlanId, string> = {
  outbox: 'работаю джебом издалека',
  pressure: 'давлю',
  counter: 'жду атаку, отвечаю',
  legs: 'бью по ногам',
  body: 'работаю по корпусу',
  survive: 'выживаю',
  finish: 'добиваю',
};

/** Short labels for the HUD. */
export const PLAN_SHORT: Record<PlanId, string> = {
  outbox: 'план: дистанция',
  pressure: 'план: давление',
  counter: 'план: контратаки',
  legs: 'план: по ногам',
  body: 'план: по корпусу',
  survive: 'план: выжить',
  finish: 'план: добить',
};

export type Reaction = 'slip' | 'back' | 'block' | 'parry' | 'counter' | 'none';

export interface Memory {
  /** My strikes: thrown and landed clean, by move id. */
  tries: Record<string, number>;
  hits: Record<string, number>;
  /** How the opponent reacted to my strikes. */
  oppReact: Record<Reaction, number>;
  /** What the opponent throws, and when (world times of his attacks). */
  oppMoves: Record<string, number>;
  oppAttackTimes: number[];
}

export function makeMemory(): Memory {
  return {
    tries: {},
    hits: {},
    oppReact: { slip: 0, back: 0, block: 0, parry: 0, counter: 0, none: 0 },
    oppMoves: {},
    oppAttackTimes: [],
  };
}

/**
 * What carries into the next fight with the same opponent: everything but the
 * timing, faded so recent fights count more than old ones.
 */
export function fadeMemory(m: Memory, k = 0.6): Memory {
  const scale = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).map(([key, v]) => [key, Math.round(v * k * 100) / 100]));
  return {
    tries: scale(m.tries),
    hits: scale(m.hits),
    oppReact: scale(m.oppReact) as Record<Reaction, number>,
    oppMoves: scale(m.oppMoves),
    oppAttackTimes: [],
  };
}

/** Strike that has landed best on this opponent so far, if any. */
export function bestStrike(m: Memory): string | null {
  let best: string | null = null;
  let br = 0;
  for (const [id, t] of Object.entries(m.tries)) {
    if (t < 2) continue;
    const r = (m.hits[id] ?? 0) / t;
    if (r > br) {
      br = r;
      best = id;
    }
  }
  return best;
}

function rate(mem: Memory, r: Reaction): number {
  const total = Object.values(mem.oppReact).reduce((a, b) => a + b, 0);
  return total < 3 ? 0 : mem.oppReact[r] / total;
}

/** Opponent attacks per second over the last few seconds. */
function oppPace(mem: Memory, now: number): number {
  const recent = mem.oppAttackTimes.filter((t) => now - t < 6);
  mem.oppAttackTimes = recent;
  return recent.length / 6;
}

const LOW_KICKS = ['lowkick', 'calfkick'];
const BODY_MOVES = ['bodykick', 'rknee', 'teep'];
const RANGE_MOVES = ['jab', 'cross', 'teep', 'leadkick'];
const PRESSURE_MOVES = ['hook', 'rhook', 'uppercut', 'luppercut', 'rknee', 'lelbow', 'relbow', 'bodykick'];
const POWER_MOVES = ['overhand', 'headkick', 'uppercut', 'rhook', 'superman', 'spinkick'];
const SIDE_CATCHERS = ['hook', 'rhook', 'bodykick', 'leadkick', 'lowkick'];

/** Re-plans for the next stretch of the fight. */
export function updatePlan(f: Fighter, e: Fighter, sim: Sim): void {
  const mem = f.mem;
  const tech = f.tech;
  const aggr = f.p.aggression;
  const pace = oppPace(mem, sim.t) / e.body;
  const myReach = f.scale;
  const hisReach = e.scale;
  const hasLowKicks = LOW_KICKS.some((id) => f.weightOf({ id } as Move) > 0);
  const legDamage = (e.limbDmg.lLeg + e.limbDmg.rLeg) / (2 * e.limbLimit);
  const lowKickRate = LOW_KICKS.reduce((s, id) => s + (mem.hits[id] ?? 0), 0) / Math.max(1, LOW_KICKS.reduce((s, id) => s + (mem.tries[id] ?? 0), 0));

  // Nobody landing anything for a while: someone has to take the initiative.
  const lull = Math.min(1, Math.max(0, (sim.t - sim.lastHitW) * f.mind - 3) / 4);
  const score: Record<PlanId, number> = {
    outbox: 0.15 + 0.4 * tech + (myReach - hisReach) * 2 - (aggr - 0.5) * 0.4 + (f.body > e.body * 1.2 ? 0.1 : 0) - lull * 0.2,
    pressure:
      0.2 + 0.55 * aggr + (e.hp < f.hp - 15 ? 0.25 : 0) + (f.mass > e.mass * 1.2 ? 0.15 : 0) + rate(mem, 'back') * 0.4 + lull * 0.45,
    counter: 0.1 + 0.35 * tech + (f.mind > e.mind * 1.3 ? 0.3 : 0) + Math.min(0.4, pace * 0.5) - aggr * 0.2 - lull * 0.4,
    legs: hasLowKicks ? 0.25 + legDamage * 0.9 + lowKickRate * 0.5 + rate(mem, 'block') * 0.3 + (e.body > f.body ? 0.1 : 0) : 0,
    body: 0.2 + f.style.bodyLove * 0.6 + rate(mem, 'block') * 0.6 + rate(mem, 'slip') * 0.3,
    survive: f.hp < 35 && e.hp > f.hp + 15 ? 0.6 + (1 - aggr) * 0.4 : 0,
    finish: e.hp < 25 || e.dazed ? 0.75 + aggr * 0.3 : 0,
  };
  if (f.broken.lArm && f.broken.rArm) score.legs += 0.5;
  // Learned taste for each plan; a plan that does not apply stays off.
  for (const id of Object.keys(score) as PlanId[]) if (score[id] > 0) score[id] += f.gene(`p.${id}`);
  // Loyalty to the current plan, and a bit of personality noise.
  score[f.plan] += 0.15;
  let best: PlanId = f.plan;
  let bestScore = -Infinity;
  for (const id of Object.keys(score) as PlanId[]) {
    const s = score[id] + sim.rng() * 0.12;
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  if (best !== f.plan) {
    f.plan = best;
    f.say(`план: ${PLAN_NAME[best]}`);
  }
}

/** Preferred distance multiplier for the plan. */
export function planDistance(f: Fighter): number {
  return Math.exp(f.gene('dist')) * { outbox: 1.12, pressure: 0.85, counter: 1.05, legs: 1.0, body: 0.92, survive: 1.35, finish: 0.88 }[f.plan];
}

/** How eager to attack, multiplier. */
export function planEagerness(f: Fighter, punish: boolean): number {
  return Math.exp(f.gene('eager')) * planEagernessBase(f, punish);
}

function planEagernessBase(f: Fighter, punish: boolean): number {
  switch (f.plan) {
    case 'counter':
      return punish ? 2.5 : 0.6;
    case 'pressure':
      return 1.3;
    case 'finish':
      return 1.6;
    case 'survive':
      return punish ? 1.2 : 0.45;
    case 'outbox':
      return 1;
    default:
      return 1;
  }
}

/** Extra combination length. */
export function planComboBonus(f: Fighter): number {
  return (f.plan === 'finish' ? 2 : f.plan === 'pressure' ? 1 : f.plan === 'outbox' ? -1 : 0) + f.gene('combo');
}

/**
 * Weight multiplier for a strike: what the plan wants, what has been landing
 * against this opponent, and what beats his habits.
 */
export function moveWeight(f: Fighter, m: Move): number {
  const mem = f.mem;
  let k = Math.exp(f.gene(`m.${m.id}`));
  switch (f.plan) {
    case 'outbox':
      if (RANGE_MOVES.includes(m.id)) k *= 2;
      break;
    case 'pressure':
      if (PRESSURE_MOVES.includes(m.id)) k *= 1.6;
      break;
    case 'legs':
      if (LOW_KICKS.includes(m.id)) k *= 4;
      break;
    case 'body':
      if (BODY_MOVES.includes(m.id)) k *= 2;
      break;
    case 'finish':
      if (POWER_MOVES.includes(m.id)) k *= 1.8;
      break;
  }
  // He slips to the side: hooks and kicks catch a slipping head.
  if (rate(mem, 'slip') > 0.35 && SIDE_CATCHERS.includes(m.id)) k *= 1.6;
  // He blocks: kicks go round the guard.
  if (rate(mem, 'block') > 0.4 && m.limb.endsWith('Foot')) k *= 1.4;
  // Learn what lands: after a few tries, lean toward strikes that connect.
  const tries = mem.tries[m.id] ?? 0;
  if (tries >= 3) {
    const r = ((mem.hits[m.id] ?? 0) + 1) / (tries + 2);
    k *= Math.min(2, Math.max(0.4, r / 0.35));
  }
  return k;
}

/** Chance to aim a punch at the body instead of the head. */
export function bodyBias(f: Fighter): number {
  return (f.plan === 'body' ? 0.45 : 0) + (rate(f.mem, 'block') > 0.4 ? 0.25 : 0) + f.gene('body');
}

/** Chance to throw a feint instead of a real strike. */
export function feintChance(f: Fighter): number {
  if (f.tech < 0.4) return 0;
  return f.gene('feint') + 0.05 + 0.5 * (rate(f.mem, 'counter') + rate(f.mem, 'parry')) + 0.15 * rate(f.mem, 'block') + (f.plan === 'counter' ? 0.1 : 0);
}

/** Extra chance to counter when the plan is to counter. */
export function counterBonus(f: Fighter): number {
  return (f.plan === 'counter' ? 0.35 : f.plan === 'survive' ? 0.1 : 0) + f.gene('counter');
}
