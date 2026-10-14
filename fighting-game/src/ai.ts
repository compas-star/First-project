import * as THREE from 'three';
import { MOVE_BY_ID, type Move } from './moves';
import type { Fighter, Sim } from './sim';

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
  return m.weight * k;
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
      f.say('размен');
      return;
    }
    f.action = null;
    f.combo = null;
  }

  // Parry: needs the power and a moment to meet the blow.
  if (sim.ready(f, 'parry') && tti > 0.04 / f.body && sim.rng() < 0.45 + 0.5 * f.tech) {
    sim.use(f, 'parry');
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
    const want = 0.2 + 0.55 * f.p.aggression * f.tech + (roomy ? 0.35 : 0);
    if (sim.rng() < want) {
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
    f.say('рывок в сторону');
    return;
  }

  if (tti > 0.1 / f.body && sim.rng() < 0.3 + 0.65 * f.tech) {
    if (m.dodge === 'back') {
      sim.startAction(f, 'dodge', { dur: 0.3, dir: d.clone().negate(), pose: 'dodgeBack' });
      f.say(`отскок от ${m.name}`);
    } else {
      const { dir, left } = sideStep(sim, f);
      sim.startAction(f, 'dodge', { dur: 0.28, dir, pose: left ? 'dodgeL' : 'dodgeR' });
      f.say(`уклон от ${m.name}`);
    }
    return;
  }

  if (tti > 0.05 / f.body && sim.rng() < 0.4 + 0.6 * f.tech) {
    sim.startAction(f, 'block', { dur: 0.5 });
    f.say('блок');
    return;
  }

  f.say('не успеваю!');
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

  if (e.state !== 'ok') {
    const keep = 1.6 * f.scale + e.radius;
    f.moveDir.copy(d).multiplyScalar(dist < keep ? -1 : 0);
    f.moveSpeed = f.stride * 0.6;
    f.say(e.state === 'ko' ? 'победа' : 'жду, пока встанет');
    return;
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
  const pref = THREE.MathUtils.lerp(myRange * 0.6, outside, tech);
  const band = 0.15 * f.scale;

  if (sim.ready(f, 'shockwave') && dist < sim.waveRadius(f) * 0.75 && sim.rng() < 0.45) {
    sim.use(f, 'shockwave');
    sim.startAction(f, 'slam', { dur: 0.75 });
    f.moveDir.set(0, 0, 0);
    f.say('ударная волна');
    return;
  }

  if (sim.t < f.exitUntilW) {
    f.moveDir.copy(d).negate();
    f.moveSpeed = f.stride * 1.15;
    f.say('выхожу из дистанции');
    return;
  }

  const usable = sim.usableMoves(f);
  const options = usable.filter((m) => {
    const r = sim.attackRange(f, m);
    return dist - r * 0.85 <= lungeMax && dist >= r * (m.style === 'wild' ? 0.3 : 0.5);
  });
  const ea = e.action;
  const punish = ea?.kind === 'attack' && ea.t > ea.dur * ea.move!.active[1];
  let eager = 0.15 + 0.7 * f.p.aggression + (behind ? 0.3 : 0) + (ratio > 2 ? 0.2 : 0) + (punish ? 0.5 * tech : 0);
  // A technician does not like trading while standing in the pocket.
  if (tech > 0.5 && dist < pref - 2 * band) eager *= 0.5;
  if (options.length && sim.rng() < eager) {
    const m = pickStyled(f, sim, options);
    const r = sim.attackRange(f, m);
    const lunge = Math.max(m.lunge * f.scale, dist - r * 0.85 + 0.05);
    sim.startAction(f, 'attack', { move: m, lunge });
    const stepIn = lunge > m.lunge * f.scale + 0.1;
    f.say(behind ? `${m.name} в спину` : punish ? `наказываю: ${m.name}` : stepIn ? `выпад: ${m.name}` : m.name);
    if (sim.rng() < f.p.aggression * 0.55) f.combo = pickStyled(f, sim, usable);
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
  if (dist < enemyRange && e.body > f.body * 1.2 && sim.rng() < 0.25 + 0.4 * tech) {
    sim.startAction(f, 'block', { dur: 0.45 });
    f.moveDir.copy(d).negate();
    f.moveSpeed = f.stride * 0.5;
    f.say('держу защиту');
    return;
  }
  if (f.hp < 30 && f.p.aggression < 0.5 && sim.rng() < 0.35) {
    f.moveDir.copy(d).negate();
    f.moveSpeed = f.stride * 0.8;
    f.say('отступаю');
    return;
  }

  if (dist > pref + band) {
    if (ratio >= 2.5 && f.p.aggression > 0.3) {
      const target = e.pos.clone().addScaledVector(e.forward(fwd), -(e.radius + myRange * 0.7));
      f.moveDir.subVectors(target, f.pos).setY(0).normalize();
      f.moveSpeed = f.stride * 1.1;
      f.say('захожу за спину');
    } else {
      f.moveDir.copy(d);
      f.moveSpeed = f.stride * (tech > 0.5 ? 0.7 : 1);
      f.say(tech > 0.5 ? 'подхожу на дистанцию' : 'лезу в драку');
    }
  } else if (dist < pref - band) {
    f.moveDir.copy(d).negate();
    f.moveSpeed = f.stride * 0.8;
    f.say(tech > 0.5 ? 'держу дистанцию' : 'разрываю дистанцию');
  } else if (tech > 0.6 && sim.rng() < 0.3) {
    // Feint: a half step in to draw a reaction.
    f.moveDir.copy(d);
    f.moveSpeed = f.stride * 0.9;
    f.say('финт');
  } else {
    const sign = sim.rng() < 0.5 ? 1 : -1;
    f.moveDir.set(d.z * sign, 0, -d.x * sign);
    f.moveSpeed = f.stride * (0.3 + 0.4 * tech);
    f.say(tech > 0.5 ? 'кружу на дистанции' : 'ищу момент');
  }
}
