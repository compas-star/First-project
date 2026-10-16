import * as THREE from 'three';
import { MOVE_BY_ID, type Move } from './moves';
import type { DodgePose, Fighter, Sim } from './sim';
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
  if (!ea || (ea.kind !== 'attack' && ea.kind !== 'slam') || e.state !== 'ok') return;
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

  if (tti > 0.05 / f.body && sim.rng() < 0.4 + 0.6 * f.tech + f.gene('block')) {
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
  const chance = 0.15 + 0.4 * T + 0.8 * E + f.gene('dodge') + bonus;
  if (sim.rng() > Math.min(0.96, chance)) return false;

  const back = d.clone().negate();
  const leftDir = new THREE.Vector3(d.z, 0, -d.x);
  // Facing each other, his left hand or foot comes in on my right side.
  const from: 'l' | 'r' = m.limb[0] === 'l' ? 'r' : 'l';
  const away: 'l' | 'r' = from === 'l' ? 'r' : 'l';
  const curved = m.path === 'hook' || m.path === 'swing' || m.path === 'over' || m.path === 'round' || !!m.spin || /Elbow/.test(m.limb);
  const rising = m.path === 'upper' || /Knee/.test(m.limb);
  const zone = ea.zone;
  type Pick = { pose: DodgePose; dir: THREE.Vector3; into?: boolean; say: string };
  const side = (s: 'l' | 'r', k: number) => leftDir.clone().multiplyScalar(s === 'l' ? k : -k);
  let good: Pick[];
  let bad: Pick | null = null;
  if (zone === 'leg') {
    good = [{ pose: 'dodgeBack', dir: back, say: 'убрал ногу' }];
  } else if (zone === 'body') {
    good = [{ pose: 'dodgeBack', dir: back, say: 'отскок' }, { pose: 'pull', dir: back.clone().multiplyScalar(0.5), say: 'отклон' }];
    if (curved) bad = { pose: from === 'l' ? 'slipL' : 'slipR', dir: side(from, 0.35), into: true, say: 'уклон' };
  } else if (rising) {
    good = [{ pose: 'pull', dir: back.clone().multiplyScalar(0.35), say: 'отклон назад' }, { pose: 'dodgeBack', dir: back, say: 'отскок' }];
    bad = { pose: 'duck', dir: new THREE.Vector3(), into: true, say: 'нырок' };
  } else if (curved) {
    good = [
      { pose: 'duck', dir: new THREE.Vector3(), say: 'нырок' },
      { pose: away === 'l' ? 'weaveL' : 'weaveR', dir: side(away, 0.25).addScaledVector(back, 0.1), say: 'ушёл нырком' },
      { pose: 'pull', dir: back.clone().multiplyScalar(0.35), say: 'отклон' },
    ];
    bad = { pose: from === 'l' ? 'slipL' : 'slipR', dir: side(from, 0.35), into: true, say: 'уклон' };
  } else {
    const s0: 'l' | 'r' = sim.rng() < 0.5 ? 'l' : 'r';
    good = [
      { pose: s0 === 'l' ? 'slipL' : 'slipR', dir: side(s0, 0.35), say: 'уклон' },
      { pose: 'pull', dir: back.clone().multiplyScalar(0.35), say: 'отклон' },
    ];
  }
  const right = 0.5 + 0.45 * Math.min(1, 0.5 * T + 0.7 * E);
  const pick = bad && sim.rng() > right ? bad : good[Math.floor(sim.rng() * good.length)];
  noted(f, pick.pose === 'dodgeBack' || pick.pose === 'pull' ? 'back' : 'slip');
  const act = sim.startAction(f, 'dodge', { dur: (0.34 - 0.08 * E) * (pick.pose === 'dodgeBack' ? 1 : 0.9), dir: pick.dir, pose: pick.pose });
  act.into = !!pick.into;
  if (!ea.reply) f.answerUntilW = ea.impactW + (0.3 + 0.3 * T + 0.4 * E) / f.mind;
  f.say(`${pick.say}: ${m.name}`);
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

  let go: 'bait' | 'punish' | 'answer' | 'entry' | 'meet' | null = null;
  if (bit) go = 'bait';
  else if (opening && sim.rng() < (0.25 + 0.3 * tech) * Math.min(1.3, planEagerness(f, true) * 0.6)) go = 'punish';
  else if (answering && sim.rng() < 0.12 + 0.2 * tech + (sim.t - f.lastDodgeW < 0.6 ? 0.6 * f.p.evasion : 0)) go = 'answer';
  else if (behind && sim.rng() < 0.5) go = 'punish';
  else if (sim.t >= f.initiativeW) go = f.stamina < 0.12 ? null : 'entry';
  else if (steppedIn && sim.rng() < 0.08 + 0.3 * tech) go = 'meet';
  if (go === null && sim.t >= f.initiativeW) f.initiativeW = sim.t + waitTime(f, sim);

  if (go === 'punish' && ea) f.punishedId = ea.id;
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
    const len = Math.round(go === 'entry' || go === 'bait' ? Math.min(patience > 0.45 ? 1 + (sim.rng() < 0.6 ? 1 : 0) : 3, base * (1 - 0.6 * patience)) : 1);
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
