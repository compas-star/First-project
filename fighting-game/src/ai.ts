import * as THREE from 'three';
import { MOVES, MOVE_BY_ID, type Move } from './moves';
import type { Fighter, Sim } from './sim';

// Fighter AI. Two entry points:
//  - react(): a reflex, runs once per enemy attack as soon as the fighter can
//    perceive it (reactDelay after it starts). Picks counter, dodge or block
//    depending on how much time is left before the blow lands.
//  - think(): planning, runs every ~0.2 / mindSpeed world seconds.

const d = new THREE.Vector3();
const fwd = new THREE.Vector3();

function pickWeighted(sim: Sim, list: Move[]): Move {
  const total = list.reduce((s, m) => s + m.weight, 0);
  let r = sim.rng() * total;
  for (const m of list) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return list[list.length - 1];
}

function windup(f: Fighter, m: Move): number {
  return (m.duration * m.active[0]) / f.body;
}

export function react(f: Fighter, e: Fighter, sim: Sim): void {
  const ea = e.action;
  if (!ea || ea.kind !== 'attack' || e.state !== 'ok') return;
  if (f.handledThreat === ea.id) return;
  // Reaction time varies from blow to blow, so a slightly slower fighter still catches some.
  const jitter = 0.65 + 0.7 * (((Math.sin(ea.id * 12.9898 + f.team * 78.233) * 43758.5453) % 1 + 1) % 1);
  if (sim.t < ea.startW + f.reactDelay * jitter) return;
  f.handledThreat = ea.id;

  const m = ea.move!;
  const activeEnd = ea.startW + (m.duration * m.active[1]) / e.body;
  if (sim.t >= activeEnd || ea.hitDone) return;

  d.subVectors(e.pos, f.pos).setY(0);
  const dist = d.length();
  d.divideScalar(Math.max(1e-6, dist));
  if (dist > sim.attackRange(e, m) + m.lunge * e.scale + 0.5) return;

  const own = f.action;
  if (own && own.kind !== 'block') {
    if (own.kind !== 'attack') return;
    const early = own.t < own.dur * own.move!.active[0] * 0.6;
    if (!early || sim.rng() > f.p.skill * 0.7) {
      f.say('размен');
      return;
    }
    f.action = null;
    f.combo = null;
  }

  const tti = ea.impactW - sim.t;

  // Counter: land a strike before theirs connects.
  const counters = MOVES.filter(
    (c) => windup(f, c) * 1.15 < tti && dist <= sim.attackRange(f, c) + c.lunge * f.scale * 0.8,
  );
  if (counters.length) {
    const roomy = tti > windup(f, MOVE_BY_ID.jab) * 3;
    const want = 0.2 + 0.55 * f.p.aggression * f.p.skill + (roomy ? 0.35 : 0);
    if (sim.rng() < want) {
      const strongest = counters.reduce((a, b) => (b.power > a.power ? b : a));
      sim.startAction(f, 'attack', { move: strongest });
      f.say(`вижу ${m.name} → ${strongest.name} первым`);
      return;
    }
  }

  if (tti > 0.1 / f.body && sim.rng() < 0.3 + 0.65 * f.p.skill) {
    if (m.dodge === 'back') {
      sim.startAction(f, 'dodge', { dur: 0.3, dir: d.clone().negate(), pose: 'dodgeBack' });
      f.say(`отскок от ${m.name}`);
    } else {
      const left = sim.rng() < 0.5;
      const side = new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(left ? 1 : -1);
      sim.startAction(f, 'dodge', { dur: 0.28, dir: side, pose: left ? 'dodgeL' : 'dodgeR' });
      f.say(`уклон от ${m.name}`);
    }
    return;
  }

  if (tti > 0.05 / f.body) {
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

  const ratio = f.body / e.body;
  const behind = e.forward(fwd).dot(d) > 0.3;

  const inReach = MOVES.filter((m) => dist <= sim.attackRange(f, m) + m.lunge * f.scale * 0.8);
  const eager = 0.2 + 0.7 * f.p.aggression + (behind ? 0.3 : 0) + (ratio > 2 ? 0.2 : 0);
  if (inReach.length && sim.rng() < eager) {
    const m = pickWeighted(sim, inReach);
    sim.startAction(f, 'attack', { move: m });
    f.say(behind ? `${m.name} в спину` : m.name);
    if (sim.rng() < f.p.aggression * 0.55) f.combo = pickWeighted(sim, MOVES);
    return;
  }

  const close = sim.attackRange(f, MOVE_BY_ID.jab);
  // Inside the enemy's reach a careful fighter sometimes keeps the guard up in advance.
  const enemyReach = sim.attackRange(e, MOVE_BY_ID.jab) + MOVE_BY_ID.jab.lunge * e.scale;
  if (dist < enemyReach && e.body > f.body * 1.2 && sim.rng() < 0.25 + 0.4 * f.p.skill) {
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

  if (dist > close * 0.95) {
    if (ratio >= 2.5 && f.p.aggression > 0.3) {
      const target = e.pos.clone().addScaledVector(e.forward(fwd), -(e.radius + close * 0.7));
      f.moveDir.subVectors(target, f.pos).setY(0).normalize();
      f.moveSpeed = f.stride * 1.1;
      f.say('захожу за спину');
    } else {
      f.moveDir.copy(d);
      f.moveSpeed = f.stride;
      f.say('сближаюсь');
    }
  } else if (dist < (f.radius + e.radius) * 1.3) {
    f.moveDir.copy(d).negate();
    f.moveSpeed = f.stride * 0.6;
    f.say('разрываю дистанцию');
  } else {
    const sign = sim.rng() < 0.5 ? 1 : -1;
    f.moveDir.set(d.z * sign, 0, -d.x * sign);
    f.moveSpeed = f.stride * 0.5;
    f.say('ищу момент');
  }
}
