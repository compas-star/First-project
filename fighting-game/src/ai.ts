import * as THREE from 'three';
import { MOVE_BY_ID, type Move } from './moves';
import type { Fighter, Sim } from './sim';
import {
  updatePlan, planDistance, planEagerness, planComboBonus, moveWeight, bodyBias, feintChance, counterBonus,
  type Reaction,
} from './brain';

// Fighter AI. Two entry points:
//  - react(): a reflex, runs once per enemy action as soon as the fighter can
//    perceive it (reactDelay after it starts). Picks parry, counter, dodge,
//    dash or block depending on how much time is left before the blow lands.
//  - think(): planning, runs every ~0.2 / mindSpeed world seconds.
//
// Technique (skill) shapes the plan. A technical fighter stands just outside
// the enemy's reach, steps in with a lunge, strikes clean and steps out. An
// untrained one walks into close range and throws wide swings.

const d = new THREE.Vector3();
const fwd = new THREE.Vector3();

/** Weight of a move for this fighter: clean moves need technique, wild ones do not. */
function styleWeight(f: Fighter, m: Move): number {
  const k = m.style === 'clean' ? 0.25 + f.tech : Math.max(0.03, 1.2 - 1.8 * f.tech);
  return f.weightOf(m) * k * moveWeight(f, m);
}

function pickStyled(f: Fighter, sim: Sim, list: Move[]): Move {
  const total = list.reduce((s, m) => s + styleWeight(f, m), 0);
  let r = sim.rng() * total;
  for (const m of list) {
    r -= styleWeight(f, m);
    if (r <= 0) return m;
  }
  return list[list.length - 1];
}

function sideStep(sim: Sim, f: Fighter): { dir: THREE.Vector3; left: boolean } {
  const left = sim.rng() < 0.5;
  return { dir: new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(left ? 1 : -1), left };
}

/** The opponent remembers how I answer his strikes. */
function noted(f: Fighter, r: Reaction): void {
  f.enemy.mem.oppReact[r]++;
}

export function react(f: Fighter, e: Fighter, sim: Sim): void {
  const ea = e.action;
  if (!ea || (ea.kind !== 'attack' && ea.kind !== 'slam') || e.state !== 'ok') return;
  if (f.handledThreat === ea.id) return;
  // Reaction time varies from blow to blow, so a slightly slower fighter still catches some.
  const jitter = 0.65 + 0.7 * (((Math.sin(ea.id * 12.9898 + f.team * 78.233) * 43758.5453) % 1 + 1) % 1);
  if (sim.t < ea.startW + f.reactDelay * jitter) return;
  f.handledThreat = ea.id;

  d.subVectors(e.pos, f.pos).setY(0);
  const dist = d.length();
  d.divideScalar(Math.max(1e-6, dist));
  const tti = ea.impactW - sim.t;

  if (ea.kind === 'slam') {
    if (dist > sim.waveRadius(e) || f.action) return;
    if (sim.ready(f, 'dash') && tti > 0.03 / f.body) {
      sim.use(f, 'dash');
      sim.startAction(f, 'dash', { dur: 0.3, dir: d.clone().negate() });
      f.say('рывком от волны');
    } else if (tti > 0.1 / f.body) {
      sim.startAction(f, 'dodge', { dur: 0.35, dir: d.clone().negate(), pose: 'dodgeBack' });
      f.say('отскакиваю от волны');
    }
    return;
  }

  const m = ea.move!;
  const activeEnd = ea.startW + (ea.dur * m.active[1]) / e.body;
  if (sim.t >= activeEnd || ea.hitDone) return;
  if (dist > sim.attackRange(e, m) + ea.lunge + 0.5) return;

  const own = f.action;
  if (own && own.kind !== 'block') {
    if (own.kind !== 'attack') return;
    const early = own.t < own.dur * own.move!.active[0] * 0.6;
    if (!early || sim.rng() > f.tech * 0.7) {
      noted(f, 'none');
      f.say('размен');
      return;
    }
    f.action = null;
    f.combo = null;
  }

  // Parry: needs the power and a moment to meet the blow.
  if (sim.ready(f, 'parry') && tti > 0.04 / f.body && sim.rng() < 0.45 + 0.5 * f.tech) {
    sim.use(f, 'parry');
    noted(f, 'parry');
    sim.startAction(f, 'parry', { dur: Math.max(0.3, tti * f.body + 0.12) });
    f.say(`парирую ${m.name}`);
    return;
  }

  // Counter: land a strike before theirs connects.
  const counters = sim
    .usableMoves(f)
    .filter((c) => f.windupOf(c) * 1.15 < tti && dist <= sim.attackRange(f, c) + c.lunge * f.scale * 0.8);
  if (counters.length) {
    const roomy = tti > f.windupOf(MOVE_BY_ID.jab) * 3;
    const want = 0.2 + 0.55 * f.p.aggression * f.tech + (roomy ? 0.35 : 0) + counterBonus(f);
    if (sim.rng() < want) {
      noted(f, 'counter');
      const strongest = counters.reduce((a, b) => (b.power > a.power ? b : a));
      sim.startAction(f, 'attack', { move: strongest });
      f.say(`вижу ${m.name} → ${strongest.name} первым`);
      return;
    }
  }

  if (sim.ready(f, 'dash') && tti > 0.03 / f.body && sim.rng() < 0.5) {
    sim.use(f, 'dash');
    const { dir } = sideStep(sim, f);
    sim.startAction(f, 'dash', { dur: 0.2, dir });
    noted(f, 'slip');
    f.say('рывок в сторону');
    return;
  }

  if (tti > 0.1 / f.body && sim.rng() < 0.3 + 0.65 * f.tech) {
    if (m.dodge === 'back') {
      noted(f, 'back');
      sim.startAction(f, 'dodge', { dur: 0.3, dir: d.clone().negate(), pose: 'dodgeBack' });
      f.say(`отскок от ${m.name}`);
    } else {
      const { dir, left } = sideStep(sim, f);
      noted(f, 'slip');
      sim.startAction(f, 'dodge', { dur: 0.28, dir, pose: left ? 'dodgeL' : 'dodgeR' });
      f.say(`уклон от ${m.name}`);
    }
    return;
  }

  if (tti > 0.05 / f.body && sim.rng() < 0.4 + 0.6 * f.tech) {
    sim.startAction(f, 'block', { dur: 0.5 });
    noted(f, 'block');
    f.say('блок');
    return;
  }

  noted(f, 'none');
  f.say('не успеваю!');
}

/** Say something only when it changes, so the bubble does not flicker. */
function intent(f: Fighter, text: string): void {
  if (f.thought !== text) f.say(text);
}

function pickZone(f: Fighter, e: Fighter, sim: Sim, m: Move): 'head' | 'body' | 'leg' {
  const z = m.zones;
  if (z.length === 1) return z[0];
  if (z.includes('head') && z.includes('body')) {
    // Go to the body more when the guard is up.
    const guardUp = e.action?.kind === 'block' ? 0.35 : 0;
    return sim.rng() < f.style.bodyLove + guardUp + bodyBias(f) ? 'body' : 'head';
  }
  return z[Math.floor(sim.rng() * z.length)];
}

/** Closest the two bodies should come: legs and hips must not run into each other. */
export function minGap(f: Fighter, e: Fighter): number {
  return f.radius + e.radius + 0.3 * Math.max(f.scale, e.scale);
}

export function think(f: Fighter, e: Fighter, sim: Sim): void {
  if (sim.winner) return;
  if (f.action && f.action.kind !== 'block') return;

  d.subVectors(e.pos, f.pos).setY(0);
  const dist = d.length();
  d.divideScalar(Math.max(1e-6, dist));

  if (f.action?.kind === 'block') {
    if (e.action?.kind === 'attack') return;
    f.action = null;
  }

  // Circling direction and pace change now and then, not every decision.
  if (sim.t >= f.nextCircleW) {
    f.circleDir = sim.rng() < 0.5 ? -1 : 1;
    f.circleSpeed = (0.15 + 0.35 * f.tech) * (0.4 + sim.rng());
    f.nextCircleW = sim.t + (1 + 2.5 * sim.rng()) / f.mind;
  }
  f.flank = false;

  if (e.state !== 'ok') {
    f.wantDist = 1.6 * f.scale + e.radius;
    intent(f, e.state === 'ko' ? 'победа' : 'жду, пока встанет');
    return;
  }

  if (sim.t >= f.nextPlanW) {
    updatePlan(f, e, sim);
    f.nextPlanW = sim.t + (1.5 + sim.rng()) / f.mind;
  }

  const tech = f.tech;
  const ratio = f.body / e.body;
  const behind = e.forward(fwd).dot(d) > 0.3;
  const jab = MOVE_BY_ID.jab;
  const myRange = sim.attackRange(f, jab);
  const enemyRange = sim.attackRange(e, jab) + jab.lunge * e.scale;
  // How far a lunge can carry the fighter into range.
  const lungeMax = (0.15 + 0.6 * tech) * f.scale;
  // Technical fighters wait at the edge of the enemy's reach, brawlers want to be close.
  const outside = Math.max(enemyRange + 0.1 * f.scale, myRange + 0.05);
  const gap = minGap(f, e);
  const pref = Math.max(
    gap + 0.1 * f.scale,
    THREE.MathUtils.lerp(myRange * 0.6, outside, tech) * f.disc.range * planDistance(f),
  );
  f.wantDist = pref;

  if (sim.ready(f, 'shockwave') && dist < sim.waveRadius(f) * 0.75 && sim.rng() < 0.45) {
    sim.use(f, 'shockwave');
    sim.startAction(f, 'slam', { dur: 0.75 });
    f.say('ударная волна');
    return;
  }

  if (sim.t < f.exitUntilW) {
    intent(f, 'выхожу под углом');
    return;
  }

  const usable = sim.usableMoves(f);
  const options = usable.filter((m) => {
    const r = sim.attackRange(f, m);
    return dist - r * 0.85 <= lungeMax && dist >= r * (m.style === 'wild' ? 0.3 : 0.5);
  });
  const ea = e.action;
  const punish = ea?.kind === 'attack' && ea.t > ea.dur * ea.move!.active[1];
  let eager = (0.15 + 0.7 * f.p.aggression + (behind ? 0.3 : 0) + (ratio > 2 ? 0.2 : 0) + (punish ? 0.5 * tech : 0)) * planEagerness(f, punish);
  // Right after a feint: if he bit (dodging, blocking, recovering), go now.
  const bit = sim.t < f.baitUntilW && !!e.action && ['dodge', 'block', 'parry', 'stagger', 'attack'].includes(e.action.kind);
  if (bit) eager += 0.9;
  // A technician does not like trading while standing in the pocket.
  if (tech > 0.5 && dist < pref - 0.3 * f.scale) eager *= 0.5;
  if (options.length && sim.rng() < eager) {
    const m = pickStyled(f, sim, options);
    const r = sim.attackRange(f, m);
    // Step in far enough to land, never so far as to walk into the enemy.
    const lunge = Math.min(Math.max(m.lunge * f.scale, dist - r * 0.85 + 0.05), Math.max(0, dist - gap));
    const zone = pickZone(f, e, sim, m);
    if (!bit && m.path && sim.rng() < feintChance(f)) {
      sim.startAction(f, 'attack', { move: m, lunge: lunge * 0.4, zone, feint: true });
      f.say(`финт: ${m.name}`);
      return;
    }
    sim.startAction(f, 'attack', { move: m, lunge, zone });
    const stepIn = lunge > m.lunge * f.scale + 0.1;
    const where = zone === 'body' ? ' в корпус' : zone === 'leg' ? ' по ноге' : '';
    f.say(
      bit ? `ловлю на финте: ${m.name}` : behind ? `${m.name} в спину` : punish ? `наказываю: ${m.name}${where}` : stepIn ? `выпад: ${m.name}${where}` : `${m.name}${where}`,
    );
    // Longer combinations for aggressive fighters; each fighter has a habit and the plan adds its own.
    const len = Math.round(f.style.comboLen * (0.5 + f.p.aggression) * (0.5 + sim.rng())) + planComboBonus(f);
    f.comboLeft = Math.max(0, len - 1);
    return;
  }

  if (sim.ready(f, 'dash') && dist > pref + 1.2 * f.scale && sim.rng() < 0.6) {
    sim.use(f, 'dash');
    const go = Math.max(0.1, Math.min(0.35, (dist - pref) / (f.stride * 5 * 0.8)));
    sim.startAction(f, 'dash', { dur: go, dir: d.clone() });
    f.say('рывок');
    return;
  }

  // Inside the enemy's reach a careful fighter sometimes keeps the guard up in advance.
  if (dist < enemyRange && (e.body > f.body * 1.2 || f.plan === 'survive') && sim.rng() < 0.25 + 0.4 * tech) {
    sim.startAction(f, 'block', { dur: 0.45 });
    f.wantDist = pref + 0.3 * f.scale;
    f.say('держу защиту');
    return;
  }
  if (f.hp < 30 && f.p.aggression < 0.5) {
    f.wantDist = pref + 1.2 * f.scale;
    intent(f, 'отступаю');
    return;
  }

  if (ratio >= 2.5 && f.p.aggression > 0.3 && !behind) {
    f.flank = true;
    intent(f, 'захожу за спину');
    return;
  }
  if (tech > 0.6 && Math.abs(dist - pref) < 0.2 * f.scale && sim.rng() < 0.15) {
    // Feint: a short pressure step to draw a reaction.
    f.wantDist = pref - 0.3 * f.scale;
    intent(f, 'финт');
    return;
  }
  if (dist > pref + 0.3 * f.scale) intent(f, tech > 0.5 ? 'подхожу на дистанцию' : 'лезу в драку');
  else intent(f, tech > 0.5 ? 'работаю на дистанции' : 'ищу момент');
}
