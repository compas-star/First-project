import * as THREE from 'three';
import { MOVE_BY_ID, type Move } from './moves';
import type { Fighter, Sim } from './sim';
import {
  updatePlan, planDistance, planEagerness, planComboBonus, moveWeight, bodyBias, feintChance, counterBonus,
  type Reaction,
} from './brain';
import { readOpponent, fitOf, zoneBias, type Read } from './tactics';

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
  const k = m.style === 'clean' ? 0.45 + 0.8 * f.tech : Math.max(0.03, 1.2 - 1.8 * f.tech);
  // Nobody throws the same thing over and over: a strike just used is less likely again.
  const recent = f.recentMoves;
  const again = recent[recent.length - 1] === m.id ? 0.35 : recent.includes(m.id) ? 0.7 : 1;
  return f.weightOf(m) * k * moveWeight(f, m) * again;
}

/** Picks a strike: style and habits, times how well it fits what he sees right now. */
function pickStyled(f: Fighter, sim: Sim, list: Move[], read: Read): { m: Move; why: string | null } {
  const scored = list.map((m) => {
    const fit = fitOf(f, m, read, sim.attackRange(f, m));
    return { m, why: fit.why, w: styleWeight(f, m) * Math.pow(fit.k, 1.5) };
  });
  const total = scored.reduce((s, x) => s + x.w, 0);
  let r = sim.rng() * total;
  for (const x of scored) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return scored[scored.length - 1];
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
  // Coming out of one slip he can go straight into the next (bob and weave through a
  // combination), and the end of a stagger is time enough to get the hands back up.
  // If no new defence is chosen, what he was doing goes on.
  const own = f.action;
  const E = f.p.evasion;
  const free =
    (own?.kind === 'dodge' && own.t > own.dur * (0.55 - 0.3 * E)) ||
    (own?.kind === 'stagger' && own.t > own.dur * (0.75 - 0.35 * Math.max(E, f.tech)));
  if (free) f.action = null;
  reactInner(f, e, sim);
  if (free && f.action === null) f.action = own;
}

function reactInner(f: Fighter, e: Fighter, sim: Sim): void {
  const ea = e.action;
  if (!ea || (ea.kind !== 'attack' && ea.kind !== 'slam' && ea.kind !== 'shoot') || e.state !== 'ok') return;
  if (f.handledThreat === ea.id) return;
  // Reaction time varies from blow to blow, so a slightly slower fighter still catches some.
  const jitter = 0.65 + 0.7 * (((Math.sin(ea.id * 12.9898 + f.team * 78.233) * 43758.5453) % 1 + 1) % 1);
  if (sim.t < ea.startW + f.reactDelay * jitter) return;
  // Busy reeling or recovering: the blow stays on his mind until he can do something about it.
  const busy = f.action && f.action.kind !== 'block' && f.action.kind !== 'attack';
  if (busy && ea.kind === 'attack') return;
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

  // A shot at the legs: knee him as he comes in, or throw the legs back and sprawl.
  if (ea.kind === 'shoot') {
    if (f.action && f.action.kind !== 'block') return;
    const g = sim.gripOf(f);
    const knee = MOVE_BY_ID.rknee;
    if (f.canUse(knee) && f.weightOf(knee) > 0 && tti > f.windupOf(knee) * 0.9 && sim.rng() < 0.1 + 0.3 * f.tech) {
      sim.startAction(f, 'attack', { move: knee, reply: true, zone: 'head' });
      f.say('колено навстречу');
      return;
    }
    if (tti > 0.06 / f.body && sim.rng() < 0.15 + 0.6 * g.shoot + 0.2 * f.tech + 0.15 * f.p.evasion) {
      sim.startAction(f, 'sprawl', { dur: 0.7 });
      f.say('спрол');
      return;
    }
    noted(f, 'none');
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
    if (!ea.reply) f.answerUntilW = ea.impactW + (0.3 + 0.3 * f.tech) / f.mind;
    f.say(`парирую ${m.name}`);
    return;
  }

  // Catch a kick to the body: trap the leg, then sweep the standing one.
  const kickToBody = (m.limb === 'lFoot' || m.limb === 'rFoot') && m.path !== 'low' && ea.zone !== 'head' && !m.spin;
  if (kickToBody && !f.broken.lArm && !f.broken.rArm && tti > 0.08 / f.body && sim.rng() < 0.2 + 0.5 * f.tech + f.gene('catch')) {
    noted(f, 'parry');
    sim.startAction(f, 'catch', { dur: tti * f.body + 0.3 });
    f.say(`ловлю ${m.name}`);
    return;
  }

  // An elusive fighter goes to his head movement first, then counters off it.
  if (sim.rng() < f.p.evasion * 0.7 && tryDodge(f, e, m, ea, sim, tti, 0.15)) return;

  // Counter: land a strike before theirs connects.
  const counters = sim
    .usableMoves(f)
    .filter((c) => f.windupOf(c) * 1.15 < tti && dist <= sim.attackRange(f, c) + c.lunge * f.scale * 0.8);
  if (counters.length) {
    const roomy = tti > f.windupOf(MOVE_BY_ID.jab) * 3;
    const want = 0.2 + 0.55 * f.p.aggression * f.tech + (roomy ? 0.35 : 0) + counterBonus(f);
    if (sim.rng() < want) {
      noted(f, 'counter');
      // Not simply the hardest blow: the one that goes where his strike opened him.
      const read = readOpponent(f, e, sim.t);
      const score = (c: Move) => c.power * fitOf(f, c, read, sim.attackRange(f, c)).k * (0.5 + f.weightOf(c));
      const strongest = counters.reduce((a, b) => (score(b) > score(a) ? b : a));
      sim.startAction(f, 'attack', { move: strongest, reply: true });
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

  if (tryDodge(f, e, m, ea, sim, tti, 0)) return;

  if (tti > 0.05 / f.body && sim.rng() < 0.4 + 0.6 * f.tech + f.gene('block') + (f.dazed ? 0.35 : 0)) {
    sim.startAction(f, 'block', { dur: 0.5 });
    if (!ea.reply) f.answerUntilW = ea.impactW + (0.3 + 0.3 * f.tech) / f.mind;
    noted(f, 'block');
    f.say('блок');
    return;
  }

  noted(f, 'none');
  f.say('не успеваю!');
}

/**
 * Slip, duck, weave, pull back or step out, picked for the blow that is coming.
 * A hook is ducked or weaved under, an uppercut or a knee is pulled away from,
 * a straight shot is slipped. The wrong choice moves the head into the blow;
 * technique and elusiveness make it rarer. Needs time: a blow seen too late
 * cannot be dodged, which is where perception speed comes in.
 */
function tryDodge(f: Fighter, e: Fighter, m: Move, ea: NonNullable<Fighter['action']>, sim: Sim, tti: number, bonus: number): boolean {
  const E = f.p.evasion;
  const T = f.tech;
  if (tti < (0.1 - 0.04 * E) / f.body) return false;
  const chance = (0.15 + 0.4 * T + 0.8 * E + f.gene('dodge') + bonus) * (f.dazed ? 0.5 : 1);
  if (sim.rng() > Math.min(0.96, chance)) return false;

  const s = f.scale;
  const zone = ea.zone;
  const back = d.clone().negate();
  const leftDir = new THREE.Vector3(d.z, 0, -d.x);
  const up = new THREE.Vector3(0, 1, 0);

  // Body and leg shots: the trunk cannot slip, so step out of range.
  if (zone !== 'head') {
    noted(f, 'back');
    const act = sim.startAction(f, 'dodge', { dur: tti * f.body + 0.22, dir: back, pose: 'dodgeBack' });
    act.dodgeOff = new THREE.Vector3(0, 0, -0.12 * s);
    act.reachT = Math.min(0.18, tti * f.body * 0.7);
    act.delayT = Math.max(0, tti * f.body - act.reachT - 0.04);
    if (!ea.reply) f.answerUntilW = ea.impactW + (0.3 + 0.3 * T + 0.4 * E) / f.mind;
    f.say(`отскок: ${m.name}`);
    return true;
  }

  // Where the blow travels as it arrives at the head: a straight shot along the
  // line from his shoulder, a hook or a round kick across from his side, an
  // uppercut or a knee from below, an overhand from above and the side.
  const limbSide = m.limb[0] as 'l' | 'r';
  const joint = e.rag.byName[/Foot|Knee/.test(m.limb) ? (limbSide === 'l' ? 'lThigh' : 'rThigh') : limbSide === 'l' ? 'lUpper' : 'rUpper'].body.translation();
  const head = f.rag.byName.head.body.translation();
  const toHead = new THREE.Vector3(head.x - joint.x, head.y + 0.12 * s - joint.y, head.z - joint.z).normalize();
  // His left comes in on my right: travelling toward my left.
  const across = leftDir.clone().multiplyScalar(limbSide === 'l' ? 1 : -1);
  const curved = m.path === 'hook' || m.path === 'swing' || m.path === 'round' || !!m.spin || /Elbow/.test(m.limb);
  const rising = m.path === 'upper' || /Knee/.test(m.limb);
  const truth = new THREE.Vector3();
  if (rising) truth.copy(up).multiplyScalar(0.8).addScaledVector(d, -0.6);
  else if (m.path === 'over') truth.copy(up).multiplyScalar(-0.5).addScaledVector(d, -0.6).addScaledVector(across, 0.5);
  else if (curved) truth.copy(across).addScaledVector(d, -0.45);
  else truth.copy(toHead);
  truth.normalize();

  // Reading the line is a skill: technique, elusiveness and a quick mind read it truer.
  const err = 0.9 * (1 - 0.45 * T - 0.45 * E) / Math.sqrt(Math.max(1, f.mind / e.body));
  const seenDir = truth
    .clone()
    .add(new THREE.Vector3(sim.rng() - 0.5, sim.rng() - 0.5, sim.rng() - 0.5).multiplyScalar(2 * err))
    .normalize();

  // Head moves he can make, each with how costly it is; take the one that gets the head
  // furthest off the line he sees, then make it just big enough, no more.
  const opts: { off: THREE.Vector3; cost: number; say: string }[] = [
    { off: leftDir.clone().multiplyScalar(0.26 * s), cost: 1, say: 'уклон' },
    { off: leftDir.clone().multiplyScalar(-0.26 * s), cost: 1, say: 'уклон' },
    { off: up.clone().multiplyScalar(-0.3 * s).addScaledVector(d, 0.06 * s), cost: 1.12, say: 'нырок' },
    { off: back.clone().multiplyScalar(0.24 * s).addScaledVector(up, 0.02 * s), cost: 1.05, say: 'отклон' },
    { off: up.clone().multiplyScalar(-0.22 * s).addScaledVector(leftDir, 0.18 * s), cost: 1.1, say: 'нырок в сторону' },
    { off: up.clone().multiplyScalar(-0.22 * s).addScaledVector(leftDir, -0.18 * s), cost: 1.1, say: 'нырок в сторону' },
  ];
  const clear = (o: THREE.Vector3, dir: THREE.Vector3) => o.clone().addScaledVector(dir, -o.dot(dir)).length();
  let best = opts[0];
  let bestScore = -1;
  for (const o of opts) {
    const sc = clear(o.off, seenDir) / o.cost;
    if (sc > bestScore) {
      bestScore = sc;
      best = o;
    }
  }
  const need = 0.26 * s;
  const off = best.off.clone().multiplyScalar(THREE.MathUtils.clamp((need * (1.15 + 0.2 * E)) / Math.max(1e-3, clear(best.off, seenDir)), 0.6, 1.5));
  // Misread: the head hardly leaves the real line and goes toward where the blow comes from.
  const into = clear(off, truth) < need * 0.55 && off.dot(truth) < -0.03 * s;

  noted(f, best.say === 'отклон' ? 'back' : 'slip');
  // In the fighter's own frame: x to his left, y up, z forward.
  const local = new THREE.Vector3(off.dot(leftDir), off.y, off.dot(d));
  // Stay under it until the blow has gone past, not just until it arrives.
  const passes = (ea.startW + (ea.dur * m.active[1]) / e.body - sim.t) * f.body;
  const act = sim.startAction(f, 'dodge', { dur: passes + 0.24 + 0.1 * (1 - E), dir: off.clone().setY(0).multiplyScalar(1.2 / s) });
  act.dodgeOff = local;
  // Get there just before the blow does, no sooner than needed and no later.
  act.reachT = THREE.MathUtils.clamp(tti * f.body * 0.75, 0.06, 0.16 - 0.05 * E);
  // Wait for it: move only at the last moment, when the blow is committed and cannot follow.
  act.delayT = Math.max(0, tti * f.body - act.reachT - 0.02);
  act.into = into;
  if (!ea.reply) f.answerUntilW = ea.impactW + (0.3 + 0.3 * T + 0.4 * E) / f.mind;
  f.say(`${best.say}: ${m.name}`);
  return true;
}

/** Say something only when it changes, so the bubble does not flicker. */
function intent(f: Fighter, text: string): void {
  if (f.thought !== text) f.say(text);
}

function pickZone(f: Fighter, e: Fighter, sim: Sim, m: Move, read?: Read): 'head' | 'body' | 'leg' {
  const z = m.zones;
  if (z.length === 1) return z[0];
  if (z.includes('head') && z.includes('body')) {
    // Go to the body more when the guard is up.
    const guardUp = e.action?.kind === 'block' ? 0.35 : 0;
    return sim.rng() < f.style.bodyLove + guardUp + bodyBias(f) + (read ? zoneBias(read) * f.tech : 0) ? 'body' : 'head';
  }
  return z[Math.floor(sim.rng() * z.length)];
}

/**
 * 0..1: how long he stands and reads the opponent before going in. Technique
 * and a waiting plan make him patient; aggression, a pressing plan, a lead on
 * points and fresh legs make him go sooner.
 */
function patienceOf(f: Fighter): number {
  const p = 0.2 + 0.75 * f.tech - 0.55 * (f.p.aggression - 0.5);
  return THREE.MathUtils.clamp(p / Math.pow(planEagerness(f, false), 0.8), 0.05, 1);
}

/** World seconds until he takes the initiative again. */
function waitTime(f: Fighter, sim: Sim): number {
  // In a long fight with rounds he paces himself.
  const pace = sim.rules.roundLen ? 1.5 : 1;
  return ((0.8 + 5.5 * patienceOf(f)) * (0.6 + 0.8 * sim.rng()) * (1 + 1.2 * f.fatigue) * pace) / f.mind;
}

/**
 * Footwork changes now and then, so the fight does not look like the same
 * circle forever: circle, work a rhythm in and out, stalk and cut him off,
 * stand still and read, or snap off at an angle.
 */
function chooseFootwork(f: Fighter, e: Fighter, sim: Sim): void {
  const tech = f.tech;
  const opts: [Fighter['moveMode'], number][] = [
    ['circle', 1],
    ['rhythm', 0.3 + tech * f.disc.bounce],
    ['stalk', 0.2 + f.p.aggression + (f.plan === 'pressure' || f.plan === 'finish' ? 1 : 0)],
    ['still', 0.2 + 0.6 * patienceOf(f)],
    ['pivot', 0.5 * tech],
  ];
  const total = opts.reduce((a, [, w]) => a + w, 0);
  let r = sim.rng() * total;
  let mode: Fighter['moveMode'] = 'circle';
  for (const [m, w] of opts) {
    r -= w;
    if (r <= 0) {
      mode = m;
      break;
    }
  }
  f.moveMode = mode;
  f.circleDir = sim.rng() < 0.5 ? -1 : 1;
  f.bounceK = 1;
  let dur = 1 + 2.5 * sim.rng();
  switch (mode) {
    case 'circle':
      f.circleSpeed = (0.15 + 0.35 * tech) * (0.4 + sim.rng());
      break;
    case 'rhythm':
      f.circleSpeed = 0.05 + 0.1 * sim.rng();
      f.bounceK = 2.5;
      break;
    case 'stalk':
      // Walk him down and cut off the way he is circling.
      f.circleDir = -e.circleDir as 1 | -1;
      f.circleSpeed = 0.25 + 0.2 * sim.rng();
      break;
    case 'still':
      f.circleSpeed = 0.03;
      f.bounceK = 0.3;
      dur = 0.8 + 1.5 * sim.rng();
      break;
    case 'pivot':
      f.circleSpeed = 0.9 + 0.3 * sim.rng();
      dur = 0.35 + 0.25 * sim.rng();
      break;
  }
  f.nextCircleW = sim.t + dur / f.mind;
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
    chooseFootwork(f, e, sim);
  }
  f.flank = false;

  // He is down: where the rules allow it, jump on him and finish it on the floor.
  if (e.state === 'down' && !e.out && !sim.grapple && f.disc.groundAllowed && (e.daze > 0.3 || sim.gripOf(f).ground > 0.5) && f.stamina > 0.15) {
    f.wantDist = 0;
    if (dist < f.radius + e.radius + 0.6 * f.scale) sim.pounce(f);
    else intent(f, 'добиваю в партере');
    return;
  }
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
  const lungeMax = (0.15 + 0.6 * tech) * f.scale * Math.exp(f.gene('lunge'));
  // How long he is willing to stand and read the other man before going in.
  const patience = patienceOf(f);
  // Measuring distance: just outside the enemy's reach. A brawler stands close.
  const outside = Math.max(enemyRange + (0.15 + 0.35 * patience) * f.scale, myRange + 0.05);
  const gap = minGap(f, e);
  const pref = Math.max(
    gap + 0.1 * f.scale,
    THREE.MathUtils.lerp(myRange * 0.6, outside, Math.min(1, patience * 1.4)) * f.disc.range * planDistance(f),
  );
  f.wantDist = pref - (f.moveMode === 'stalk' ? 0.12 * f.scale : 0);
  if (f.initiativeW === 0) f.initiativeW = sim.t + waitTime(f, sim) * 0.6;

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
  const heAttacks = ea?.kind === 'attack' && !ea.feint;
  // He went first: answer him before thinking about my own entry.
  if (heAttacks) f.initiativeW = Math.max(f.initiativeW, sim.t + (0.4 + 1.2 * patience) / f.mind);
  // A blow that missed leaves him open, once; an answer that missed ends the exchange instead.
  const punish = ea?.kind === 'attack' && !ea.reply && f.punishedId !== ea.id && (ea.t > ea.dur * ea.move!.active[1] || ea.overcommit > 0);
  const opening = punish || ea?.kind === 'stagger' || e.dazed;
  // Right after a feint: if he bit (dodging, blocking, recovering), go now.
  const bit = sim.t < f.baitUntilW && !!ea && ['dodge', 'block', 'parry', 'stagger', 'attack'].includes(ea.kind);
  const answering = sim.t < f.answerUntilW;
  // He walked into my range without attacking.
  const steppedIn = !heAttacks && dist < myRange * 0.95;
  const tired = f.fatigue;
  if (tired > 0.5) f.wantDist = pref + 0.25 * tired * f.scale;

  // He is hurt: no more waiting, go and finish it. Hurt myself: cover up and get away.
  const finishing = e.dazed && !f.dazed && f.stamina > 0.1;
  if (finishing) {
    if (f.plan !== 'finish') {
      f.plan = 'finish';
      f.say('он поплыл, добиваю');
    }
    f.wantDist = gap + 0.05 * f.scale;
    f.initiativeW = Math.min(f.initiativeW, sim.t);
  } else if (f.dazed) {
    f.plan = 'survive';
    f.wantDist = pref + 0.9 * f.scale;
  }

  let go: 'bait' | 'punish' | 'answer' | 'entry' | 'meet' | null = null;
  if (bit) go = 'bait';
  else if (opening && sim.rng() < (0.25 + 0.3 * tech) * Math.min(1.3, planEagerness(f, true) * 0.6)) go = 'punish';
  else if (answering && sim.rng() < 0.12 + 0.2 * tech + (sim.t - f.lastDodgeW < 0.6 ? 0.6 * f.p.evasion : 0)) go = 'answer';
  else if (behind && sim.rng() < 0.5) go = 'punish';
  else if (sim.t >= f.initiativeW) go = f.stamina < 0.12 ? null : 'entry';
  else if (steppedIn && sim.rng() < 0.08 + 0.3 * tech) go = 'meet';
  if (go === null && sim.t >= f.initiativeW) f.initiativeW = sim.t + waitTime(f, sim);

  if (go === 'punish' && ea) f.punishedId = ea.id;
  // A wrestler goes for the legs: best when the other man is busy throwing.
  const shoot = sim.gripOf(f).shoot;
  if (go && shoot >= 0.3 && !sim.grapple && dist < gap + 1.5 * f.scale && f.stamina > 0.2 &&
      sim.rng() < shoot * (0.22 + (heAttacks || punish ? 0.3 : 0))) {
    sim.startAction(f, 'shoot', { dur: 0.8 });
    f.initiativeW = sim.t + waitTime(f, sim);
    f.say('проход в ноги');
    return;
  }
  // Going in from a distance where only a long kick reaches: usually step closer first,
  // so the whole arsenal is in play, instead of always opening with the same long strike.
  const few = options.length > 0 && options.length < usable.length * 0.4;
  if (go === 'entry' && few && sim.rng() < 0.65) options.length = 0;
  if (go && options.length) {
    const read = readOpponent(f, e, sim.t);
    const { m, why } = pickStyled(f, sim, options, read);
    const r = sim.attackRange(f, m);
    // Step in far enough to land, never so far as to walk into the enemy.
    // A check hook steps back out of the way while it lands; everything else steps in.
    const lunge = m.lunge < 0 ? m.lunge * f.scale : Math.min(Math.max(m.lunge * f.scale, dist - r * 0.85 + 0.05), Math.max(0, dist - gap));
    const zone = pickZone(f, e, sim, m, read);
    if (go === 'entry') f.initiativeW = sim.t + waitTime(f, sim);
    if (go === 'entry' && m.path && sim.rng() < feintChance(f)) {
      sim.startAction(f, 'attack', { move: m, lunge: lunge * 0.4, zone, feint: true });
      f.say(`финт: ${m.name}`);
      return;
    }
    sim.startAction(f, 'attack', { move: m, lunge, zone, reply: go === 'answer' || go === 'punish' || go === 'meet' });
    f.answerUntilW = 0;
    const where = m.name.includes('корпус') ? '' : zone === 'body' ? ' в корпус' : zone === 'leg' ? ' по ноге' : '';
    const label = {
      bait: `ловлю на финте: ${m.name}`,
      punish: behind ? `${m.name} в спину` : `наказываю: ${m.name}${where}`,
      answer: `отвечаю: ${m.name}${where}`,
      entry: lunge > m.lunge * f.scale + 0.1 ? `вхожу: ${m.name}${where}` : `${m.name}${where}`,
      meet: `встречаю: ${m.name}${where}`,
    }[go];
    f.say(why ? `${label} (${why})` : label);
    // Entries come in combinations; answers and counters are short.
    const base = f.style.comboLen * (0.5 + f.p.aggression) * (0.5 + sim.rng()) + planComboBonus(f);
    // A patient fighter throws short, clean combinations; a brawler keeps swinging.
    const len = finishing
      ? 3 + Math.floor(sim.rng() * 3)
      : Math.round(go === 'entry' || go === 'bait' ? Math.min(patience > 0.45 ? 1 + (sim.rng() < 0.6 ? 1 : 0) : 3, base * (1 - 0.6 * patience)) : 1);
    f.comboLeft = Math.max(0, len - 1);
    return;
  }
  if (go === 'entry') {
    // Too far to reach with a lunge: close the distance first.
    f.wantDist = Math.max(gap, myRange * 0.85);
    f.initiativeW = sim.t + 0.25 / f.mind;
    intent(f, 'сокращаю дистанцию');
    return;
  }
  // Reading him: now and then a feint to draw a reaction, or a probing jab.
  if (patience > 0.3 && Math.abs(dist - pref) < 0.3 * f.scale && sim.rng() < 0.07 + 0.05 * tech) {
    const jabLike = options.find((m) => m.id === 'jab' || m.id === 'teep' || m.id === 'leadkick');
    if (jabLike && sim.rng() < 0.5) {
      sim.startAction(f, 'attack', { move: jabLike, lunge: 0.05, zone: 'head', feint: true });
      f.say(`прощупываю: ${jabLike.name}`);
      return;
    }
    const kind = sim.rng();
    if (kind < 0.4) {
      f.wantDist = pref - 0.3 * f.scale;
      intent(f, 'финт шагом');
    } else {
      f.twitch = kind < 0.75 ? 'shoulder' : 'level';
      f.twitchW = f.clock;
      intent(f, f.twitch === 'shoulder' ? 'финт плечом' : 'финт уровнем');
    }
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
  if (tired > 0.6) {
    intent(f, 'устал, перевожу дыхание');
    return;
  }
  if (dist > pref + 0.3 * f.scale) intent(f, patience > 0.4 ? 'подхожу на дистанцию' : 'лезу в драку');
  else intent(f, patience > 0.4 ? 'изучаю его' : 'ищу момент');
}
