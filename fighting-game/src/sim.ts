import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { FighterParams } from './config';
import type { Move } from './moves';
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

export type ActionKind = 'attack' | 'dodge' | 'block' | 'stagger' | 'getup' | 'victory';

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
  }

  get body(): number {
    return this.p.bodySpeed;
  }

  get mind(): number {
    return this.p.linkMind ? this.p.bodySpeed : this.p.mindSpeed;
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
    return 2.6 * Math.sqrt(this.scale);
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
  | { type: 'hit'; pos: THREE.Vector3; power: number; blocked: boolean; dmg: number; target: Fighter; fromBehind: boolean; zone: string }
  | { type: 'land'; pos: THREE.Vector3; power: number }
  | { type: 'crash'; pos: THREE.Vector3; power: number };

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

  startAction(f: Fighter, kind: ActionKind, opts: { move?: Move; dur?: number; dir?: THREE.Vector3; pose?: Action['pose'] } = {}): Action {
    const m = opts.move;
    const dur = m ? m.duration : opts.dur ?? 0.3;
    const a: Action = {
      kind,
      id: actionSeq++,
      t: 0,
      dur,
      startW: this.t,
      impactW: m ? this.t + (m.duration * m.active[0]) / f.body : this.t,
      move: m,
      hitDone: false,
      dir: opts.dir ? opts.dir.clone() : new THREE.Vector3(),
      pose: opts.pose,
    };
    f.action = a;
    f.strikeValid = false;
    return a;
  }

  attackRange(f: Fighter, m: Move): number {
    return m.reach * f.scale + f.enemy.radius;
  }

  private knockDown(f: Fighter, why: string): void {
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
    if (f.state === 'ok') {
      const getup = f.action?.kind === 'getup';
      f.balance = Math.min(1, f.balance + dl / (getup ? 0.6 : 0.3));
      f.tone = Math.min(1, f.tone + dl / 0.4);
      f.poise = Math.min(f.maxPoise, f.poise + 10 * dl);
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
      if (!a || a.kind === 'block') {
        tmpA.copy(f.moveDir).multiplyScalar(f.moveSpeed * (a ? 0.35 : 1));
        f.self.lerp(tmpA, Math.min(1, 14 * dl));
      }
      // Stay off the edge unless something throws you over it.
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r > ARENA_R - 1.5) {
        tmpB.set(f.pos.x / r, 0, f.pos.z / r);
        const out = f.self.dot(tmpB);
        if (out > 0) f.self.addScaledVector(tmpB, -out * Math.min(1, (r - (ARENA_R - 1.5)) / 1.5));
      }
      const lockTurn = a?.kind === 'attack' && a.t > a.dur * a.move!.active[0] * 0.5;
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
          // Face the way the body is lying so it does not spin while standing up.
          tmpA.set(0, 0, 1).applyQuaternion(q(f.rag.pelvis.body.rotation(), tmpQ));
          f.facing = Math.atan2(tmpA.x, tmpA.z);
          this.startAction(f, 'getup', { dur: 0.8 });
          f.say('встаю');
        }
      }
    }

    targetPose(f, f.pose);
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
      },
      h,
    );
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
        if (u < m.active[0]) f.self.copy(fwd).multiplyScalar((m.lunge * f.scale) / (m.duration * m.active[0]));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        break;
      }
      case 'dodge':
        if (u < 0.7) f.self.copy(a.dir).multiplyScalar(3.4 * Math.sqrt(f.scale));
        else f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        break;
      case 'block':
        break;
      default:
        f.self.multiplyScalar(Math.max(0, 1 - 15 * dl));
    }
    if (a.t >= a.dur) {
      f.action = null;
      if (a.kind === 'attack' && f.combo && f.enemy.state === 'ok') {
        const next = f.combo;
        f.combo = null;
        tmpA.subVectors(f.enemy.pos, f.pos).setY(0);
        if (tmpA.length() <= this.attackRange(f, next) + next.lunge * f.scale) {
          this.startAction(f, 'attack', { move: next });
          f.say(`и ${next.name}`);
        }
      }
    }
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
    const blocked = def.action?.kind === 'block' && zone === 'arm' && facingAtt > 0;
    const seen = def.handledThreat === actionId;

    // Impulse: the fist (with the arm and body behind it) at its closing speed, multiplied by muscle.
    const mEff = 2.5 * (att.mass / 78) * (m.limb === 'rFoot' ? 1.6 : 1);
    const J = mEff * closing * (0.6 + 0.8 * att.p.strength);
    // Damage grows slower than the impulse, so a much faster fighter needs a few blows, not one.
    let dmg = (9 * Math.sqrt(J / 9) * part.def.dmg * Math.sqrt(m.power)) / Math.pow(def.mass / 78, 0.4);
    if (fromBehind) dmg *= 1.3;
    if (blocked) dmg *= 0.4;
    def.hp = Math.max(0, def.hp - dmg);
    def.poise -= blocked ? dmg * 0.5 : dmg * (zone === 'head' ? 1.4 : 1);
    att.hits++;

    const push = dir.clone().add(dirH).normalize();
    push.y += m.lift * 0.6;
    push.normalize().multiplyScalar(J);
    part.body.applyImpulseAtPoint({ x: push.x, y: push.y, z: push.z }, { x: at.x, y: at.y, z: at.z }, true);

    const sturdy = Math.sqrt(def.mass / 75);
    const interrupted = !blocked && def.action?.kind === 'attack' && dmg > 3.5 * sturdy;
    if (def.hp <= 0 || def.poise <= 0) {
      this.knockDown(def, 'сбит с ног');
    } else if (!blocked && dmg > 3.5 * sturdy) {
      def.combo = null;
      this.startAction(def, 'stagger', { dur: (0.2 + dmg / 50) / sturdy });
    }

    if (def.hp <= 0 && !this.winner) {
      this.winner = att;
      def.koReason = 'нокаут';
      def.say('нокаут');
      att.combo = null;
    } else if (blocked) {
      def.say('держу блок');
    } else if (interrupted) {
      def.say('прервали!');
    } else if (!seen && def.state === 'ok') {
      def.say('?! не увидел');
    }

    this.events.push({
      type: 'hit', pos: at, power: (J / def.mass) * 4, blocked, dmg, target: def, fromBehind,
      zone: ZONE_NAME[zone],
    });
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
