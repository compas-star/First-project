import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { FighterParams } from './config';
import { MOVES, MOVE_BY_ID, FOLLOW, type Move, type Striker } from './moves';
import { makeFeet, resetFeet, updateFeet, legOverride, anchorFeet, measureBalance, type Foot } from './feet';
import { DISCIPLINE_BY_ID, type Discipline, type Stance } from './disciplines';
import { punchOverride } from './strikes';
import { POWER_BY_ID, type PowerId } from './powers';
import { react, think } from './ai';
import { clonePose, STANCE, PELVIS_Y, type Pose } from './rig';
import { targetPose } from './pose';
import {
  createRagdoll, drive, partPoint, segSegDist, collisionGroups, q, v,
  GROUP_ENV, STRIKERS, type Part, type Ragdoll,
} from './physics';

// The fight simulation. Time model:
//  - The world runs on world seconds (gravity, falling bodies, crates).
//  - Each fighter's own actions run on local seconds = world seconds × bodySpeed,
//    and its muscles are stiffer by the same factor, so a body ×10 swings ten
//    times faster for real: its fists carry ten times the speed.
//  - Perception: a fighter notices an enemy's action 0.17 / mindSpeed world
//    seconds after it starts and plans every ~0.2 / mindSpeed world seconds.
//
// Bodies are Rapier rigid bodies. A hit is a real contact between the striking
// fist or foot and a body part; damage comes from the impact speed and the part hit.

export const G = 9.81;
export const ARENA_R = 12;
export const FLOOR_R = 13.5;

export type ActionKind = 'attack' | 'dodge' | 'block' | 'stagger' | 'getup' | 'victory' | 'parry' | 'dash' | 'slam';

export type Limb = 'lArm' | 'rArm' | 'lLeg' | 'rLeg';

const LIMB_OF_PART: Partial<Record<string, Limb>> = {
  lUpper: 'lArm', lFore: 'lArm', rUpper: 'rArm', rFore: 'rArm',
  lThigh: 'lLeg', lShin: 'lLeg', rThigh: 'rLeg', rShin: 'rLeg',
};
const LIMB_OF_STRIKER: Record<Striker, Limb> = {
  lHand: 'lArm', rHand: 'rArm', lElbow: 'lArm', rElbow: 'rArm',
  lFoot: 'lLeg', rFoot: 'rLeg', lKnee: 'lLeg', rKnee: 'rLeg',
};
/** Which foot a strike takes off the floor. */
const FOOT_OF_STRIKER: Partial<Record<Striker, 0 | 1>> = { lFoot: 0, lKnee: 0, rFoot: 1, rKnee: 1 };
export const LIMB_NAME: Record<Limb, string> = { lArm: 'левая рука', rArm: 'правая рука', lLeg: 'левая нога', rLeg: 'правая нога' };

export interface Action {
  kind: ActionKind;
  id: number;
  /** Elapsed local time. */
  t: number;
  /** Length in local time. */
  dur: number;
  startW: number;
  /** World time when an attack's strike window opens. */
  impactW: number;
  move?: Move;
  hitDone: boolean;
  dir: THREE.Vector3;
  pose?: 'dodgeL' | 'dodgeR' | 'dodgeBack';
  /** Facing when the action started; spinning techniques turn from here. */
  baseFacing: number;
  /** How far an attack steps in during its wind-up, meters. */
  lunge: number;
  /** Sloppiness of an untrained fighter: random joint offsets for this swing. */
  noise: Partial<Pose> | null;
  /** Aimed at the head or the body. */
  zone: 'head' | 'body' | 'leg';
  /** Miss distance of this particular blow (meters for a 1.8 m fighter). */
  jitter: THREE.Vector3;
  /** Fist position at the start of an aimed punch, in the body frame. */
  handStart: THREE.Vector3 | null;
}

/**
 * A fighter's own manner of moving, fixed for a given build. Two fighters with
 * the same numbers still look different.
 */
export interface FightStyle {
  /** How much the hips and shoulders turn into a blow. */
  twist: number;
  /** Constant small head and torso movement. */
  headMove: number;
  /** Bouncing on the feet. */
  bounce: number;
  /** Share of punches aimed at the body. */
  bodyLove: number;
  /** Faster or slower hands. */
  handSpeed: number;
  /** Typical combination length. */
  comboLen: number;
  /** Phases of the idle motion. */
  phase: [number, number, number];
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeStyle(p: FighterParams, team: number): FightStyle {
  const r = rng32(hashStr(`${p.name}|${team}|${p.height.toFixed(2)}|${p.weight.toFixed(0)}`));
  const tech = p.skill;
  return {
    twist: 0.7 + 0.6 * r(),
    headMove: (0.35 + 0.65 * r()) * (0.25 + 0.75 * tech),
    bounce: (0.3 + 0.7 * r()) * tech,
    bodyLove: 0.15 + 0.35 * r(),
    handSpeed: 0.9 + 0.2 * r(),
    comboLen: 1 + Math.round(r() * 2 + tech + p.aggression),
    phase: [r() * 6.28, r() * 6.28, r() * 6.28],
  };
}

export type FighterState = 'ok' | 'down' | 'ko';

export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let actionSeq = 1;

export class Fighter {
  readonly scale: number;
  readonly girth: number;
  readonly mass: number;
  readonly radius: number;
  readonly maxHp = 100;
  readonly maxPoise: number;
  rag!: Ragdoll;

  /** Pelvis position projected on the floor. */
  pos = new THREE.Vector3();
  /** Desired walking velocity in local m/s; physics tries to reach it. */
  self = new THREE.Vector3();
  /** Direction the fighter wants to face (yaw). */
  facing = 0;
  hp = 100;
  poise: number;
  state: FighterState = 'ok';
  action: Action | null = null;
  downLeft = 0;
  nextThinkW = 0;
  handledThreat = 0;
  moveDir = new THREE.Vector3();
  moveSpeed = 0;
  /** Footwork intent: distance to hold, and how to circle. */
  wantDist = 1;
  circleDir = 1;
  circleSpeed = 0.3;
  nextCircleW = 0;
  /** Go round behind the enemy instead of holding distance. */
  flank = false;
  /** Strikes left in the current combination. */
  comboLeft = 0;
  /** Own time, local seconds, drives the idle motion. */
  clock = 0;
  style: FightStyle;
  feet: [Foot, Foot] = makeFeet();
  /** Legs are placed by foot IK (standing), not by the pose. */
  legsIK = false;
  /** Where the body is heading to come to rest (capture point) and how far it is off the feet. */
  capture = new THREE.Vector3();
  balanceErr = 0;
  /** 0..1 how well balanced; low means the body can tip over. */
  stability = 1;
  /** Legs buckle (after a heavy blow) until this world time. */
  wobbleUntilW = 0;
  /** Rising from the floor: tilt of the body when the getup began and pelvis height. */
  getupTilt = new THREE.Quaternion();
  getupFromY = 0;
  walkPhase = 0;
  groundSpeed = 0;
  combo: Move | null = null;
  enemy!: Fighter;
  balance = 1;
  tone = 1;
  pose: Pose = clonePose(STANCE);
  topple = 0;
  prevVy = 0;
  strikePrev = new THREE.Vector3();
  strikeValid = false;
  koReason = '';
  /** Damage taken by each limb; past the limit the bone breaks. */
  limbDmg: Record<Limb, number> = { lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 };
  broken: Record<Limb, boolean> = { lArm: false, rArm: false, lLeg: false, rLeg: false };
  headDmg = 0;
  /** Concussed: perception drops by half until this world time. */
  dazedUntilW = 0;
  dazed = false;
  /** After a clean attack a technical fighter steps back out until this world time. */
  exitUntilW = 0;
  /** World time each active power is ready again. */
  readyAt: Partial<Record<PowerId, number>> = {};

  /** Latest decision, shown above the head. */
  thought = '';
  thoughtSeq = 0;
  thinkSeq = 0;
  hits = 0;

  constructor(
    readonly p: FighterParams,
    readonly team: 0 | 1,
  ) {
    this.scale = p.height / 1.8;
    this.mass = p.weight;
    this.girth = THREE.MathUtils.clamp(Math.sqrt(p.weight / (78 * this.scale ** 3)), 0.6, 2.2);
    this.radius = 0.22 * this.scale * this.girth;
    this.maxPoise = 28 * Math.sqrt(p.weight / 78);
    this.poise = this.maxPoise;
    this.style = makeStyle(p, team);
  }

  get body(): number {
    return this.p.bodySpeed;
  }

  get mind(): number {
    return (this.p.linkMind ? this.p.bodySpeed : this.p.mindSpeed) * (this.dazed ? 0.5 : 1);
  }

  get tech(): number {
    return this.p.skill;
  }

  has(id: PowerId): boolean {
    return this.p.powers.includes(id);
  }

  /** Damage a limb takes before the bone breaks. */
  get limbLimit(): number {
    return 45 * Math.sqrt(this.mass / 78) * (this.has('stone') ? 2.5 : 1);
  }

  get disc(): Discipline {
    return DISCIPLINE_BY_ID[this.p.discipline] ?? DISCIPLINE_BY_ID.mma;
  }

  get stance(): Stance {
    return this.disc.stance;
  }

  /** How much this fighter's style likes a strike; 0 = never used. */
  weightOf(m: Move): number {
    return this.disc.weights[m.id] ?? 0;
  }

  canUse(m: Move): boolean {
    return !this.broken[LIMB_OF_STRIKER[m.limb]];
  }

  /** Length of a move for this fighter in local seconds: poor technique telegraphs. */
  durOf(m: Move): number {
    return (m.duration * (1 + 0.35 * (1 - this.tech))) / (m.path ? this.style.handSpeed : 1);
  }

  /** World seconds from starting a move until it can hit. */
  windupOf(m: Move): number {
    return (this.durOf(m) * m.active[0]) / this.body;
  }

  /** World seconds between seeing an action start and becoming aware of it. */
  get reactDelay(): number {
    return 0.17 / this.mind;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Walking speed in local m/s, longer legs take longer steps. */
  get stride(): number {
    const legs = (this.broken.lLeg ? 0.6 : 1) * (this.broken.rLeg ? 0.6 : 1);
    return 2.6 * Math.sqrt(this.scale) * legs;
  }

  say(text: string): void {
    this.thought = text;
    this.thoughtSeq++;
  }

  busy(): boolean {
    return this.state !== 'ok' || (this.action !== null && this.action.kind !== 'block');
  }
}

export interface Crate {
  body: RAPIER.RigidBody;
  half: number;
  gone: boolean;
}

export type SimEvent =
  | { type: 'hit'; pos: THREE.Vector3; power: number; blocked: boolean; dmg: number; target: Fighter; fromBehind: boolean; zone: string; stone: boolean }
  | { type: 'land'; pos: THREE.Vector3; power: number }
  | { type: 'crash'; pos: THREE.Vector3; power: number }
  | { type: 'wave'; pos: THREE.Vector3; radius: number }
  | { type: 'break'; pos: THREE.Vector3; target: Fighter; limb: Limb }
  | { type: 'parry'; pos: THREE.Vector3; target: Fighter };

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const segA = new THREE.Vector3();
const segB = new THREE.Vector3();
const closest = new THREE.Vector3();
const bestPoint = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();

const ZONE_NAME: Record<string, string> = { head: 'в голову', body: 'в корпус', arm: 'в руку', leg: 'по ноге' };

export class Sim {
  t = 0;
  readonly world: RAPIER.World;
  readonly fighters: [Fighter, Fighter];
  readonly crates: Crate[] = [];
  readonly events: SimEvent[] = [];
  readonly rng: () => number;
  winner: Fighter | null = null;
  private eq = new RAPIER.EventQueue(true);
  private override: Partial<Record<string, THREE.Quaternion>> = {};
  private crateByCollider = new Map<number, Crate>();
  private partByCollider = new Map<number, { f: Fighter; part: Part }>();

  /** RAPIER.init() must have finished before a Sim is created. */
  constructor(red: FighterParams, blue: FighterParams, seed = 7) {
    this.rng = rng32(seed);
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });

    const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.5, FLOOR_R).setFriction(0.9).setCollisionGroups(collisionGroups(GROUP_ENV, 0xffff)),
      floor,
    );

    const a = new Fighter(red, 0);
    const b = new Fighter(blue, 1);
    a.enemy = b;
    b.enemy = a;
    const gap = 2.2 + (a.scale + b.scale) * 0.6;
    a.facing = 0;
    b.facing = Math.PI;
    this.fighters = [a, b];
    for (const f of this.fighters) {
      const z = f.team === 0 ? -gap / 2 : gap / 2;
      f.rag = createRagdoll(this.world, {
        scale: f.scale, girth: f.girth, weight: f.mass,
        spawn: new THREE.Vector3(0, 0, z), facing: f.facing, team: f.team,
      });
      for (const [h, part] of f.rag.colliders) this.partByCollider.set(h, { f, part });
      f.pos.set(0, 0, z);
      f.nextThinkW = 0.3 / f.mind;
      resetFeet(f);
    }
    this.layCrates();
  }

  dispose(): void {
    this.world.free();
    this.eq.free();
  }

  private addCrate(x: number, y: number, z: number, half: number, yaw: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw))
        .setCcdEnabled(true),
    );
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, half, half)
        .setMass(220 * (half * 2) ** 3)
        .setFriction(0.7)
        .setCollisionGroups(collisionGroups(GROUP_ENV, 0xffff))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const crate = { body, half, gone: false };
    this.crates.push(crate);
    this.crateByCollider.set(c.handle, crate);
  }

  private layCrates(): void {
    const spots: [number, number, number][] = [
      [6.5, 2.5, 0.45], [7.4, 3.4, 0.35], [6.6, 3.5, 0.3],
      [-7, -1.5, 0.5], [-7.8, -0.5, 0.35],
      [2, 8, 0.4], [1.1, 8.6, 0.3], [-3, -8.2, 0.45], [-2.0, -8.8, 0.3],
      [9, -5, 0.55], [-8.5, 5.5, 0.4], [-9.3, 6.2, 0.3],
    ];
    for (const [x, z, half] of spots) this.addCrate(x, half, z, half, this.rng() * Math.PI);
    this.addCrate(6.5, 0.9 + 0.3, 2.5, 0.3, 0.3);
    this.addCrate(-7, 1.0 + 0.32, -1.5, 0.32, 0.7);
  }

  /** Finest motion in the scene decides the physics step. */
  stepSize(): number {
    const fastest = Math.max(...this.fighters.map((f) => Math.max(f.body, f.mind)));
    return Math.max(1 / 10000, 1 / (200 * fastest));
  }

  /** Simulates up to worldDt seconds; returns how much was actually simulated. */
  advance(worldDt: number, maxSteps = 160): number {
    const h = this.stepSize();
    const n = Math.min(maxSteps, Math.ceil(worldDt / h - 1e-9));
    for (let i = 0; i < n; i++) this.step(h);
    return n * h;
  }

  step(h: number): void {
    this.t += h;
    for (const f of this.fighters) this.preStep(f, h);
    this.world.timestep = h;
    this.world.step(this.eq);
    this.eq.drainCollisionEvents((h1, h2, started) => {
      if (started) this.onContact(h1, h2);
    });
    for (const f of this.fighters) this.postStep(f, h);
    for (const c of this.crates) {
      if (!c.gone && c.body.translation().y < -30) {
        c.gone = true;
        c.body.setEnabled(false);
      }
    }
  }

  startAction(
    f: Fighter,
    kind: ActionKind,
    opts: { move?: Move; dur?: number; dir?: THREE.Vector3; pose?: Action['pose']; lunge?: number; zone?: 'head' | 'body' | 'leg' } = {},
  ): Action {
    const m = opts.move;
    // No two blows are quite the same: timing and aim vary a little, more without technique.
    const dur = m ? f.durOf(m) * (0.9 + 0.2 * this.rng()) : opts.dur ?? 0.3;
    const miss = 0.02 + 0.1 * (1 - f.tech);
    const jitter = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).multiplyScalar(2 * miss);
    let noise: Partial<Pose> | null = null;
    if (m && f.tech < 0.85) {
      const k = 1 - f.tech;
      const r = this.rng;
      noise = {
        lShS: (r() - 0.3) * 45 * k,
        rShS: (r() - 0.3) * 45 * k,
        lEl: r() * 40 * k,
        rEl: r() * 40 * k,
        spineTwist: (r() - 0.5) * 30 * k,
        spineLean: (r() - 0.5) * 16 * k,
        headPitch: -r() * 18 * k,
      };
    }
    const a: Action = {
      kind,
      id: actionSeq++,
      t: 0,
      dur,
      startW: this.t,
      impactW: m ? this.t + (dur * m.active[0]) / f.body : kind === 'slam' ? this.t + (dur * 0.55) / f.body : this.t,
      move: m,
      hitDone: false,
      dir: opts.dir ? opts.dir.clone() : new THREE.Vector3(),
      pose: opts.pose,
      baseFacing: f.facing,
      lunge: opts.lunge ?? (m ? m.lunge * f.scale : 0),
      noise,
      zone: opts.zone ?? (m ? m.zones[0] : 'head'),
      jitter,
      handStart: null,
    };
    f.action = a;
    f.strikeValid = false;
    return a;
  }

  attackRange(f: Fighter, m: Move): number {
    return m.reach * f.scale + f.enemy.radius;
  }

  ready(f: Fighter, id: PowerId): boolean {
    return f.has(id) && this.t >= (f.readyAt[id] ?? 0);
  }

  use(f: Fighter, id: PowerId): void {
    f.readyAt[id] = this.t + POWER_BY_ID[id].cooldown / f.body;
  }

  waveRadius(f: Fighter): number {
    return 3.2 * f.scale * (0.7 + 0.3 * Math.sqrt(f.p.strength));
  }

  usableMoves(f: Fighter): Move[] {
    return MOVES.filter((m) => f.canUse(m) && f.weightOf(m) > 0);
  }

  private knockDown(f: Fighter, why: string): void {
    f.stability = 0;
    f.state = f.hp <= 0 ? 'ko' : 'down';
    f.action = null;
    f.combo = null;
    f.balance = 0;
    f.self.set(0, 0, 0);
    f.downLeft = 0.8 + this.rng() * 0.5;
    f.topple = 0;
    if (f.state === 'down') f.say(why);
  }

  private preStep(f: Fighter, h: number): void {
    const dl = h * f.body;
    f.dazed = this.t < f.dazedUntilW;
    if (f.has('regen') && f.state !== 'ko') this.regenerate(f, dl);
    if (f.state === 'ok') {
      const getup = f.action?.kind === 'getup';
      f.balance = Math.min(1, f.balance + dl / (getup ? 0.6 : 0.3));
      f.tone = Math.min(1, f.tone + dl / 0.4);
      const legs = (f.broken.lLeg ? 0.6 : 1) * (f.broken.rLeg ? 0.6 : 1);
      f.poise = Math.min(f.maxPoise * legs, f.poise + 10 * dl);
      if (!this.winner) {
        react(f, f.enemy, this);
        if (this.t >= f.nextThinkW) {
          f.thinkSeq++;
          think(f, f.enemy, this);
          f.nextThinkW = this.t + (0.16 + this.rng() * 0.1) / f.mind;
        }
      }
      this.runAction(f, dl);

      const a = f.action;
      f.clock += dl;
      if (!a || a.kind === 'block' || a.kind === 'parry') this.footwork(f, dl, a ? 0.4 : 1);
      // Stay off the edge unless something throws you over it.
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r > ARENA_R - 1.5) {
        tmpB.set(f.pos.x / r, 0, f.pos.z / r);
        const out = f.self.dot(tmpB);
        if (out > 0) f.self.addScaledVector(tmpB, -out * Math.min(1, (r - (ARENA_R - 1.5)) / 1.5));
      }
      const lockTurn =
        (a?.kind === 'attack' && (a.t > a.dur * a.move!.active[0] * 0.5 || !!a.move!.spin)) || a?.kind === 'dash';
      if (a?.kind === 'attack' && a.move!.spin) {
        // Spinning technique: the whole body turns round through the strike.
        const u = Math.min(1, a.t / a.dur);
        f.facing = a.baseFacing + a.move!.spin * u * u * (3 - 2 * u);
      }
      if (!lockTurn && a?.kind !== 'victory') {
        tmpA.subVectors(f.enemy.pos, f.pos);
        const want = Math.atan2(tmpA.x, tmpA.z);
        let diff = want - f.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const maxTurn = 11 * dl;
        f.facing += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
      }
    } else {
      f.balance = 0;
      f.tone = f.state === 'ko' ? 0.06 : 0.15;
      f.self.set(0, 0, 0);
      if (f.state === 'down') {
        const lv = f.rag.pelvis.body.linvel();
        if (Math.hypot(lv.x, lv.y, lv.z) < 1.5 * Math.max(1, f.body)) f.downLeft -= dl;
        if (f.downLeft <= 0) {
          f.state = 'ok';
          f.poise = f.maxPoise;
          f.tone = 0.3;
          // Rise from the way the body is lying: the target pose starts tilted like the body
          // and turns upright, facing the enemy, while the hips come up.
          tmpA.subVectors(f.enemy.pos, f.pos);
          f.facing = Math.atan2(tmpA.x, tmpA.z);
          tmpQ.setFromAxisAngle(UP, f.facing).invert();
          f.getupTilt.copy(q(f.rag.pelvis.body.rotation(), tmpQ2)).multiply(tmpQ);
          f.getupFromY = f.rag.pelvis.body.translation().y;
          f.stability = 1;
          this.startAction(f, 'getup', { dur: 1.1 });
          f.say('встаю');
        }
      }
    }

    targetPose(f, f.pose);
    for (const k of Object.keys(this.override)) delete this.override[k];
    const aimed = f.state === 'ok' && f.action?.kind === 'attack' && punchOverride(f, f.action, this.override);
    const standing = f.state === 'ok' && !(f.action?.kind === 'getup' && f.action.t < f.action.dur * 0.8);
    if (standing && !f.legsIK) resetFeet(f);
    f.legsIK = standing;
    if (standing) {
      // A kick or knee takes its foot off the floor; the other one stays planted.
      const kickFoot = f.action?.kind === 'attack' ? FOOT_OF_STRIKER[f.action.move!.limb] : undefined;
      for (const i of [0, 1] as const) {
        const busy = kickFoot === i;
        if (busy) f.feet[i].free = true;
        else if (f.feet[i].free) {
          f.feet[i].free = false;
          resetFeet(f, i);
        }
      }
      updateFeet(f, h * f.body);
      legOverride(f, (PELVIS_Y - f.pose.crouch) * f.scale, this.override);
      anchorFeet(f, h);
    }
    let rootTilt: THREE.Quaternion | undefined;
    let pelvisY: number | undefined;
    const ga = f.action;
    if (f.state === 'ok' && ga?.kind === 'getup') {
      const k = Math.min(1, ga.t / (ga.dur * 0.85));
      const e = k * k * (3 - 2 * k);
      rootTilt = tmpQ2.copy(f.getupTilt).slerp(IDENTITY, e);
      pelvisY = THREE.MathUtils.lerp(f.getupFromY, (PELVIS_Y - f.pose.crouch) * f.scale, e);
    }
    drive(
      f.rag,
      {
        speed: f.body,
        tone: f.tone,
        balance: f.balance,
        strength: f.p.strength,
        facing: f.facing,
        move: tmpC.copy(f.self).multiplyScalar(f.body),
        pose: f.pose,
        scale: f.scale,
        boost: f.action?.kind === 'dash' ? 8 : 1,
        stability: f.state === 'ok' ? f.stability : 1,
        stanceLegs: standing
          ? (['lThigh', 'rThigh'] as const).filter((_, i) => !f.feet[i].free && f.feet[i].t < 0)
          : undefined,
        rootTilt,
        pelvisY,
        override: aimed || standing ? this.override : undefined,
        partTone: {
          lUpper: f.broken.lArm ? 0.04 : 1,
          lFore: f.broken.lArm ? 0.04 : 1,
          rUpper: f.broken.rArm ? 0.04 : 1,
          rFore: f.broken.rArm ? 0.04 : 1,
          lThigh: f.broken.lLeg ? 0.45 : 1,
          lShin: f.broken.lLeg ? 0.3 : 1,
          rThigh: f.broken.rLeg ? 0.45 : 1,
          rShin: f.broken.rLeg ? 0.3 : 1,
        },
      },
      h,
    );
  }

  /**
   * Continuous footwork: ease toward the wanted distance, circle around the
   * enemy, bounce on the feet. Speeds are proportional to how far off the
   * fighter is, so there is no back-and-forth on a threshold.
   */
  private footwork(f: Fighter, dl: number, mul: number): void {
    const e = f.enemy;
    const d = tmpA.subVectors(e.pos, f.pos).setY(0);
    const dist = Math.max(1e-4, d.length());
    d.divideScalar(dist);
    const side = tmpB.set(d.z, 0, -d.x);
    const want = tmpC.set(0, 0, 0);
    if (f.flank && e.state === 'ok') {
      // Run round to the enemy's back.
      const behind = e.forward(tmpP).multiplyScalar(-(e.radius + 0.6 * f.scale)).add(e.pos).sub(f.pos).setY(0);
      want.copy(behind).normalize().multiplyScalar(f.stride * 1.1);
    } else {
      let target = f.wantDist;
      if (this.t < f.exitUntilW) target += 0.2 * f.scale;
      target = Math.max(target, f.radius + e.radius + 0.3 * Math.max(f.scale, e.scale));
      const err = dist - target;
      // Small changes of distance are ignored: nobody steps back for every inch.
      const dead = 0.12 * f.scale;
      const radial = Math.abs(err) < dead ? 0 : THREE.MathUtils.clamp((err - Math.sign(err) * dead) * 1.8, -1, 1);
      if (radial > 0) {
        want.addScaledVector(d, radial * f.stride * 0.85);
      } else if (radial < 0) {
        // Too close: a trained fighter pivots out at an angle, an untrained one mostly holds ground.
        want.addScaledVector(d, radial * f.stride * (0.15 + 0.35 * f.tech));
        want.addScaledVector(side, f.circleDir * -radial * f.stride * (0.2 + 0.5 * f.tech));
      }
      want.addScaledVector(side, f.circleDir * f.circleSpeed * f.stride);
      // Rhythm: a light in-and-out bounce of a trained fighter.
      want.addScaledVector(d, Math.sin(f.clock * 2 * Math.PI * 1.4 + f.style.phase[0]) * 0.18 * f.style.bounce * f.stride);
    }
    f.self.lerp(want.multiplyScalar(mul), Math.min(1, 7 * dl));
  }

  private regenerate(f: Fighter, dl: number): void {
    f.hp = Math.min(f.maxHp, f.hp + 1.2 * dl);
    for (const l of Object.keys(f.limbDmg) as Limb[]) {
      f.limbDmg[l] = Math.max(0, f.limbDmg[l] - 3 * dl);
      if (f.broken[l] && f.limbDmg[l] < f.limbLimit * 0.4) {
        f.broken[l] = false;
        f.say(`${LIMB_NAME[l]} срослась`);
      }
    }
  }

  private postStep(f: Fighter, h: number): void {
    const pb = f.rag.pelvis.body;
    const p = pb.translation();
    const vel = pb.linvel();
    f.pos.set(p.x, 0, p.z);
    f.groundSpeed = Math.hypot(vel.x, vel.z);
    f.walkPhase += f.groundSpeed * h * (3.2 / f.scale);

    if (f.state !== 'ok' && f.prevVy < -4 && vel.y > f.prevVy + 3) {
      this.events.push({ type: 'land', pos: f.pos.clone(), power: -f.prevVy * f.scale });
    }
    f.prevVy = vel.y;

    if (p.y < -2 && f.hp > 0) {
      f.hp = 0;
      this.knockDown(f, '');
      if (!this.winner) {
        this.winner = f.enemy;
        f.koReason = 'вылетел с арены';
        f.say('вылетел с арены');
      }
      return;
    }

    if (f.state === 'ok' && f.action?.kind !== 'getup') {
      // Balance over the feet: losing it lets the body tip over for real.
      f.balanceErr = measureBalance(f);
      const s = f.scale;
      let want = 1 - THREE.MathUtils.smoothstep(f.balanceErr, 0.12 * s, 0.5 * s);
      if (this.t < f.wobbleUntilW) want = Math.min(want, 0.12);
      // A moment off balance (during a step) is nothing; staying off it tips you over.
      const rate = (want < f.stability ? (this.t < f.wobbleUntilW ? 25 : 3) : 4) * h * f.body;
      f.stability += THREE.MathUtils.clamp(want - f.stability, -rate, rate);
      if (f.stability < 0.5 && f.thought !== 'теряю равновесие' && this.rng() < 0.02) f.say('теряю равновесие');
    }
    if (f.state === 'ok' && f.action?.kind !== 'getup') {
      // Physical loss of balance: the pelvis tips over or sinks to the floor.
      const up = tmpA.copy(UP).applyQuaternion(q(pb.rotation(), tmpQ));
      const low = p.y < PELVIS_Y * f.scale * 0.45;
      if (up.y < 0.45 || low) f.topple += h * f.body;
      else f.topple = Math.max(0, f.topple - h * f.body);
      if (f.topple > 0.12) this.knockDown(f, 'потерял равновесие');
    }

    this.checkStrike(f, h);
  }

  private runAction(f: Fighter, dl: number): void {
    const a = f.action;
    if (!a) return;
    a.t += dl;
    const u = a.t / a.dur;
    const fwd = f.forward(tmpB);
    switch (a.kind) {
      case 'attack': {
        const m = a.move!;
        if (u < m.active[0]) f.self.copy(fwd).multiplyScalar(a.lunge / (a.dur * m.active[0]));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        break;
      }
      case 'dash':
        if (u < 0.8) f.self.copy(a.dir).multiplyScalar(f.stride * 5);
        else f.self.multiplyScalar(Math.max(0, 1 - 25 * dl));
        break;
      case 'slam':
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
        if (!a.hitDone && u >= 0.55) {
          a.hitDone = true;
          this.shockwave(f);
        }
        break;
      case 'dodge':
        if (u < 0.7) f.self.copy(a.dir).multiplyScalar(3.4 * Math.sqrt(f.scale));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        break;
      case 'block':
        break;
      default:
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
    }
    // Combinations flow: the next blow starts while the last one is coming back.
    if (a.kind === 'attack' && u >= 0.72 && f.comboLeft > 0 && f.enemy.state === 'ok') {
      const next = this.nextInCombo(f, a);
      f.comboLeft--;
      if (next) {
        const zone = a.zone === 'body' ? (this.rng() < 0.75 ? 'head' : 'body') : this.rng() < f.style.bodyLove ? 'body' : 'head';
        this.startAction(f, 'attack', { move: next, zone: next.path ? zone : 'body' });
        f.say(`и ${next.name}${zone === 'body' && next.path ? ' в корпус' : ''}`);
        return;
      }
      f.comboLeft = 0;
    }
    if (a.t >= a.dur) {
      f.action = null;
      // A trained fighter does not stay in the pocket after striking.
      if (a.kind === 'attack' && f.tech > 0.45) {
        f.exitUntilW = this.t + (0.25 + 0.35 * f.tech) / f.body;
        if (this.rng() < f.tech * 0.6) {
          // Step off the line at an angle rather than straight back.
          f.circleDir = this.rng() < 0.5 ? -1 : 1;
          f.circleSpeed = 0.6;
          f.nextCircleW = this.t + 0.4 / f.mind;
        }
      }
    }
  }

  private nextInCombo(f: Fighter, a: Action): Move | null {
    const opts = (FOLLOW[a.move!.id] ?? [])
      .map(([id, w]) => [MOVE_BY_ID[id], w] as const)
      .filter(([m]) => f.canUse(m) && f.weightOf(m) > 0);
    if (!opts.length) return null;
    const dist = tmpA.subVectors(f.enemy.pos, f.pos).setY(0).length();
    const reach = opts.filter(([m]) => dist <= this.attackRange(f, m) + 0.4 * f.scale);
    if (!reach.length) return null;
    const total = reach.reduce((s2, [, w]) => s2 + w, 0);
    let r = this.rng() * total;
    for (const [m, w] of reach) {
      r -= w;
      if (r <= 0) return m;
    }
    return reach[0][0];
  }

  /** Did the striking fist or foot touch the enemy during the strike window? */
  private checkStrike(f: Fighter, h: number): void {
    const a = f.action;
    if (!a || a.kind !== 'attack' || a.hitDone || f.state !== 'ok') {
      f.strikeValid = false;
      return;
    }
    const m = a.move!;
    const st = STRIKERS[m.limb];
    const sp = f.rag.byName[st.part];
    const P = partPoint(sp, st.at, tmpP).clone();
    if (!f.strikeValid) {
      f.strikePrev.copy(P);
      f.strikeValid = true;
      return;
    }
    const u = a.t / a.dur;
    const prev = f.strikePrev.clone();
    f.strikePrev.copy(P);
    if (u < m.active[0] - 0.1 || u > m.active[1] + 0.06) return;
    const e = f.enemy;
    if (e.state !== 'ok') return;

    const sr = st.r * f.scale * Math.sqrt(f.girth);
    let best: Part | null = null;
    let bestGap = 0.03 * f.scale;
    for (const ep of e.rag.parts) {
      partPoint(ep, ep.hitA, segA);
      partPoint(ep, ep.hitB, segB);
      const d = segSegDist(prev, P, segA, segB, closest) - (sr + ep.hitR);
      if (d < bestGap) {
        bestGap = d;
        best = ep;
        bestPoint.copy(closest);
      }
    }
    if (!best) return;

    const vStrike = tmpA.subVectors(P, prev).divideScalar(h);
    const rel = vStrike.sub(v(best.body.linvel(), tmpB));
    const n = tmpB.subVectors(bestPoint, P);
    if (n.lengthSq() < 1e-8) n.copy(rel);
    n.normalize();
    const closing = rel.dot(n);
    if (closing < 1) return;
    a.hitDone = true;
    this.resolveHit(f, e, m, best, closing, rel.clone().normalize(), bestPoint.clone(), a.id);
  }

  private resolveHit(att: Fighter, def: Fighter, m: Move, part: Part, closing: number, dir: THREE.Vector3, at: THREE.Vector3, actionId: number): void {
    const dirH = tmpC.subVectors(def.pos, att.pos).setY(0).normalize();
    const facingAtt = -def.forward(tmpB).dot(dirH);
    const fromBehind = facingAtt < -0.3;
    const zone = part.def.zone;
    const seen = def.handledThreat === actionId;
    const stone = def.has('stone');

    // Impulse: the fist (with the arm and body behind it) at its closing speed, multiplied by muscle.
    // A clean technique puts the body behind the blow; a wild swing is all arm either way.
    const mEff =
      2.5 * (att.mass / 78) * (m.limb === 'rFoot' ? 1.6 : 1) * (m.style === 'clean' ? 0.65 + 0.35 * att.tech : 0.85);
    const J = mEff * closing * (0.6 + 0.8 * att.p.strength);
    const push = dir.clone().add(dirH).normalize();
    push.y += m.lift * 0.6;
    push.normalize().multiplyScalar(J);

    // Parry: the blow is turned aside and the attacker is left open.
    if (def.action?.kind === 'parry' && facingAtt > -0.2) {
      const sp = att.rag.byName[STRIKERS[m.limb].part].body;
      sp.applyImpulse({ x: -push.x * 0.5, y: Math.abs(push.y) * 0.3, z: -push.z * 0.5 }, true);
      att.combo = null;
      this.startAction(att, 'stagger', { dur: 0.55 });
      def.action = null;
      def.say('парировал!');
      att.say('парировали!');
      this.events.push({ type: 'parry', pos: at, target: def });
      return;
    }

    const blocked = def.action?.kind === 'block' && zone === 'arm' && facingAtt > 0;
    // Damage grows slower than the impulse, so a much faster fighter needs a few blows, not one.
    let dmg = (6.5 * Math.sqrt(J / 9) * part.def.dmg * Math.sqrt(m.power)) / Math.pow(def.mass / 78, 0.4);
    // A well placed blow lands on the point, a wild one spreads its force.
    dmg *= m.style === 'clean' ? 0.75 + 0.5 * att.tech : 0.85;
    if (fromBehind) dmg *= 1.3;
    if (blocked) dmg *= 0.4;
    if (stone) {
      dmg *= 0.45;
      push.multiplyScalar(0.6);
    }
    def.hp = Math.max(0, def.hp - dmg);
    def.poise -= blocked ? dmg * 0.5 : dmg * (zone === 'head' ? 1.4 : 1);
    att.hits++;
    part.body.applyImpulseAtPoint({ x: push.x, y: push.y, z: push.z }, { x: at.x, y: at.y, z: at.z }, true);

    // Limbs take damage of their own and can break; the head can be concussed.
    const limb = LIMB_OF_PART[part.name];
    if (limb) {
      def.limbDmg[limb] += (dmg / part.def.dmg) * 0.5;
      if (!def.broken[limb] && def.limbDmg[limb] > def.limbLimit) {
        def.broken[limb] = true;
        this.events.push({ type: 'break', pos: at.clone(), target: def, limb });
        if (def.action?.kind === 'attack' && !def.canUse(def.action.move!)) def.action = null;
        if (def.combo && !def.canUse(def.combo)) def.combo = null;
      }
    } else if (zone === 'head' && !blocked) {
      def.headDmg += dmg;
      if (dmg > 10 || def.headDmg > 30) {
        def.headDmg = 0;
        def.dazedUntilW = this.t + (1.2 + dmg * 0.05) / def.body;
      }
    }

    const sturdy = Math.sqrt(def.mass / 75) * (stone ? 1.6 : 1);
    const interrupted = !blocked && def.action?.kind === 'attack' && dmg > 3.5 * sturdy;
    if (def.hp <= 0) {
      this.knockDown(def, 'сбит с ног');
    } else if (def.poise <= 0) {
      // Legs buckle: for a moment he cannot hold himself up, the blow decides where he goes.
      def.poise = def.maxPoise * 0.5;
      def.wobbleUntilW = this.t + 0.45 / def.body;
      def.combo = null;
      def.action = null;
      def.say('ноги подкосились');
    } else if (!blocked && dmg > 3.5 * sturdy) {
      def.combo = null;
      this.startAction(def, 'stagger', { dur: (0.2 + dmg / 50) / sturdy });
    }

    if (def.hp <= 0 && !this.winner) {
      this.winner = att;
      def.koReason = 'нокаут';
      def.say('нокаут');
      att.combo = null;
    } else if (limb && def.broken[limb] && def.limbDmg[limb] - (dmg / part.def.dmg) * 0.5 <= def.limbLimit) {
      def.say(`сломана ${LIMB_NAME[limb]}`);
    } else if (this.t < def.dazedUntilW && zone === 'head') {
      def.say('поплыл');
    } else if (blocked) {
      def.say('держу блок');
    } else if (interrupted) {
      def.say('прервали!');
    } else if (!seen && def.state === 'ok') {
      def.say('?! не увидел');
    }

    this.events.push({
      type: 'hit', pos: at, power: (J / def.mass) * 4, blocked, dmg, target: def, fromBehind,
      zone: ZONE_NAME[zone], stone,
    });
  }

  /** Ground slam: throws everything around outward and up. */
  private shockwave(f: Fighter): void {
    const R = this.waveRadius(f);
    const k = Math.sqrt(f.p.strength);
    this.events.push({ type: 'wave', pos: f.pos.clone(), radius: R });
    const e = f.enemy;
    const dist = Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z);
    if (dist < R && e.state !== 'ko') {
      const fall = 1 - dist / R;
      const stone = e.has('stone');
      const dv = (2.5 + 2.5 * k) * fall * (stone ? 0.6 : 1);
      const out = tmpA.subVectors(e.pos, f.pos).setY(0).normalize();
      for (const p of e.rag.parts) {
        p.body.applyImpulse({ x: out.x * p.mass * dv * 0.8, y: p.mass * dv * 0.6, z: out.z * p.mass * dv * 0.8 }, true);
      }
      const dmg = 7 * k * fall * (stone ? 0.45 : 1);
      e.hp = Math.max(0, e.hp - dmg);
      this.events.push({
        type: 'hit', pos: e.pos.clone().setY(1), power: dv * 2, blocked: false, dmg, target: e,
        fromBehind: false, zone: 'волной', stone,
      });
      if (e.hp <= 0 && !this.winner) {
        this.winner = f;
        e.koReason = 'нокаут';
      }
      if (dv > 3 || e.hp <= 0) this.knockDown(e, 'сбит волной');
    }
    for (const c of this.crates) {
      if (c.gone) continue;
      const cp = c.body.translation();
      const cd = Math.hypot(cp.x - f.pos.x, cp.z - f.pos.z);
      if (cd > R * 1.3) continue;
      const fall = 1 - cd / (R * 1.3);
      const dv = (3 + 3 * k) * fall;
      const m = c.body.mass();
      c.body.applyImpulse({ x: ((cp.x - f.pos.x) / Math.max(cd, 0.1)) * m * dv, y: m * dv * 0.7, z: ((cp.z - f.pos.z) / Math.max(cd, 0.1)) * m * dv }, true);
      c.body.applyTorqueImpulse({ x: (this.rng() - 0.5) * m * dv * 0.3, y: 0, z: (this.rng() - 0.5) * m * dv * 0.3 }, true);
    }
  }

  private onContact(h1: number, h2: number): void {
    const crate = this.crateByCollider.get(h1) ?? this.crateByCollider.get(h2);
    const fp = this.partByCollider.get(h1) ?? this.partByCollider.get(h2);
    if (!crate || !fp) return;
    const rel = v(crate.body.linvel(), tmpA).sub(v(fp.part.body.linvel(), tmpB)).length();
    if (rel < 3) return;
    this.events.push({ type: 'crash', pos: v(crate.body.translation()), power: rel });
    if (fp.f.state === 'down' && fp.f.hp > 1) fp.f.hp = Math.max(1, fp.f.hp - Math.min(4, rel * 0.3));
  }
}
