import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { FighterParams } from './config';
import { MOVES, MOVE_BY_ID, FOLLOW, type Move, type Striker } from './moves';
import { makeFeet, resetFeet, updateFeet, legOverride, anchorFeet, measureBalance, type Foot } from './feet';
import { DISCIPLINE_BY_ID, type Discipline, type Stance } from './disciplines';
import { punchOverride, aimPointOf } from './strikes';
import { makeMemory, type Memory, type PlanId } from './brain';
import { schoolGenome, type Genome } from './genome';
import { MAP_BY_ID, ALLEY_HALF, room, type MapDef } from './maps';
import { readOpponent, fitOf } from './tactics';
import { POWER_BY_ID, type PowerId } from './powers';
import { react, think } from './ai';
import { clonePose, STANCE, PELVIS_Y, type Pose } from './rig';
import { targetPose } from './pose';
import {
  createRagdoll, drive, partPoint, segSegDist, collisionGroups, q, v,
  GROUP_ENV, STRIKERS, type Part, type PartName, type Ragdoll,
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

/**
 * How a fight is run. A quick fight goes to a finish; a bout has five-minute
 * rounds, judges, and fighters built to last: harder chins, slower damage,
 * limbs that do not break from a few blocked kicks.
 */
export interface Rules {
  /** Round length in world seconds; 0 = no rounds. */
  roundLen: number;
  rounds: number;
  /** How much more punishment a fighter takes than in a quick fight. */
  tough: number;
}

export const QUICK: Rules = { roundLen: 0, rounds: 0, tough: 1 };
export const bout = (rounds: number): Rules => ({ roundLen: 300, rounds, tough: 3 });
export const ARENA_R = 12;
export const FLOOR_R = 13.5;

export type DodgePose = 'dodgeL' | 'dodgeR' | 'dodgeBack' | 'slipL' | 'slipR' | 'duck' | 'weaveL' | 'weaveR' | 'pull';

export type ActionKind = 'attack' | 'dodge' | 'block' | 'stagger' | 'getup' | 'victory' | 'parry' | 'dash' | 'slam' | 'catch' | 'sweep';

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
/** How much of the body is behind each striker: a leg is far heavier than a fist. */
const LIMB_MASS: Partial<Record<Striker, number>> = { rFoot: 2.1, lFoot: 1.7, rKnee: 1.7, lKnee: 1.5, rElbow: 1.15, lElbow: 1.1 };

const KICK_DRIVE = 2.2;
const side0 = (name: string): 'l' | 'r' => (name.startsWith('l') ? 'l' : 'r');
/** The punching arm is driven harder too: it must not sag below its line. */
const PUNCH_DRIVE = 1.8;
/** Strikes of an ordinary human (body speed 1) take this much longer than the move data. */
const STRIKE_TEMPO = 1.9;
/** Points along the shin, shin frame for a 1.8 m fighter; the last is the foot itself. */
const SHIN_POINTS = [new THREE.Vector3(0, -0.2, 0.04), new THREE.Vector3(0, -0.33, 0.06), STRIKERS.rFoot.at];
const tmpQ2v = new THREE.Vector3();

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
  pose?: DodgePose;
  /** Where an aimed strike was committed to, once thrown. */
  lockAim?: THREE.Vector3;
  /** A dodge toward where the blow comes from: if it lands, it lands far harder. */
  into?: boolean;
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
  /** A feint: shows the start of the strike and pulls out. */
  feint: boolean;
  /** 0..1 how badly a missed blow carried the body past the target. */
  overcommit: number;
  missChecked: boolean;
  /** An answer to his attack: the exchange ends with it, nobody answers an answer. */
  reply: boolean;
  jumped?: boolean;
  /** Connected: the fist or foot snaps back quicker than from a miss. */
  landed?: boolean;
  /** Hit while throwing it: the blow goes on with what it has, weaker. */
  shaken?: boolean;
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
  /** How well he takes a blow to the head ("chin"), 1 = average. */
  chin: number;
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
    handSpeed: 0.98 + 0.04 * r(),
    comboLen: 1 + Math.round(r() * 2 + tech + p.aggression),
    phase: [r() * 6.28, r() * 6.28, r() * 6.28],
    chin: 0.8 + 0.45 * r(),
  };
}

export type FighterState = 'ok' | 'down' | 'ko';

/**
 * How a fighter goes down, chosen by the blow: rigid "timber" fall of a clean
 * knockout, folding over a body shot, a leg giving way, or toppling back.
 */
export type FallKind = 'timber' | 'fold' | 'buckle' | 'back' | 'limp';

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
  /** How he moves his feet right now (see chooseFootwork in ai.ts). */
  moveMode: 'circle' | 'rhythm' | 'stalk' | 'still' | 'pivot' = 'circle';
  /** Multiplier on the in-and-out bounce. */
  bounceK = 1;
  /** A quick shoulder or level feint, started at this local time (clock). */
  twitch: 'shoulder' | 'level' | null = null;
  twitchW = -9;
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
  fall: FallKind = 'back';
  /** Own time since the fall began. */
  fallT = 0;
  /** What this fighter has learned about the opponent, and the current game plan. */
  mem: Memory = makeMemory();
  plan: PlanId = 'outbox';
  nextPlanW = 0;
  /** After a feint: the opponent may be caught reacting until this world time. */
  baitUntilW = 0;
  /** Which leg gave way in a buckle. */
  fallSide: 'l' | 'r' = 'l';
  /** +1 lying on the back (chest up), -1 face down. */
  faceUp = 0;
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
  /** Previous positions of each striking point (a kick strikes with the whole shin). */
  strikePrevs: THREE.Vector3[] = [];
  strikeValid = false;
  koReason = '';
  /** Damage taken by each limb; past the limit the bone breaks. */
  limbDmg: Record<Limb, number> = { lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 };
  broken: Record<Limb, boolean> = { lArm: false, rArm: false, lLeg: false, rLeg: false };
  /**
   * Condition instead of hit points.
   * daze: how shaken his consciousness is right now, 0 clear .. 1 about to go;
   *   head blows raise it, it clears with time and breath.
   * trauma: head damage that stays for the whole fight and weakens the chin.
   * bodyHurt: body damage, caps his wind and clears slowly.
   */
  daze = 0;
  trauma = 0;
  bodyHurt = 0;
  /** Long-fight tiredness: builds over the rounds, lowers the wind he can get back. */
  wear = 0;
  /** Toughness from the rules (bouts are built to last). */
  tough = 1;
  knockdowns = 0;
  /** Unconscious (knocked out or the fight stopped). */
  out = false;
  /** A blow heavy enough to drop him without putting him out. */
  flash = false;
  /** A liver shot lands now and folds him a moment later, at this world time. */
  liverW = 0;
  /** World times of clean blows he took while badly shaken (for a stoppage). */
  cleanTaken: number[] = [];
  lastAttackW = -9;
  /** Concussed: perception drops by half until this world time. */
  dazed = false;
  /** After a clean attack a technical fighter steps back out until this world time. */
  exitUntilW = 0;
  /** World time he takes the initiative next (0 = not decided yet). */
  initiativeW = 0;
  /** After defending a blow he may answer until this world time. */
  answerUntilW = 0;
  /** Id of the enemy action he already punished. */
  punishedId = -1;
  /** The hand that last took a blocked blow, busy until this world time. */
  blockedSide: 'l' | 'r' = 'l';
  blockedW = 0;
  /** Side whose hand is out or still coming back from a punch, open until this world time. */
  openSide: 'l' | 'r' = 'l';
  openUntilW = 0;
  /** World time of his last dodge (a counter right after it is a highlight). */
  lastDodgeW = -9;
  /** Last few strikes thrown, newest last. */
  recentMoves: string[] = [];
  /** A strike cut off in its wind-up: that limb hangs loose and swings on until this world time. */
  looseLimb: Striker | null = null;
  looseUntilW = 0;
  /** Reel for this long once the blow he is throwing ends. */
  staggerAfter = 0;
  /** World time each active power is ready again. */
  readyAt: Partial<Record<PowerId, number>> = {};

  /** Latest decision, shown above the head. */
  thought = '';
  thoughtSeq = 0;
  thinkSeq = 0;
  hits = 0;
  /** A power dash carries him: balance is not judged until this world time. */
  dashGraceW = 0;
  /** 0..1 wind. Strikes, misses, dodges and body shots spend it; it comes back at rest. */
  stamina = 1;
  /** A blow snaps the head or trunk loose for a moment (world time until). */
  snapHeadW = 0;
  snapChestW = 0;
  /** His kicking leg is held by the enemy until this world time. */
  caughtUntilW = 0;

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

  /** Learned habits (see genome.ts). */
  get g(): Genome {
    const p = this.p;
    if (this.genomeFor !== p.discipline) {
      this.genomeFor = p.discipline;
      this.genomeCache = p.genome ?? p.skills?.[p.discipline]?.genome ?? schoolGenome(p.discipline);
    }
    return this.genomeCache;
  }
  private genomeCache: Genome = {};
  private genomeFor = '';

  gene(key: string): number {
    return this.g[key] ?? 0;
  }

  /** 0 fresh .. 1 spent: slower strikes and reactions, weaker blows, guard drops. */
  get fatigue(): number {
    return THREE.MathUtils.clamp(1 - this.stamina / 0.85, 0, 1) ** 1.3;
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
    // In a bout limbs are far sturdier: a forearm does not break from blocking kicks for a few rounds.
    return 45 * Math.sqrt(this.mass / 78) * (this.has('stone') ? 2.5 : 1) * (this.tough > 1 ? this.tough * 3.5 : 1);
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
    return (m.duration * STRIKE_TEMPO * (1 + 0.35 * (1 - this.tech)) * (1 + 0.45 * this.fatigue)) / (m.path ? this.style.handSpeed : 1);
  }

  /** World seconds from starting a move until it can hit. */
  windupOf(m: Move): number {
    return (this.durOf(m) * m.active[0]) / this.body;
  }

  /** World seconds between seeing an action start and becoming aware of it. */
  get reactDelay(): number {
    return (0.17 * (1 + 0.4 * this.fatigue)) / this.mind;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Walking speed in local m/s, longer legs take longer steps. */
  get stride(): number {
    // A leg kicked dead slows him long before it breaks.
    const dead = (l: 'lLeg' | 'rLeg') => (this.broken[l] ? 0.6 : 1 - 0.35 * Math.min(1, this.limbDmg[l] / this.limbLimit));
    const legs = dead('lLeg') * dead('rLeg');
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
  | { type: 'hit'; pos: THREE.Vector3; power: number; blocked: boolean; dmg: number; target: Fighter; fromBehind: boolean; zone: string; stone: boolean; part?: string }
  | { type: 'land'; pos: THREE.Vector3; power: number }
  | { type: 'crash'; pos: THREE.Vector3; power: number }
  | { type: 'wave'; pos: THREE.Vector3; radius: number }
  | { type: 'break'; pos: THREE.Vector3; target: Fighter; limb: Limb }
  | { type: 'parry'; pos: THREE.Vector3; target: Fighter }
  | { type: 'catch'; pos: THREE.Vector3; target: Fighter }
  | { type: 'liver'; pos: THREE.Vector3; target: Fighter }
  | { type: 'bell'; round: number }
  | { type: 'moment'; text: string; focus: Fighter };

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
  /** The judges could not separate them. */
  draw = false;
  /** World time of the last clean blow by anyone. */
  lastHitW = 0;
  private eq = new RAPIER.EventQueue(true);
  private override: Partial<Record<string, THREE.Quaternion>> = {};
  private crateByCollider = new Map<number, Crate>();
  private partByCollider = new Map<number, { f: Fighter; part: Part }>();

  /** RAPIER.init() must have finished before a Sim is created. */
  readonly map: MapDef;
  readonly rules: Rules;
  /** Rounds: current round (1-based), time into it, and a break between rounds. */
  round = 1;
  roundT = 0;
  betweenRounds = false;
  /** Judges' cards: points per round for each fighter, and what each did this round. */
  cards: [number, number][] = [];
  private roundDealt = [0, 0];
  private roundDowns = [0, 0];

  constructor(red: FighterParams, blue: FighterParams, seed = 7, map: MapDef = MAP_BY_ID.void, rules: Rules = QUICK) {
    this.rng = rng32(seed);
    this.map = map;
    this.rules = rules;
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    this.buildMap();

    const a = new Fighter(red, 0);
    const b = new Fighter(blue, 1);
    a.tough = b.tough = rules.tough;
    a.enemy = b;
    b.enemy = a;
    const gap = map.start > 0 ? map.start * Math.max(1, (a.scale + b.scale) / 2) : 2.2 + (a.scale + b.scale) * 0.6;
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
    if (map.crates) this.layCrates();
  }

  /** A fixed box collider: floors, walls, ropes. */
  private fixedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0, bounce = 0.05, friction = 0.9): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw)),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(bounce).setCollisionGroups(collisionGroups(GROUP_ENV, 0xffff)),
      body,
    );
  }

  /** Floor and boundaries of the map. */
  private buildMap(): void {
    const m = this.map;
    const S = m.size;
    if (m.shape === 'circle') {
      const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.5, S).setFriction(0.9).setCollisionGroups(collisionGroups(GROUP_ENV, 0xffff)),
        floor,
      );
    } else if (m.edge === 'alley') {
      this.fixedBox(0, -0.5, 0, ALLEY_HALF + 0.6, 0.5, S + 5);
    } else {
      const half = m.shape === 'octagon' ? S + 1.5 : S + 0.3;
      this.fixedBox(0, -0.5, 0, half, 0.5, half);
    }
    if (m.outside === 'ground') this.fixedBox(0, -1.6, 0, 30, 0.5, 30);
    switch (m.edge) {
      case 'ropes':
        // Three ropes on each side: they give and throw a fighter back in.
        for (const y of [0.5, 0.9, 1.3]) {
          for (const sgn of [-1, 1]) {
            this.fixedBox(0, y, sgn * S, S, 0.03, 0.03, 0, 0.6, 0.3);
            this.fixedBox(sgn * S, y, 0, 0.03, 0.03, S, 0, 0.6, 0.3);
          }
        }
        for (const [x, z] of [[S, S], [S, -S], [-S, S], [-S, -S]]) this.fixedBox(x, 0.75, z, 0.09, 0.75, 0.09);
        break;
      case 'fence': {
        const apo = S * Math.cos(Math.PI / 8);
        const len = S * Math.sin(Math.PI / 8);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.fixedBox(Math.sin(a) * (apo + 0.05), 0.95, Math.cos(a) * (apo + 0.05), len, 0.95, 0.05, a, 0.2, 0.5);
        }
        break;
      }
      case 'walls':
        for (const sgn of [-1, 1]) {
          this.fixedBox(0, 1.25, sgn * (S + 0.1), S + 0.2, 1.25, 0.1);
          this.fixedBox(sgn * (S + 0.1), 1.25, 0, 0.1, 1.25, S + 0.2);
        }
        break;
      case 'alley':
        for (const sgn of [-1, 1]) this.fixedBox(sgn * (ALLEY_HALF + 0.15), 2, 0, 0.15, 2, S + 5);
        break;
      case 'parapet':
        for (const sgn of [-1, 1]) {
          this.fixedBox(0, 0.22, sgn * (S + 0.1), S + 0.2, 0.22, 0.1);
          this.fixedBox(sgn * (S + 0.1), 0.22, 0, 0.1, 0.22, S + 0.2);
        }
        break;
    }
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
    if (this.map.id === 'alley') {
      // Bins and boxes along the walls.
      const spots: [number, number, number][] = [
        [2.2, 3.5, 0.35], [2.25, 4.3, 0.3], [-2.2, -3.8, 0.4], [-2.25, 2.0, 0.3], [2.2, -5.0, 0.45], [-2.1, 5.5, 0.35],
      ];
      for (const [x, z, half] of spots) this.addCrate(x, half, z, half, this.rng() * 0.6);
      return;
    }
    if (this.map.id === 'roof') {
      const spots: [number, number, number][] = [[4.8, 4.5, 0.5], [-4.6, -4.2, 0.45], [4.5, -4.8, 0.35], [-4.9, 4.4, 0.4]];
      for (const [x, z, half] of spots) this.addCrate(x, half, z, half, this.rng() * 0.6);
      return;
    }
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
    if (this.betweenRounds) return;
    this.t += h;
    if (this.rules.roundLen && !this.winner) {
      this.roundT += h;
      if (this.roundT >= this.rules.roundLen) this.endRound();
    }
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
    opts: { move?: Move; dur?: number; dir?: THREE.Vector3; pose?: Action['pose']; lunge?: number; zone?: 'head' | 'body' | 'leg'; feint?: boolean; reply?: boolean } = {},
  ): Action {
    const m = opts.move;
    if (m && kind === 'attack') f.lastAttackW = this.t;
    if (m && kind === 'attack') f.stamina -= (opts.feint ? 0.4 : 1) * (0.006 + 0.008 * m.power);
    if (kind === 'dodge') f.stamina -= 0.02 * (1 - 0.6 * f.p.evasion);
    if (m && kind === 'attack' && !opts.feint) {
      f.recentMoves.push(m.id);
      if (f.recentMoves.length > 3) f.recentMoves.shift();
      f.mem.tries[m.id] = (f.mem.tries[m.id] ?? 0) + 1;
      f.enemy.mem.oppMoves[m.id] = (f.enemy.mem.oppMoves[m.id] ?? 0) + 1;
      f.enemy.mem.oppAttackTimes.push(this.t);
    }
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
      feint: !!opts.feint,
      overcommit: 0,
      missChecked: false,
      reply: !!opts.reply,
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
    return MOVES.filter((m) => f.canUse(m) && f.weightOf(m) > 0 && this.footReady(f, m));
  }

  /** A kick or knee stands on one leg: only from a settled stance, not on the move. */
  footReady(f: Fighter, m: Move): boolean {
    if (FOOT_OF_STRIKER[m.limb] === undefined) return true;
    return f.stability > 0.85 && f.balanceErr < 0.1 * f.scale && f.groundSpeed < 0.9 * f.body * f.scale;
  }

  private knockDown(f: Fighter, why: string, how: FallKind = 'back', side: 'l' | 'r' = 'l'): void {
    f.fall = how;
    f.fallT = 0;
    f.fallSide = side;
    f.stability = 0;
    f.state = f.out ? 'ko' : 'down';
    f.action = null;
    f.combo = null;
    f.balance = 0;
    f.self.set(0, 0, 0);
    // A shaken man takes longer to get up.
    f.downLeft = 0.8 + this.rng() * 0.5 + 2.5 * f.daze;
    f.topple = 0;
    if (f.state === 'down') f.say(why);
  }

  private preStep(f: Fighter, h: number): void {
    const dl = h * f.body;
    this.recover(f, dl);
    if (f.has('regen') && f.state !== 'ko') this.regenerate(f, dl);
    if (f.state === 'ok') {
      const getup = f.action?.kind === 'getup';
      f.balance = Math.min(1, f.balance + dl / (getup ? 0.6 : 0.3));
      f.tone = Math.min(1, f.tone + dl / 0.4);
      const legs = (f.broken.lLeg ? 0.6 : 1) * (f.broken.rLeg ? 0.6 : 1);
      f.poise = Math.min(f.maxPoise * legs, f.poise + 10 * dl);
      // Getting the wind back: fastest standing still, none while throwing a blow.
      const busy = f.action?.kind === 'attack' ? 0 : 1;
      const moving = Math.min(1, f.groundSpeed / (f.stride * f.body + 1e-6));
      f.stamina = Math.min(1, Math.max(0, f.stamina) + busy * (0.09 - 0.035 * moving) * dl);
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
      if (f.dazed && a?.kind !== 'getup') {
        // Rubber legs: drifting off line, and now and then the knees give.
        tmpA.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
        f.self.addScaledVector(tmpA, Math.sin(f.clock * 1.9) * 0.5 * f.stride * dl * 4);
        if (this.rng() < 0.25 * h * f.body) f.wobbleUntilW = this.t + 0.3 / f.body;
      }
      // Stay off the ropes, the fence, the walls and the edge unless something throws you there.
      const inward = { x: 0, z: 0 };
      const left = room(this.map, f.pos.x, f.pos.z, inward);
      const margin = 0.6 + 0.6 * f.scale;
      if (left < margin) {
        tmpB.set(-inward.x, 0, -inward.z);
        const out = f.self.dot(tmpB);
        if (out > 0) f.self.addScaledVector(tmpB, -out * Math.min(1, (margin - left) / margin));
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
      f.fallT += dl;
      f.tone = this.fallTone(f);
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
    // The kicking leg is driven hard: a kick is the whole hip whipping the leg round.
    const kickLeg = f.state === 'ok' && f.action?.kind === 'attack' && f.action.move!.path ? FOOT_OF_STRIKER[f.action.move!.limb] : undefined;
    const punchArm = f.state === 'ok' && f.action?.kind === 'attack' && f.action.move!.path && f.action.move!.limb.endsWith('Hand') ? f.action.move!.limb[0] : undefined;
    let rootTilt: THREE.Quaternion | undefined;
    let pelvisY: number | undefined;
    const ga = f.action;
    if (f.state === 'ok' && ga?.kind === 'getup') {
      const k = Math.min(1, ga.t / (ga.dur * 0.85));
      const e = k * k * (3 - 2 * k);
      rootTilt = tmpQ2.copy(f.getupTilt).slerp(IDENTITY, e);
      pelvisY = THREE.MathUtils.lerp(f.getupFromY, (PELVIS_Y - f.pose.crouch) * f.scale, e);
    }
    const partTone: Partial<Record<PartName, number>> = {
      head: this.t < f.snapHeadW ? 0.06 : 1,
      chest: this.t < f.snapChestW || this.t < f.looseUntilW ? 0.4 : 1,
      lUpper: f.broken.lArm ? 0.04 : punchArm === 'l' ? PUNCH_DRIVE : 1,
      lFore: f.broken.lArm ? 0.04 : punchArm === 'l' ? PUNCH_DRIVE : 1,
      rUpper: f.broken.rArm ? 0.04 : punchArm === 'r' ? PUNCH_DRIVE : 1,
      rFore: f.broken.rArm ? 0.04 : punchArm === 'r' ? PUNCH_DRIVE : 1,
      lThigh: f.broken.lLeg ? 0.45 : kickLeg === 0 ? KICK_DRIVE : 1,
      lShin: f.broken.lLeg ? 0.3 : kickLeg === 0 ? KICK_DRIVE : 1,
      rThigh: f.broken.rLeg ? 0.45 : kickLeg === 1 ? KICK_DRIVE : 1,
      rShin: f.broken.rLeg ? 0.3 : kickLeg === 1 ? KICK_DRIVE : 1,
    };
    this.loosen(f, partTone);
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
        partTone,
      },
      h,
    );
  }

  /** Lowers the muscle of a limb that swings on loose after its strike was cut off. */
  private loosen(f: Fighter, tone: Partial<Record<PartName, number>>): void {
    if (!f.looseLimb || this.t >= f.looseUntilW) return;
    const side = f.looseLimb[0];
    const parts = /Hand|Elbow/.test(f.looseLimb) ? ['Upper', 'Fore'] : ['Thigh', 'Shin'];
    for (const p of parts) tone[(side + p) as PartName] = 0.12;
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
      if (this.t < f.exitUntilW) target += 0.35 * f.scale;
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
      want.addScaledVector(d, Math.sin(f.clock * 2 * Math.PI * 1.4 + f.style.phase[0]) * 0.18 * f.style.bounce * f.bounceK * f.stride);
    }
    // On the ropes or against the wall: circle out toward open floor.
    const inward = { x: 0, z: 0 };
    const left = room(this.map, f.pos.x, f.pos.z, inward);
    const near = 1.5 * f.scale;
    if (left < near) want.addScaledVector(tmpP.set(inward.x, 0, inward.z), ((near - left) / near) * f.stride * 0.9);
    f.self.lerp(want.multiplyScalar(mul), Math.min(1, 7 * dl));
  }

  /** Muscle tone through a fall: rigid for a knockout, half-tense while folding, then loose. */
  private fallTone(f: Fighter): number {
    const t = f.fallT;
    const ko = f.state === 'ko';
    switch (f.fall) {
      case 'timber':
        return t < 0.7 ? 0.75 : ko ? 0.05 : 0.22;
      case 'fold':
        return t < 1 ? 0.5 : ko ? 0.06 : 0.3;
      case 'buckle':
        return t < 0.8 ? 0.45 : ko ? 0.06 : 0.3;
      case 'back':
        return t < 0.7 ? 0.4 : ko ? 0.06 : 0.3;
      default:
        return ko ? 0.05 : 0.2;
    }
  }

  private lastMomentW = -9;

  /** A highlight worth slowing down for, not too often. */
  moment(text: string, focus: Fighter): void {
    if (this.t - this.lastMomentW < 1.5 && text !== 'НОКДАУН!') return;
    this.lastMomentW = this.t;
    this.events.push({ type: 'moment', text, focus });
  }

  /** Puts a fighter who fell out of the ring back on the canvas near the middle, lying down. */
  private backInside(f: Fighter): void {
    const p = f.rag.pelvis.body.translation();
    const inward = { x: 0, z: 0 };
    room(this.map, p.x, p.z, inward);
    const to = new THREE.Vector3(p.x, 0, p.z).multiplyScalar(0.35);
    const dx = to.x - p.x;
    const dz = to.z - p.z;
    const dy = this.map.floorY + 0.25 - p.y;
    for (const part of f.rag.parts) {
      const t = part.body.translation();
      part.body.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
      part.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    f.pos.set(to.x, 0, to.z);
    if (f.state === 'ok') this.knockDown(f, 'вылетел за канаты');
    f.say('рефери возвращает на ринг');
  }

  /** The bell: score the round, then a break (the view resumes with nextRound) or the decision. */
  private endRound(): void {
    const d = this.roundDealt;
    const k = this.roundDowns;
    // Ten-point must: the better round gets 10, the other 9; each knockdown costs a point more.
    let a = 10;
    let b = 10;
    if (d[0] > d[1] * 1.08) b = 9;
    else if (d[1] > d[0] * 1.08) a = 9;
    a -= k[0];
    b -= k[1];
    this.cards.push([Math.max(6, a), Math.max(6, b)]);
    this.roundDealt = [0, 0];
    this.roundDowns = [0, 0];
    this.events.push({ type: 'bell', round: this.round });
    if (this.round >= this.rules.rounds) {
      const [ta, tb] = this.score();
      const [fa, fb] = this.fighters;
      if (ta !== tb) {
        const w = ta > tb ? fa : fb;
        this.winner = w;
        w.enemy.koReason = `решение судей ${Math.max(ta, tb)}–${Math.min(ta, tb)}`;
      } else {
        this.draw = true;
      }
      return;
    }
    this.betweenRounds = true;
  }

  /** Totals on the judges' cards. */
  score(): [number, number] {
    return this.cards.reduce<[number, number]>((s, [a, b]) => [s[0] + a, s[1] + b], [0, 0]);
  }

  /** After the break: the corner has done what it can. */
  nextRound(): void {
    for (const f of this.fighters) {
      if (f.state === 'down' && !f.out) f.downLeft = Math.min(f.downLeft, 0.3);
      f.daze *= 0.35;
      f.bodyHurt *= 0.85;
      for (const l of Object.keys(f.limbDmg) as Limb[]) f.limbDmg[l] *= 0.85;
      f.stamina = 1 - 0.5 * f.bodyHurt - 0.35 * f.wear;
      f.action = null;
      f.combo = null;
      f.initiativeW = 0;
    }
    this.round++;
    this.roundT = 0;
    this.betweenRounds = false;
  }

  /**
   * What a blow does to his condition. A blow to the head shakes his
   * consciousness by how hard it is against how much his chin takes right now:
   * blows he did not see and blows that turn the head (hooks, uppercuts, round
   * kicks, knees, elbows) shake far more. One blow beyond what he can take puts
   * him out; a bit less drops him (a knockdown). Blows to the body take his
   * wind and can fold him a moment later (the liver). An arm or a leg never
   * knocks a man out; they suffer on their own (see limbDmg).
   */
  private hurt(def: Fighter, m: Move, zone: string, dmg: number, blocked: boolean, seen: boolean): void {
    const stone = def.has('stone') ? 2 : 1;
    // Judges count clean, effective blows: the head most, the body next, arms barely.
    this.roundDealt[1 - def.team] += blocked ? 0.1 * dmg : dmg * (zone === 'head' ? 1.3 : zone === 'arm' ? 0.25 : 1);
    const size = Math.sqrt(def.mass / 78);
    def.stamina -= dmg * (blocked ? 0.003 : zone === 'body' ? 0.012 : 0.004);
    if (blocked) return;
    if (zone === 'head') {
      const turning = m.path === 'hook' || m.path === 'upper' || m.path === 'over' || m.path === 'swing' || m.path === 'round' || /Knee|Elbow/.test(m.limb);
      // A blow he saw coming meets a tucked chin and a braced neck, the more so the better he is trained.
      const shock = dmg * (turning ? 1.25 : 1) * (seen ? 1 - 0.35 * def.tech : 1.45);
      const chin = 23 * size * def.style.chin * Math.pow(def.tough, 0.65) * stone * (1 - 0.55 * def.daze) * (1 - 0.45 * def.trauma) * (0.8 + 0.2 * Math.max(0, def.stamina));
      const r = shock / chin;
      def.daze = Math.min(1, def.daze + 0.75 * r);
      def.trauma = Math.min(1, def.trauma + shock / (450 * size * stone * (def.tough > 1 ? def.tough * 2.5 : 1)));
      if (r > 0.95 && this.rng() < THREE.MathUtils.smoothstep(r, 0.95, 1.4)) def.out = true;
      else if (r > 0.6 && this.rng() < THREE.MathUtils.smoothstep(r, 0.6, 1)) def.flash = true;
    } else if (zone === 'body') {
      def.bodyHurt = Math.min(1, def.bodyHurt + dmg / (55 * size * stone * def.tough));
      // The liver: a hard blow to the body, worse on a body already hurt, folds him a moment later.
      const r = (dmg / (11 * size * stone * Math.sqrt(def.tough))) * (0.6 + 0.8 * def.bodyHurt) * (seen ? 1 : 1.3);
      if (def.liverW === 0 && r > 1 && this.rng() < THREE.MathUtils.smoothstep(r, 1, 1.6)) def.liverW = this.t + (0.3 + 0.4 * this.rng()) / def.body;
    }
    if (zone !== 'arm' && def.daze > 0.5) {
      // Hurt and not answering: the referee steps in.
      def.cleanTaken = def.cleanTaken.filter((t) => this.t - t < 3);
      def.cleanTaken.push(this.t);
      if (def.cleanTaken.length >= 4 && this.t - def.lastAttackW > 3) this.stop(def, 'остановка боя: не защищался');
    }
  }

  /** The referee stops the fight. */
  private stop(f: Fighter, why: string): void {
    f.out = true;
    f.koReason = why;
    if (f.state === 'down') f.state = 'ko';
  }

  /** Condition between blows: the head clears with time and breath, the body slowly. */
  private recover(f: Fighter, dl: number): void {
    const resting = f.state === 'down' ? 1.6 : f.action?.kind === 'attack' ? 0.6 : 1;
    const regen = f.has('regen') ? 3 : 1;
    if (!f.out) f.daze = Math.max(0, f.daze - dl * (0.035 + 0.1 * Math.max(0, f.stamina)) * (1 - 0.5 * f.trauma) * resting * regen);
    f.bodyHurt = Math.max(0, f.bodyHurt - dl * 0.004 * regen);
    if (f.tough > 1) for (const l of Object.keys(f.limbDmg) as Limb[]) f.limbDmg[l] = Math.max(0, f.limbDmg[l] - 0.35 * dl);
    // In a long fight the tiredness builds: work and damage wear him down round by round.
    if (this.rules.roundLen && f.state === 'ok') f.wear = Math.min(1, f.wear + dl * (0.00035 + 0.0006 * (1 - Math.max(0, f.stamina)) + 0.0005 * f.daze));
    f.stamina = Math.min(f.stamina, 1 - 0.5 * f.bodyHurt - 0.35 * f.wear);
    f.dazed = f.daze > 0.42;
    // A summary number for the plans and the training score: 100 fresh, 0 out.
    f.hp = f.out ? 0 : 100 * (1 - Math.min(1, Math.max(0.9 * f.daze, 0.4 * f.trauma + 0.35 * f.bodyHurt + 0.25 * f.daze)));
    if (f.liverW && this.t >= f.liverW) {
      f.liverW = 0;
      if (f.state === 'ok') {
        f.stamina = 0;
        f.knockdowns++;
        this.roundDowns[f.team]++;
        this.knockDown(f, 'печень!', 'fold');
        f.downLeft += 2.5;
        this.events.push({ type: 'liver', pos: f.pos.clone().setY(0.9 * f.scale), target: f });
        if ((this.rules.roundLen ? this.roundDowns[f.team] : f.knockdowns) >= 3) {
          this.stop(f, 'три нокдауна');
          f.state = 'ko';
          if (!this.winner) this.winner = f.enemy;
        }
      }
    }
  }

  private regenerate(f: Fighter, dl: number): void {
    f.trauma = Math.max(0, f.trauma - 0.01 * dl);
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

    if (f.state !== 'ok') {
      // Chest facing up or down decides how he lies and how he tries to get up.
      f.faceUp = tmpA.set(0, 0, 1).applyQuaternion(q(f.rag.byName.chest.body.rotation(), tmpQ)).y;
    }
    if (f.state !== 'ok' && f.prevVy < -4 && vel.y > f.prevVy + 3) {
      this.events.push({ type: 'land', pos: f.pos.clone(), power: -f.prevVy * f.scale });
    }
    f.prevVy = vel.y;

    // Thrown out of a raised ring onto the floor below, or off a roof: the fight is over.
    const fellOut = this.map.outside === 'ground' && p.y < this.map.floorY - 0.7 && room(this.map, p.x, p.z, { x: 0, z: 0 }) < -0.2;
    // In a bout a fall through the ropes is not the end: the referee brings him back in.
    if (fellOut && this.rules.roundLen && !f.out) {
      this.backInside(f);
      return;
    }
    if ((p.y < -2 || fellOut) && !f.out) {
      f.out = true;
      this.knockDown(f, '');
      if (!this.winner) {
        this.winner = f.enemy;
        f.koReason = this.map.id === 'ring' ? 'вылетел с ринга' : this.map.id === 'roof' ? 'упал с крыши' : this.map.id === 'cage' ? 'вылетел из клетки' : 'вылетел с арены';
        f.say(f.koReason);
      }
      return;
    }

    if (f.state === 'ok' && f.action?.kind !== 'getup') {
      // Balance over the feet: losing it lets the body tip over for real.
      f.balanceErr = measureBalance(f);
      const s = f.scale;
      // On one leg in a kick the body leans to counter the leg: judged more leniently,
      // the planted foot grips and the trunk is held, as a trained kicker does.
      const ka = f.action;
      const kicking = ka?.kind === 'attack' && FOOT_OF_STRIKER[ka.move!.limb] !== undefined;
      let want = kicking
        ? 1 - THREE.MathUtils.smoothstep(f.balanceErr, (0.2 + 0.15 * f.tech) * s, (0.65 + 0.3 * f.tech) * s)
        : 1 - THREE.MathUtils.smoothstep(f.balanceErr, 0.12 * s, 0.5 * s);
      if (this.t < f.wobbleUntilW) want = Math.min(want, 0.12);
      else if (this.t < f.dashGraceW) want = 1;
      // A moment off balance (during a step) is nothing; staying off it tips you over.
      const rate = (want < f.stability ? (this.t < f.wobbleUntilW ? 25 : 3) : 4) * h * f.body;
      f.stability += THREE.MathUtils.clamp(want - f.stability, -rate, rate);
      if (f.stability < 0.5 && f.thought !== 'теряю равновесие' && this.rng() < 0.02) f.say('теряю равновесие');
      // Thrown off balance on one leg: abandon the kick and put the foot down to catch himself.
      const a = f.action;
      if (a?.kind === 'attack' && FOOT_OF_STRIKER[a.move!.limb] !== undefined && this.t >= f.caughtUntilW && f.balanceErr > 0.55 * s && f.stability < 0.5) {
        f.action = null;
        f.combo = null;
        f.comboLeft = 0;
        f.say('ставлю ногу');
      }
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
    if (a.landed && a.kind === 'attack' && a.t > a.dur * a.move!.active[1]) a.t += dl * 0.6;
    const u = a.t / a.dur;
    const fwd = f.forward(tmpB);
    switch (a.kind) {
      case 'attack': {
        const m = a.move!;
        if (this.t < f.caughtUntilW) {
          // Leg held: hopping on the other one, the kick frozen where it was caught.
          a.t -= dl;
          f.self.multiplyScalar(0.5);
          break;
        }
        if (a.feint && u >= m.active[0] * 0.55) {
          // Pull the feint out and look for the reaction.
          f.action = null;
          f.comboLeft = 0;
          f.baitUntilW = this.t + 0.45 / f.mind;
          return;
        }
        if (u < m.active[0]) f.self.copy(fwd).multiplyScalar(a.lunge / (a.dur * m.active[0]));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        const [a0, a1] = m.active;
        // Flying knee: jump off the floor into it.
        if (m.id === 'flyknee' && !a.missChecked && u >= a0 * 0.6 && !a.jumped) {
          a.jumped = true;
          const pel = f.rag.pelvis.body;
          pel.applyImpulse({ x: fwd.x * f.mass * 1.2, y: f.mass * 2.6 * Math.sqrt(f.scale), z: fwd.z * f.mass * 1.2 }, true);
          f.dashGraceW = this.t + 0.7 / f.body;
        }
        // A punching hand leaves its side of the head open until it is back in the guard.
        if (m.limb.endsWith('Hand') && u >= a0 * 0.8 && !a.feint) {
          f.openSide = m.limb[0] as 'l' | 'r';
          f.openUntilW = this.t + ((1 - u) * a.dur + 0.2) / f.body;
        }
        const heavy = Math.min(1.5, m.power / 1.6);
        // Weight transfer: the body travels a little with the blow.
        if (u >= a0 * 0.7 && u < a1) {
          const want = 0.7 * heavy * Math.sqrt(f.scale) * Math.sin((Math.PI * (u - a0 * 0.7)) / (a1 - a0 * 0.7));
          const along = f.self.dot(fwd);
          if (along < want) f.self.addScaledVector(fwd, want - along);
        }
        // A miss with weight behind it carries the body past the target and is slow to recover.
        if (u >= a1 && !a.missChecked && !a.feint) {
          a.missChecked = true;
          if (!a.hitDone) {
            const k = THREE.MathUtils.clamp((m.power - 1.3) / 1.4, 0, 1) * (1.2 - 0.6 * f.tech) + (m.style === 'wild' ? 0.25 : 0);
            if (k > 0.15) {
              a.overcommit = Math.min(1, k);
              f.stamina -= 0.03 * a.overcommit;
              f.stability = Math.min(f.stability, 1 - 0.45 * a.overcommit);
              if (a.overcommit > 0.45) f.comboLeft = 0;
              f.say(`провалился после промаха: ${m.name}`);
            }
          }
        }
        if (a.overcommit > 0 && u >= a1) {
          a.t -= dl * (1 - 1 / (1 + 0.9 * a.overcommit));
          const carry = 1 - (u - a1) / (1 - a1);
          f.self.copy(fwd).multiplyScalar(0.9 * a.overcommit * Math.sqrt(f.scale) * Math.max(0, carry));
        }
        // A kick reaches only as far as the leg from the hip: the kicker skips in on the
        // standing foot and turns the hip over until the target is within the leg's length.
        const kickSide = m.limb === 'lFoot' ? 'lThigh' : m.limb === 'rFoot' ? 'rThigh' : null;
        if (kickSide && m.path && u > m.active[0] * 0.35 && u < m.active[1]) {
          const hip = v(f.rag.byName[kickSide].body.translation(), tmpA);
          const aim = aimPointOf(f, a, tmpC);
          const short = hip.distanceTo(aim) - 0.8 * f.scale;
          const room = f.pos.distanceTo(f.enemy.pos) - (f.radius + f.enemy.radius + 0.1 * f.scale);
          if (short > 0 && room > 0) {
            const left = Math.max(0.05, (m.active[0] + (m.active[1] - m.active[0]) * 0.4 - u) * a.dur);
            const toward = tmpA.subVectors(f.enemy.pos, f.pos).setY(0).normalize();
            f.self.copy(toward).multiplyScalar(Math.min(Math.min(short, room) / left, f.stride * 2.2));
          }
        }
        break;
      }
      case 'dash': {
        // A dash at the enemy stops short of him instead of ramming him.
        const to = tmpA.subVectors(f.enemy.pos, f.pos).setY(0);
        const gap = f.radius + f.enemy.radius + 0.35 * f.scale;
        if (u < 0.8 && to.dot(a.dir!) > 0 && to.length() < gap + f.groundSpeed * 0.06) a.t = Math.max(a.t, a.dur * 0.8);
        f.dashGraceW = this.t + 0.3 / f.body;
        if (a.t / a.dur < 0.8) f.self.copy(a.dir).multiplyScalar(f.stride * 5);
        else f.self.multiplyScalar(Math.max(0, 1 - 25 * dl));
        break;
      }
      case 'slam':
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
        if (!a.hitDone && u >= 0.55) {
          a.hitDone = true;
          this.shockwave(f);
        }
        break;
      case 'dodge':
        f.lastDodgeW = this.t;
        if (u < 0.7) f.self.copy(a.dir).multiplyScalar(3.4 * Math.sqrt(f.scale));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        break;
      case 'block':
        break;
      case 'sweep': {
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
        const e = f.enemy;
        if (!a.hitDone && u >= 0.6) {
          a.hitDone = true;
          if (this.t < e.caughtUntilW && e.state === 'ok') {
            e.caughtUntilW = 0;
            const away = tmpA.subVectors(e.pos, f.pos).setY(0).normalize();
            const pel = e.rag.pelvis.body;
            pel.applyImpulse({ x: away.x * e.mass * 1.2, y: e.mass * 0.6, z: away.z * e.mass * 1.2 }, true);
            this.knockDown(e, 'подсекли пойманную ногу', 'back');
            f.say('подсечка');
          }
        }
        break;
      }
      default:
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
    }
    // Combinations flow: the next blow starts while the last one is coming back.
    if (a.kind === 'attack' && u >= 0.72 && f.comboLeft > 0 && f.enemy.state === 'ok') {
      const next = this.nextInCombo(f, a);
      f.comboLeft--;
      if (next) {
        const zone = a.zone === 'body' ? (this.rng() < 0.75 ? 'head' : 'body') : this.rng() < f.style.bodyLove ? 'body' : 'head';
        this.startAction(f, 'attack', { move: next, zone: next.path ? zone : 'body', reply: a.reply });
        f.say(`и ${next.name}${zone === 'body' && next.path ? ' в корпус' : ''}`);
        return;
      }
      f.comboLeft = 0;
    }
    if (a.t >= a.dur) {
      f.action = null;
      if (f.staggerAfter > 0) {
        const d = f.staggerAfter;
        f.staggerAfter = 0;
        this.startAction(f, 'stagger', { dur: d });
        return;
      }
      // A trained fighter does not stay in the pocket after striking.
      if (a.kind === 'attack' && f.tech + 0.5 * (1 - f.p.aggression) > 0.45) {
        f.exitUntilW = this.t + (0.35 + 0.45 * f.tech) / f.body;
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
      .filter(([m]) => f.canUse(m) && f.weightOf(m) > 0 && this.footReady(f, m));
    if (!opts.length) return null;
    const dist = tmpA.subVectors(f.enemy.pos, f.pos).setY(0).length();
    const reach = opts.filter(([m]) => dist <= this.attackRange(f, m) + 0.4 * f.scale);
    if (!reach.length) return null;
    // The next blow of a combination also reads what the last one did to him.
    const read = readOpponent(f, f.enemy, this.t);
    const weighted = reach.map(([m, w]) => [m, w * fitOf(f, m, read, this.attackRange(f, m)).k] as const);
    const total = weighted.reduce((s2, [, w]) => s2 + w, 0);
    let r = this.rng() * total;
    for (const [m, w] of weighted) {
      r -= w;
      if (r <= 0) return m;
    }
    return weighted[0][0];
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
    // A round or low kick lands with the shin as much as with the foot.
    const pts = m.path === 'round' || m.path === 'low' ? SHIN_POINTS : [st.at];
    const cur = pts.map((p) => partPoint(sp, tmpQ2v.copy(p).multiplyScalar(f.scale), new THREE.Vector3()));
    if (!f.strikeValid || f.strikePrevs.length !== cur.length) {
      f.strikePrevs = cur;
      f.strikeValid = true;
      return;
    }
    const prevs = f.strikePrevs;
    f.strikePrevs = cur;
    const u = a.t / a.dur;
    if (u < m.active[0] - 0.1 || u > m.active[1] + 0.06) return;
    const e = f.enemy;
    if (e.state !== 'ok') return;

    const sr = st.r * f.scale * Math.sqrt(f.girth);
    let best: Part | null = null;
    let bestGap = 0.03 * f.scale;
    let P = cur[cur.length - 1];
    let prev = prevs[prevs.length - 1];
    for (let i = 0; i < cur.length; i++) {
      for (const ep of e.rag.parts) {
        partPoint(ep, ep.hitA, segA);
        partPoint(ep, ep.hitB, segB);
        const d = segSegDist(prevs[i], cur[i], segA, segB, closest) - (sr + ep.hitR);
        if (d < bestGap) {
          bestGap = d;
          best = ep;
          bestPoint.copy(closest);
          P = cur[i];
          prev = prevs[i];
        }
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
    a.landed = true;
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
      2.5 * (att.mass / 78) * (LIMB_MASS[m.limb] ?? 1) * (m.style === 'clean' ? 0.65 + 0.35 * att.tech : 0.85);
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

    // Caught kick: the leg is trapped under the arm and the standing leg is about to be swept.
    if (def.action?.kind === 'catch' && (m.limb === 'lFoot' || m.limb === 'rFoot') && zone !== 'head' && zone !== 'leg' && facingAtt > 0) {
      const ea = att.action!;
      ea.hitDone = true;
      att.caughtUntilW = this.t + 0.6 / def.body;
      att.combo = null;
      att.comboLeft = 0;
      att.mem.oppReact.parry++;
      def.action = null;
      this.startAction(def, 'sweep', { dur: 0.55 });
      def.say(`поймал ${m.name}!`);
      this.moment('ПОЙМАЛ НОГУ!', att);
      att.say('ногу поймали!');
      this.events.push({ type: 'catch', pos: at, target: def });
      return;
    }
    // A blow that only brushes the arm of a man slipping it is a graze, like a block.
    const grazed = def.action?.kind === 'dodge' && !def.action.into && zone === 'arm';
    const blocked = (def.action?.kind === 'block' && zone === 'arm' && facingAtt > 0) || grazed;
    if (blocked) {
      def.blockedSide = part.name[0] as 'l' | 'r';
      def.blockedW = this.t + 0.5 / def.body;
    }
    // Damage grows slower than the impulse, so a much faster fighter needs a few blows, not one.
    let dmg = (7.6 * Math.sqrt(J / 9) * part.def.dmg * Math.sqrt(m.power)) / Math.pow(def.mass / 78, 0.4);
    // A well placed blow lands on the point, a wild one spreads its force.
    dmg *= m.style === 'clean' ? 0.75 + 0.5 * att.tech : 0.85;
    if (fromBehind) dmg *= 1.3;
    if (att.action?.shaken) dmg *= 0.6;
    // Dodging: the wrong way walks into the blow, the right way it only grazes.
    const dodge = def.action?.kind === 'dodge' ? def.action : null;
    let walkedIn = false;
    if (dodge?.into) {
      dmg *= 1.5;
      walkedIn = true;
    } else if (dodge) dmg *= 0.4;
    // A shove moves the man, it does not hurt him.
    if (m.id === 'shove') {
      dmg *= 0.2;
      push.multiplyScalar(2.2);
    }
    dmg *= 1 - 0.3 * att.fatigue;
    if (blocked) dmg *= 0.4;
    if (stone) {
      dmg *= 0.45;
      push.multiplyScalar(0.6);
    }
    this.hurt(def, m, zone, dmg, blocked, seen);
    // Highlights: the view slows down and names the moment.
    if (!blocked && zone !== 'arm') {
      if (walkedIn) this.moment('НАРВАЛСЯ!', def);
      else if (this.t - att.lastDodgeW < 0.9 && dmg > 4) this.moment('УКЛОН И КОНТРА!', def);
      else if (zone === 'head' && (m.id === 'headkick' || m.id === 'spinkick' || m.id === 'spinelbow' || m.id === 'flyknee') && dmg > 6)
        this.moment(m.id === 'headkick' ? 'ХАЙ-КИК!' : m.id === 'flyknee' ? 'КОЛЕНО В ПРЫЖКЕ!' : 'С РАЗВОРОТА!', def);
    }
    if (!blocked && !stone) {
      if (zone === 'head') def.snapHeadW = this.t + (0.1 + 0.012 * dmg) / def.body;
      if (zone === 'body' || dmg > 9) def.snapChestW = this.t + (0.08 + 0.008 * dmg) / def.body;
    }
    def.poise -= blocked ? dmg * 0.5 : dmg * (zone === 'head' ? 1.4 : 1);
    att.hits++;
    if (!blocked) {
      att.mem.hits[m.id] = (att.mem.hits[m.id] ?? 0) + 1;
      this.lastHitW = this.t;
    }
    if (!seen) att.mem.oppReact.none++;
    // The whole body moves at most a few m/s from one blow (more for real super strength),
    // and the momentum spreads through the trunk instead of tearing one limb away.
    const maxDv = 3 * Math.sqrt(Math.max(1, att.p.strength));
    const Jl = push.length();
    if (Jl > def.mass * maxDv) push.multiplyScalar((def.mass * maxDv) / Jl);
    const local = Math.min(1, (part.mass * 5) / Math.max(1e-6, push.length()));
    part.body.applyImpulseAtPoint(
      { x: push.x * local, y: push.y * local, z: push.z * local },
      { x: at.x, y: at.y, z: at.z },
      true,
    );
    if (local < 1) {
      const rest = push.multiplyScalar(1 - local);
      const chest = def.rag.byName.chest;
      const pel = def.rag.pelvis;
      const k = chest.mass / (chest.mass + pel.mass);
      chest.body.applyImpulse({ x: rest.x * k, y: rest.y * k, z: rest.z * k }, true);
      pel.body.applyImpulse({ x: rest.x * (1 - k), y: rest.y * (1 - k), z: rest.z * (1 - k) }, true);
    }

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
    }

    // A sweep takes the leg he stands on: down he goes, more surely if he was moving or kicking.
    if (m.id === 'sweep' && !blocked && zone === 'leg' && def.state === 'ok' && !def.out) {
      const busy = def.action?.kind === 'attack' || def.groundSpeed > 0.8 * def.stride ? 0.35 : 0;
      if (this.rng() < 0.4 + busy + 0.2 * att.tech) {
        this.knockDown(def, 'подсекли', 'back', side0(part.name));
        att.say('подсёк!');
      }
    }
    const sturdy = Math.sqrt(def.mass / 75) * (stone ? 1.6 : 1);
    const interrupted = !blocked && def.action?.kind === 'attack' && dmg > 3.5 * sturdy;
    const side: 'l' | 'r' = part.name.startsWith('l') ? 'l' : 'r';
    if (def.out) {
      this.knockDown(def, 'нокаут', zone === 'head' ? 'timber' : zone === 'body' ? 'fold' : zone === 'leg' ? 'buckle' : 'limp', side);
    } else if (def.flash && def.state === 'ok') {
      // Knockdown: dropped, not out. He will get up, a little more shaken.
      def.flash = false;
      this.moment('НОКДАУН!', def);
      def.knockdowns++;
      this.roundDowns[def.team]++;
      this.knockDown(def, 'нокдаун', this.rng() < 0.5 ? 'back' : 'buckle', side);
      if ((this.rules.roundLen ? this.roundDowns[def.team] : def.knockdowns) >= 3) this.stop(def, 'три нокдауна');
    } else if (def.poise <= 0 && zone === 'body' && !blocked) {
      def.poise = def.maxPoise * 0.5;
      this.knockDown(def, 'скрутило от удара в корпус', 'fold', side);
    } else if (def.poise <= 0 && zone === 'leg') {
      def.poise = def.maxPoise * 0.5;
      this.knockDown(def, 'подсекли ногу', 'buckle', side);
    } else if (def.poise <= 0) {
      // Legs buckle: for a moment he cannot hold himself up, the blow decides where he goes.
      def.poise = def.maxPoise * 0.5;
      def.wobbleUntilW = this.t + 0.45 / def.body;
      def.combo = null;
      def.action = null;
      def.say('ноги подкосились');
    } else if (!blocked && dmg > 3.5 * sturdy) {
      def.combo = null;
      def.comboLeft = 0;
      const da = def.action;
      const stagger = (0.2 + dmg / 50) / sturdy;
      if (da?.kind === 'attack' && !da.feint && !da.hitDone && da.t >= da.dur * da.move!.active[0] * 0.8) {
        // His own blow is already on its way: it goes on with what it has, then he reels.
        da.shaken = true;
        def.staggerAfter = stagger;
      } else {
        // Caught in the wind-up: the limb is not stopped dead, it swings on loose.
        if (da?.kind === 'attack') {
          def.looseLimb = da.move!.limb;
          def.looseUntilW = this.t + 0.35 / def.body;
        }
        this.startAction(def, 'stagger', { dur: stagger });
      }
    }

    def.flash = false;
    if (def.out && !this.winner) {
      this.winner = att;
      def.koReason ||= 'нокаут';
      def.say(def.koReason);
      att.combo = null;
    } else if (limb && def.broken[limb] && def.limbDmg[limb] - (dmg / part.def.dmg) * 0.5 <= def.limbLimit) {
      def.say(`сломана ${LIMB_NAME[limb]}`);
    } else if (def.dazed && zone === 'head') {
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
      zone: ZONE_NAME[zone], stone, part: part.name,
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
      e.daze = Math.min(1, e.daze + dmg / 40);
      e.bodyHurt = Math.min(1, e.bodyHurt + dmg / 80);
      if (e.daze >= 1) e.out = true;
      this.events.push({
        type: 'hit', pos: e.pos.clone().setY(1), power: dv * 2, blocked: false, dmg, target: e,
        fromBehind: false, zone: 'волной', stone,
      });
      if (e.out && !this.winner) {
        this.winner = f;
        e.koReason = 'нокаут';
      }
      if (dv > 3 || e.out) this.knockDown(e, 'сбит волной', 'back');
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
    if (fp.f.state === 'down') fp.f.daze = Math.min(0.95, fp.f.daze + Math.min(0.1, rel * 0.01));
  }
}
