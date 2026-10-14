import * as THREE from 'three';
import type { FighterParams } from './config';
import { MOVES, type Move } from './moves';
import { react, think } from './ai';

// The fight simulation. Time model:
//  - The world runs on world seconds (gravity, flying bodies, crates).
//  - Each fighter's own actions run on local seconds = world seconds × bodySpeed.
//    A fighter with body ×10 punches, steps and recovers ten times faster.
//  - Perception: a fighter notices an enemy's action 0.17 / mindSpeed world
//    seconds after it starts and plans every ~0.2 / mindSpeed world seconds.
//    A faster mind sees a punch coming early and has time to answer it.

export const G = 9.8;
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
  /** World time when an attack becomes able to hit. */
  impactW: number;
  move?: Move;
  hitDone: boolean;
  dir: THREE.Vector3;
  pose?: 'dodgeL' | 'dodgeR' | 'dodgeBack';
}

export type FighterState = 'ok' | 'air' | 'down' | 'ko';

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

  pos = new THREE.Vector3();
  /** External velocity in world m/s: knockback, flight. */
  ext = new THREE.Vector3();
  /** Self-driven velocity in local m/s: walking, lunges, dodges. */
  self = new THREE.Vector3();
  facing = 0;
  hp = 100;
  poise: number;
  state: FighterState = 'ok';
  action: Action | null = null;
  downLeft = 0;
  airT = 0;
  nextThinkW = 0;
  handledThreat = 0;
  moveDir = new THREE.Vector3();
  moveSpeed = 0;
  walkPhase = 0;
  combo: Move | null = null;
  enemy!: Fighter;

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
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  ang: THREE.Vector3;
  half: number;
  mass: number;
  gone: boolean;
}

export type SimEvent =
  | { type: 'hit'; pos: THREE.Vector3; power: number; blocked: boolean; dmg: number; target: Fighter; fromBehind: boolean }
  | { type: 'land'; pos: THREE.Vector3; power: number }
  | { type: 'crash'; pos: THREE.Vector3; power: number };

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class Sim {
  t = 0;
  readonly fighters: [Fighter, Fighter];
  readonly crates: Crate[] = [];
  readonly events: SimEvent[] = [];
  readonly rng: () => number;
  winner: Fighter | null = null;

  constructor(red: FighterParams, blue: FighterParams, seed = 7) {
    this.rng = rng32(seed);
    const a = new Fighter(red, 0);
    const b = new Fighter(blue, 1);
    a.enemy = b;
    b.enemy = a;
    const gap = 2.2 + (a.scale + b.scale) * 0.6;
    a.pos.set(0, 0, -gap / 2);
    b.pos.set(0, 0, gap / 2);
    a.facing = 0;
    b.facing = Math.PI;
    a.nextThinkW = 0.3 / a.mind;
    b.nextThinkW = 0.3 / b.mind;
    this.fighters = [a, b];
    this.layCrates();
  }

  private layCrates(): void {
    const spots: [number, number, number][] = [
      [6.5, 2.5, 0.45], [7.2, 3.4, 0.35], [6.9, 2.9, 0.3],
      [-7, -1.5, 0.5], [-7.6, -0.5, 0.35],
      [2, 8, 0.4], [1.2, 8.6, 0.3], [-3, -8.2, 0.45], [-2.1, -8.7, 0.3],
      [9, -5, 0.55], [-8.5, 5.5, 0.4], [-9.2, 6.2, 0.3],
    ];
    for (const [x, z, half] of spots) {
      this.crates.push({
        pos: new THREE.Vector3(x, half, z),
        vel: new THREE.Vector3(),
        quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI),
        ang: new THREE.Vector3(),
        half,
        mass: 220 * (half * 2) ** 3,
        gone: false,
      });
    }
    // Stack a second crate on two of the piles.
    this.crates.push({
      pos: new THREE.Vector3(6.5, 0.9 + 0.3, 2.5),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      ang: new THREE.Vector3(),
      half: 0.3,
      mass: 220 * 0.6 ** 3,
      gone: false,
    });
    this.crates.push({
      pos: new THREE.Vector3(-7, 1.0 + 0.32, -1.5),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      ang: new THREE.Vector3(),
      half: 0.32,
      mass: 220 * 0.64 ** 3,
      gone: false,
    });
  }

  /** Finest motion in the scene decides the physics step. */
  stepSize(): number {
    const fastest = Math.max(...this.fighters.map((f) => Math.max(f.body, f.mind)));
    return 1 / (240 * fastest);
  }

  advance(worldDt: number): void {
    const h = this.stepSize();
    const n = Math.min(800, Math.ceil(worldDt / h));
    const step = worldDt / Math.max(1, n);
    for (let i = 0; i < n; i++) this.step(step);
  }

  step(h: number): void {
    this.t += h;
    for (const f of this.fighters) this.updateFighter(f, h);
    this.separate();
    this.updateCrates(h);
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
    return a;
  }

  attackRange(f: Fighter, m: Move): number {
    return m.reach * f.scale + f.enemy.radius;
  }

  private updateFighter(f: Fighter, h: number): void {
    const dl = h * f.body;
    if (f.state === 'air') {
      f.airT += h;
      f.ext.y -= G * h;
      f.pos.addScaledVector(f.ext, h);
      if (f.pos.y <= 0 && f.ext.y < 0) {
        const impact = -f.ext.y;
        f.pos.y = 0;
        f.ext.y = 0;
        f.ext.x *= 0.45;
        f.ext.z *= 0.45;
        f.state = f.hp <= 0 ? 'ko' : 'down';
        f.downLeft = 0.7 + Math.min(1.2, impact * 0.08);
        this.events.push({ type: 'land', pos: f.pos.clone(), power: impact * f.scale });
      }
    } else if (f.state === 'down' || f.state === 'ko') {
      this.friction(f, h);
      f.pos.addScaledVector(f.ext, h);
      if (f.state === 'down') {
        f.downLeft -= dl;
        if (f.downLeft <= 0) {
          f.state = 'ok';
          f.poise = f.maxPoise;
          this.startAction(f, 'getup', { dur: 0.55 });
          f.say('встаю');
        }
      }
    } else {
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
        const k = Math.min(1, 14 * dl);
        f.self.lerp(tmpA, k);
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
      f.walkPhase += f.self.length() * dl * (3.2 / f.scale);
      f.pos.addScaledVector(f.self, f.body * h);
      this.friction(f, h);
      f.pos.addScaledVector(f.ext, h);
      f.pos.y = 0;
    }

    const r = Math.hypot(f.pos.x, f.pos.z);
    if (r > ARENA_R && f.pos.y <= 0.01) {
      f.pos.x *= ARENA_R / r;
      f.pos.z *= ARENA_R / r;
      const nx = f.pos.x / r;
      const nz = f.pos.z / r;
      const out = f.ext.x * nx + f.ext.z * nz;
      if (out > 0) {
        f.ext.x -= 1.4 * out * nx;
        f.ext.z -= 1.4 * out * nz;
      }
    }
  }

  private friction(f: Fighter, h: number): void {
    const sp = Math.hypot(f.ext.x, f.ext.z);
    if (sp === 0) return;
    const k = Math.max(0, sp - 10 * h) / sp;
    f.ext.x *= k;
    f.ext.z *= k;
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
        if (u < m.active[0]) {
          f.self.copy(fwd).multiplyScalar((m.lunge * f.scale) / (m.duration * m.active[0]));
        } else {
          f.self.multiplyScalar(Math.max(0, 1 - 20 * dl));
        }
        if (!a.hitDone && u >= m.active[0] && u <= m.active[1]) this.tryHit(f, a);
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

  private tryHit(f: Fighter, a: Action): void {
    const e = f.enemy;
    if (e.state !== 'ok') return;
    const m = a.move!;
    const dir = tmpA.subVectors(e.pos, f.pos).setY(0);
    const dist = dir.length();
    if (dist > this.attackRange(f, m)) return;
    dir.divideScalar(Math.max(1e-6, dist));
    const fwd = f.forward(tmpB);
    const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(dir), -1, 1)));
    if (ang > m.arc) return;
    a.hitDone = true;
    this.resolveHit(f, e, m, dir.clone(), a.id);
  }

  private resolveHit(att: Fighter, def: Fighter, m: Move, dir: THREE.Vector3, actionId: number): void {
    const facingAtt = -def.forward(tmpB).dot(dir);
    const fromBehind = facingAtt < -0.3;
    const blocked = def.action?.kind === 'block' && facingAtt > 0.25;
    const seen = def.handledThreat === actionId;

    const power = m.power * att.p.strength * Math.sqrt(att.body) * Math.pow(att.mass / 75, 0.35);
    let dmg = (7 * power) / Math.pow(def.mass / 75, 0.4);
    let knock = m.knock * att.p.strength * Math.pow(att.body, 0.6) * Math.pow(att.mass / def.mass, 0.7);
    if (fromBehind) dmg *= 1.3;
    if (blocked) {
      dmg *= 0.15;
      knock *= 0.4;
    }
    def.hp = Math.max(0, def.hp - dmg);
    def.poise -= blocked ? dmg * 0.5 : dmg;
    att.hits++;

    const interrupted = !blocked && def.action?.kind === 'attack' && dmg > 3.5 * Math.sqrt(def.mass / 75);
    const knockedDown = !blocked && (knock > 5.5 || def.poise <= 0 || def.hp <= 0);

    if (knockedDown) {
      const k = Math.max(knock, 2.5);
      def.state = 'air';
      def.action = null;
      def.combo = null;
      def.airT = 0;
      def.self.set(0, 0, 0);
      def.ext.set(dir.x * k, 1.6 + k * (0.18 + m.lift), dir.z * k);
      def.pos.y = 0.01;
      def.facing = Math.atan2(-dir.x, -dir.z);
    } else {
      def.ext.addScaledVector(dir, knock);
      // Heavy bodies shrug off light blows and keep attacking: that is how mass trades with speed.
      const sturdy = Math.sqrt(def.mass / 75);
      if (!blocked && dmg > 3.5 * sturdy) {
        def.combo = null;
        this.startAction(def, 'stagger', { dur: (0.2 + dmg / 50) / sturdy });
      }
    }

    if (def.hp <= 0 && !this.winner) {
      this.winner = att;
      def.say('нокаут');
      att.combo = null;
    } else if (blocked) {
      def.say('держу блок');
    } else if (interrupted) {
      def.say('прервали!');
    } else if (!seen) {
      def.say('?! не увидел');
    }

    const at = def.pos.clone().addScaledVector(dir, -def.radius);
    at.y = (m.limb === 'rFoot' ? 1.05 : 1.45) * def.scale;
    this.events.push({ type: 'hit', pos: at, power: knock, blocked, dmg, target: def, fromBehind });
  }

  private separate(): void {
    const [a, b] = this.fighters;
    if (a.state === 'air' || b.state === 'air') return;
    tmpA.subVectors(b.pos, a.pos).setY(0);
    const d = tmpA.length();
    const min = a.radius + b.radius;
    if (d >= min || d === 0) return;
    tmpA.divideScalar(d);
    const push = min - d;
    const wa = b.mass / (a.mass + b.mass);
    a.pos.addScaledVector(tmpA, -push * wa);
    b.pos.addScaledVector(tmpA, push * (1 - wa));
  }

  private updateCrates(h: number): void {
    for (const c of this.crates) {
      if (c.gone) continue;
      c.vel.y -= G * h;
      c.pos.addScaledVector(c.vel, h);
      const onFloor = Math.hypot(c.pos.x, c.pos.z) < FLOOR_R;
      if (onFloor && c.pos.y < c.half) {
        c.pos.y = c.half;
        if (c.vel.y < 0) c.vel.y *= -0.25;
        const sp = Math.hypot(c.vel.x, c.vel.z);
        if (sp > 0) {
          const k = Math.max(0, sp - 7 * h) / sp;
          c.vel.x *= k;
          c.vel.z *= k;
        }
        c.ang.multiplyScalar(Math.max(0, 1 - 5 * h));
        if (sp < 1.2 && c.ang.length() < 1.5) {
          // Settle flat on a face.
          tmpE.setFromQuaternion(c.quat, 'YXZ');
          const snap = (v: number) => Math.round(v / (Math.PI / 2)) * (Math.PI / 2);
          tmpE.x += (snap(tmpE.x) - tmpE.x) * Math.min(1, 8 * h);
          tmpE.z += (snap(tmpE.z) - tmpE.z) * Math.min(1, 8 * h);
          c.quat.setFromEuler(tmpE);
        }
      }
      if (c.pos.y < -40) c.gone = true;
      const w = c.ang.length();
      if (w > 1e-4) {
        tmpQ.setFromAxisAngle(tmpA.copy(c.ang).divideScalar(w), w * h);
        c.quat.premultiply(tmpQ);
      }
    }

    // Crate against crate: push apart, trade some velocity.
    for (let i = 0; i < this.crates.length; i++) {
      const a = this.crates[i];
      if (a.gone) continue;
      for (let j = i + 1; j < this.crates.length; j++) {
        const b = this.crates[j];
        if (b.gone) continue;
        tmpA.subVectors(b.pos, a.pos);
        const d = tmpA.length();
        const min = (a.half + b.half) * 0.98;
        if (d >= min || d === 0) continue;
        tmpA.divideScalar(d);
        const wa = b.mass / (a.mass + b.mass);
        a.pos.addScaledVector(tmpA, -(min - d) * wa);
        b.pos.addScaledVector(tmpA, (min - d) * (1 - wa));
        const rel = tmpB.subVectors(a.vel, b.vel).dot(tmpA);
        if (rel > 0) {
          const j2 = (1.3 * rel) / (1 / a.mass + 1 / b.mass);
          a.vel.addScaledVector(tmpA, -j2 / a.mass);
          b.vel.addScaledVector(tmpA, j2 / b.mass);
        }
      }
    }

    // Fighters against crates.
    for (const f of this.fighters) {
      const top = f.pos.y + 1.8 * f.scale;
      for (const c of this.crates) {
        if (c.gone) continue;
        if (c.pos.y - c.half > top || c.pos.y + c.half < f.pos.y) continue;
        tmpA.subVectors(c.pos, f.pos).setY(0);
        const d = tmpA.length();
        const min = f.radius + c.half * 1.1;
        if (d >= min || d === 0) continue;
        tmpA.divideScalar(d);
        const fv = tmpB.copy(f.self).multiplyScalar(f.body).add(f.ext);
        const into = fv.dot(tmpA) - c.vel.dot(tmpA);
        if (into > 2.5) {
          const ratio = THREE.MathUtils.clamp(f.mass / c.mass, 0.3, 8);
          c.vel.addScaledVector(tmpA, into * ratio * 0.75);
          c.vel.y += into * 0.35;
          c.ang.set((this.rng() - 0.5) * into * 2, (this.rng() - 0.5) * into, (this.rng() - 0.5) * into * 2);
          const keep = Math.max(0.2, 1 - 0.4 * (c.mass / f.mass));
          f.ext.multiplyScalar(keep);
          // Slamming into a crate hurts but never finishes a fighter on its own.
          if (f.state === 'air' && f.hp > 1) f.hp = Math.max(1, f.hp - Math.min(4, into * 0.3));
          this.events.push({ type: 'crash', pos: c.pos.clone(), power: into });
        }
        const wf = c.mass / (f.mass + c.mass);
        f.pos.addScaledVector(tmpA, -(min - d) * wf);
        c.pos.addScaledVector(tmpA, (min - d) * (1 - wf));
      }
    }
  }
}

export const MOVES_BY_SPEED = [...MOVES].sort((a, b) => a.duration * a.active[0] - b.duration * b.active[0]);
