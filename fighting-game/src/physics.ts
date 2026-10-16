import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { buildRig, applyPose, STANCE, type Pose, type Rig } from './rig';

// Active ragdoll. Each fighter is 11 rigid bodies joined by ball joints.
// "Muscles" are PD controllers that push every joint toward the target pose,
// and a balance controller keeps the pelvis upright and at standing height.
// When a fighter is knocked down the muscles go slack and the body falls freely.
//
// Each body's origin sits at its joint, exactly where the matching group of the
// visual rig sits, so the rig can be driven straight from the bodies.

export type PartName =
  | 'pelvis' | 'chest' | 'head'
  | 'lUpper' | 'lFore' | 'rUpper' | 'rFore'
  | 'lThigh' | 'lShin' | 'rThigh' | 'rShin';

type RigKey = 'pelvis' | 'spine' | 'head' | 'lSh' | 'lEl' | 'rSh' | 'rEl' | 'lHip' | 'lKn' | 'rHip' | 'rKn';

interface Shape {
  kind: 'ball' | 'capsule' | 'box';
  /** Radius for ball and capsule; scaled by girth (ball: by sqrt of girth). */
  r?: number;
  /** Capsule half length of the straight part, along Y. */
  hh?: number;
  half?: [number, number, number];
  at: [number, number, number];
  share: number;
}

interface PartDef {
  name: PartName;
  key: RigKey;
  parent: PartName | null;
  share: number;
  shapes: Shape[];
  /** Capsule used for hit tests, in the part's local frame (unscaled). */
  hit: { a: [number, number, number]; b: [number, number, number]; r: number };
  dmg: number;
  zone: 'head' | 'body' | 'arm' | 'leg';
}

const PARTS: PartDef[] = [
  {
    name: 'pelvis', key: 'pelvis', parent: null, share: 0.14,
    shapes: [{ kind: 'box', half: [0.15, 0.09, 0.1], at: [0, 0, 0], share: 1 }],
    hit: { a: [-0.09, 0, 0], b: [0.09, 0, 0], r: 0.11 }, dmg: 0.8, zone: 'body',
  },
  {
    name: 'chest', key: 'spine', parent: 'pelvis', share: 0.3,
    shapes: [{ kind: 'box', half: [0.17, 0.2, 0.11], at: [0, 0.27, 0], share: 1 }],
    hit: { a: [0, 0.1, 0], b: [0, 0.3, 0], r: 0.15 }, dmg: 1, zone: 'body',
  },
  {
    name: 'head', key: 'head', parent: 'chest', share: 0.07,
    shapes: [{ kind: 'ball', r: 0.115, at: [0, 0.13, 0], share: 1 }],
    hit: { a: [0, 0.1, 0], b: [0, 0.16, 0], r: 0.115 }, dmg: 1.6, zone: 'head',
  },
  {
    name: 'lUpper', key: 'lSh', parent: 'chest', share: 0.03,
    shapes: [{ kind: 'capsule', r: 0.055, hh: 0.09, at: [0, -0.145, 0], share: 1 }],
    hit: { a: [0, 0, 0], b: [0, -0.29, 0], r: 0.06 }, dmg: 0.45, zone: 'arm',
  },
  {
    name: 'lFore', key: 'lEl', parent: 'lUpper', share: 0.025,
    shapes: [
      { kind: 'capsule', r: 0.045, hh: 0.08, at: [0, -0.125, 0], share: 0.7 },
      { kind: 'ball', r: 0.062, at: [0, -0.29, 0], share: 0.3 },
    ],
    hit: { a: [0, 0, 0], b: [0, -0.29, 0], r: 0.06 }, dmg: 0.4, zone: 'arm',
  },
  {
    name: 'rUpper', key: 'rSh', parent: 'chest', share: 0.03,
    shapes: [{ kind: 'capsule', r: 0.055, hh: 0.09, at: [0, -0.145, 0], share: 1 }],
    hit: { a: [0, 0, 0], b: [0, -0.29, 0], r: 0.06 }, dmg: 0.45, zone: 'arm',
  },
  {
    name: 'rFore', key: 'rEl', parent: 'rUpper', share: 0.025,
    shapes: [
      { kind: 'capsule', r: 0.045, hh: 0.08, at: [0, -0.125, 0], share: 0.7 },
      { kind: 'ball', r: 0.062, at: [0, -0.29, 0], share: 0.3 },
    ],
    hit: { a: [0, 0, 0], b: [0, -0.29, 0], r: 0.06 }, dmg: 0.4, zone: 'arm',
  },
  {
    name: 'lThigh', key: 'lHip', parent: 'pelvis', share: 0.11,
    shapes: [{ kind: 'capsule', r: 0.075, hh: 0.145, at: [0, -0.22, 0], share: 1 }],
    hit: { a: [0, 0, 0], b: [0, -0.44, 0], r: 0.08 }, dmg: 0.6, zone: 'leg',
  },
  {
    name: 'lShin', key: 'lKn', parent: 'lThigh', share: 0.06,
    shapes: [
      { kind: 'capsule', r: 0.058, hh: 0.16, at: [0, -0.22, 0], share: 0.75 },
      { kind: 'box', half: [0.055, 0.03, 0.12], at: [0, -0.46, 0.05], share: 0.25 },
    ],
    hit: { a: [0, 0, 0], b: [0, -0.46, 0.05], r: 0.065 }, dmg: 0.5, zone: 'leg',
  },
  {
    name: 'rThigh', key: 'rHip', parent: 'pelvis', share: 0.11,
    shapes: [{ kind: 'capsule', r: 0.075, hh: 0.145, at: [0, -0.22, 0], share: 1 }],
    hit: { a: [0, 0, 0], b: [0, -0.44, 0], r: 0.08 }, dmg: 0.6, zone: 'leg',
  },
  {
    name: 'rShin', key: 'rKn', parent: 'rThigh', share: 0.06,
    shapes: [
      { kind: 'capsule', r: 0.058, hh: 0.16, at: [0, -0.22, 0], share: 0.75 },
      { kind: 'box', half: [0.055, 0.03, 0.12], at: [0, -0.46, 0.05], share: 0.25 },
    ],
    hit: { a: [0, 0, 0], b: [0, -0.46, 0.05], r: 0.065 }, dmg: 0.5, zone: 'leg',
  },
];

/** Where each striking limb hits from, in the local frame of its body. */
export const STRIKERS = {
  lHand: { part: 'lFore' as PartName, at: new THREE.Vector3(0, -0.29, 0), r: 0.065 },
  rHand: { part: 'rFore' as PartName, at: new THREE.Vector3(0, -0.29, 0), r: 0.065 },
  lFoot: { part: 'lShin' as PartName, at: new THREE.Vector3(0, -0.45, 0.08), r: 0.075 },
  rFoot: { part: 'rShin' as PartName, at: new THREE.Vector3(0, -0.45, 0.08), r: 0.075 },
  lKnee: { part: 'lThigh' as PartName, at: new THREE.Vector3(0, -0.44, 0.03), r: 0.08 },
  rKnee: { part: 'rThigh' as PartName, at: new THREE.Vector3(0, -0.44, 0.03), r: 0.08 },
  lElbow: { part: 'lUpper' as PartName, at: new THREE.Vector3(0, -0.29, 0), r: 0.065 },
  rElbow: { part: 'rUpper' as PartName, at: new THREE.Vector3(0, -0.29, 0), r: 0.065 },
};

export interface Part {
  name: PartName;
  key: RigKey;
  def: PartDef;
  parent: Part | null;
  body: RAPIER.RigidBody;
  mass: number;
  /** Center of mass in the body frame, meters. */
  com: THREE.Vector3;
  hitA: THREE.Vector3;
  hitB: THREE.Vector3;
  hitR: number;
}

export interface Ragdoll {
  parts: Part[];
  byName: Record<PartName, Part>;
  pelvis: Part;
  /** Invisible copy of the rig used to turn poses into joint targets. */
  target: Rig;
  totalMass: number;
  colliders: Map<number, Part>;
}

export const GROUP_ENV = 0x0004;

export function collisionGroups(member: number, filter: number): number {
  return (member << 16) | filter;
}

const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const tq3 = new THREE.Quaternion();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tv3 = new THREE.Vector3();
const tw = new THREE.Vector3();

export function q(r: RAPIER.Rotation, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.set(r.x, r.y, r.z, r.w);
}

export function v(r: RAPIER.Vector, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(r.x, r.y, r.z);
}

export function createRagdoll(
  world: RAPIER.World,
  opts: { scale: number; girth: number; weight: number; spawn: THREE.Vector3; facing: number; team: 0 | 1 },
): Ragdoll {
  const { scale: s, girth: g } = opts;
  const target = buildRig(0xffffff, g);
  target.root.position.copy(opts.spawn);
  target.root.rotation.y = opts.facing;
  target.root.scale.setScalar(s);
  applyPose(target, STANCE);
  target.root.updateMatrixWorld(true);

  const self = opts.team === 0 ? 0x0001 : 0x0002;
  const other = opts.team === 0 ? 0x0002 : 0x0001;
  const groups = collisionGroups(self, other | GROUP_ENV);

  const parts: Part[] = [];
  const byName = {} as Record<PartName, Part>;
  const colliders = new Map<number, Part>();

  for (const def of PARTS) {
    const grp = target[def.key];
    grp.getWorldPosition(tv);
    grp.getWorldQuaternion(tq);
    const mass = opts.weight * def.share;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(tv.x, tv.y, tv.z)
        .setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(def.zone === 'arm' || def.zone === 'leg'),
    );
    const com = new THREE.Vector3();
    for (const sh of def.shapes) {
      let cd: RAPIER.ColliderDesc;
      if (sh.kind === 'ball') cd = RAPIER.ColliderDesc.ball(sh.r! * s * Math.sqrt(g));
      else if (sh.kind === 'capsule') cd = RAPIER.ColliderDesc.capsule(sh.hh! * s, sh.r! * s * g);
      else cd = RAPIER.ColliderDesc.cuboid(sh.half![0] * s * g, sh.half![1] * s, sh.half![2] * s * (def.zone === 'leg' ? 1 : g));
      const m = mass * sh.share;
      cd.setTranslation(sh.at[0] * s, sh.at[1] * s, sh.at[2] * s)
        .setMass(m)
        .setFriction(0.7)
        .setRestitution(0.05)
        .setCollisionGroups(groups);
      const c = world.createCollider(cd, body);
      com.add(new THREE.Vector3(...sh.at).multiplyScalar(s * m));
      const part = def.name;
      colliders.set(c.handle, part as unknown as Part);
    }
    com.divideScalar(mass);
    const parent = def.parent ? byName[def.parent] : null;
    const part: Part = {
      name: def.name,
      key: def.key,
      def,
      parent,
      body,
      mass,
      com,
      hitA: new THREE.Vector3(def.hit.a[0] * s * g, def.hit.a[1] * s, def.hit.a[2] * s),
      hitB: new THREE.Vector3(def.hit.b[0] * s * g, def.hit.b[1] * s, def.hit.b[2] * s),
      hitR: def.hit.r * s * (def.zone === 'head' ? Math.sqrt(g) : g),
    };
    if (parent) {
      const anchor = grp.position.clone().multiplyScalar(s);
      world.createImpulseJoint(
        RAPIER.JointData.spherical({ x: anchor.x, y: anchor.y, z: anchor.z }, { x: 0, y: 0, z: 0 }),
        parent.body,
        body,
        true,
      );
    }
    parts.push(part);
    byName[def.name] = part;
  }
  for (const [h, name] of colliders) colliders.set(h, byName[name as unknown as PartName]);

  const totalMass = parts.reduce((a, p) => a + p.mass, 0);
  const pelvis = byName.pelvis;

  return { parts, byName, pelvis, target, totalMass, colliders };
}

/** World position of a point given in a part's local frame. */
export function partPoint(p: Part, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(local).applyQuaternion(q(p.body.rotation(), tq)).add(v(p.body.translation(), tv3));
}

export interface Drive {
  /** Speed multiplier of the body (bodySpeed). */
  speed: number;
  /** 0..1 how hard the muscles hold the pose. */
  tone: number;
  /** 0..1 strength of balance and standing support. */
  balance: number;
  strength: number;
  facing: number;
  /** Desired horizontal pelvis velocity, world m/s. */
  move: THREE.Vector3;
  pose: Pose;
  scale: number;
  /** Multiplier on how hard the legs can push (a dash). */
  boost?: number;
  /** Per-part multiplier on muscle strength, e.g. a broken arm hangs limp. */
  partTone?: Partial<Record<PartName, number>>;
  /** World orientations that replace the pose for some parts, e.g. an arm aimed by IK. */
  override?: Partial<Record<PartName, THREE.Quaternion>>;
  /**
   * 0..1 how well the fighter is balanced over the feet. Below 1 the trunk and
   * legs stop being held upright in the world and the body can tip over as one
   * piece; the arms keep working.
   */
  stability?: number;
  /** Extra tilt of the whole target pose, used to rise from lying to standing. */
  rootTilt?: THREE.Quaternion;
  /**
   * 0..1 how relaxed: lower muscle stiffness for the arms, head and chest, so they
   * lag and swing with their own weight. 0 = fully tense.
   */
  relax?: number;
  /** A point the eyes stay on: the head turns to it ahead of the body. */
  look?: THREE.Vector3;
  /** Chin tucked this many degrees below the line to the look point. */
  lookTuck?: number;
  /** Pelvis height to hold instead of the pose height (getting up). */
  pelvisY?: number;
  /**
   * Thighs of the legs standing on the floor. Muscles are internal: the torque
   * that keeps the pelvis upright pushes against these legs, so nothing holds the
   * body up from outside and it can only stay up with its weight over its feet.
   */
  stanceLegs?: PartName[];
}

const ARMS = new Set<PartName>(['lUpper', 'lFore', 'rUpper', 'rFore']);

/**
 * Joint ranges, degrees, relative to the parent: elbows and knees are hinges
 * that bend one way only, the rest are cones around the rest direction.
 */
const LIMITS: Partial<Record<PartName, { hinge?: [number, number]; cone?: number }>> = {
  chest: { cone: 55 },
  head: { cone: 65 },
  lUpper: { cone: 165 },
  rUpper: { cone: 165 },
  lFore: { hinge: [-155, 4] },
  rFore: { hinge: [-155, 4] },
  lThigh: { cone: 125 },
  rThigh: { cone: 125 },
  lShin: { hinge: [-4, 150] },
  rShin: { hinge: [-4, 150] },
};
const DEG = Math.PI / 180;
const lq = new THREE.Quaternion();
const lq2 = new THREE.Quaternion();
const lv = new THREE.Vector3();
const lw = new THREE.Vector3();
const lt = new THREE.Vector3();

/** Correction (axis * angle, parent frame) that brings a joint back inside its range. */
function limitCorrection(name: PartName, parentQ: THREE.Quaternion, childQ: THREE.Quaternion, out: THREE.Vector3): boolean {
  const lim = LIMITS[name];
  if (!lim) return false;
  lq.copy(parentQ).invert().multiply(childQ);
  if (lq.w < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w);
  out.set(0, 0, 0);
  if (lim.hinge) {
    // Twist about the hinge axis (local X), anything else is swing that a hinge cannot do.
    const twist = 2 * Math.atan2(lq.x, lq.w);
    lq2.setFromAxisAngle(lv.set(1, 0, 0), twist).invert();
    lq2.premultiply(lq);
    const sinHalf = Math.hypot(lq2.x, lq2.y, lq2.z);
    if (sinHalf > 0.02) {
      const ang = 2 * Math.atan2(sinHalf, Math.abs(lq2.w));
      out.set(lq2.x, lq2.y, lq2.z).multiplyScalar((-ang / sinHalf) * Math.sign(lq2.w || 1));
    }
    const [lo, hi] = lim.hinge;
    if (twist < lo * DEG) out.x += lo * DEG - twist;
    else if (twist > hi * DEG) out.x += hi * DEG - twist;
  } else if (lim.cone) {
    const sinHalf = Math.hypot(lq.x, lq.y, lq.z);
    const ang = 2 * Math.atan2(sinHalf, lq.w);
    if (ang > lim.cone * DEG && sinHalf > 1e-6) out.set(lq.x, lq.y, lq.z).multiplyScalar(-(ang - lim.cone * DEG) / sinHalf);
  }
  return out.lengthSq() > 1e-8;
}
const UP = new THREE.Vector3(0, 1, 0);

function rotErr(target: THREE.Quaternion, cur: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
  // Rotation that takes cur to target, as an axis * angle vector.
  tq3.copy(cur).invert().premultiply(target);
  if (tq3.w < 0) tq3.set(-tq3.x, -tq3.y, -tq3.z, -tq3.w);
  const sinHalf = Math.hypot(tq3.x, tq3.y, tq3.z);
  if (sinHalf < 1e-6) return out.set(0, 0, 0);
  const angle = 2 * Math.atan2(sinHalf, tq3.w);
  return out.set(tq3.x, tq3.y, tq3.z).multiplyScalar(angle / sinHalf);
}

/** Muscle frequency per part relative to the base (lower = heavier, laggier). */
const FREQ: Partial<Record<PartName, number>> = { lUpper: 0.8, rUpper: 0.8, lFore: 0.75, rFore: 0.75, head: 0.8 };

const alphaW = new THREE.Vector3();
const alphaR = new THREE.Vector3();
const want = new THREE.Quaternion();

/** World inertia tensor times a vector; returns the scalar mean inertia as well. */
function inertiaTimes(body: RAPIER.RigidBody, a: THREE.Vector3, out: THREE.Vector3): number {
  const e = body.effectiveAngularInertia().elements;
  out.set(
    e[0] * a.x + e[1] * a.y + e[2] * a.z,
    e[1] * a.x + e[3] * a.y + e[4] * a.z,
    e[2] * a.x + e[4] * a.y + e[5] * a.z,
  );
  return (e[0] + e[3] + e[5]) / 3;
}

const lookD = new THREE.Vector3();
const lookQ = new THREE.Quaternion();
const lookE = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Turns the head's target toward a point: mostly the eyes on it, chin tucked, while
 * keeping some of the pose's own head movement (a slip still tilts the head).
 */
function lookAt(head: Part, at: THREE.Vector3, tuckDeg: number, want: THREE.Quaternion): void {
  const hp = head.body.translation();
  lookD.set(at.x - hp.x, at.y - hp.y, at.z - hp.z);
  const len = lookD.length();
  if (len < 0.2) return;
  lookD.divideScalar(len);
  const yaw = Math.atan2(lookD.x, lookD.z);
  // Positive X rotation turns the face down.
  const pitch = Math.asin(THREE.MathUtils.clamp(-lookD.y, -1, 1)) + tuckDeg * DEG;
  // Keep the pose's roll (side tilt of a slip), replace where the face points.
  lookE.setFromQuaternion(want, 'YXZ');
  let dy = yaw - lookE.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  // The neck turns only so far from the pose.
  const y = lookE.y + THREE.MathUtils.clamp(dy, -1.1, 1.1);
  const x = THREE.MathUtils.lerp(lookE.x, pitch, 0.7);
  lookQ.setFromEuler(lookE.set(x, y, lookE.z, 'YXZ'));
  want.slerp(lookQ, 0.8);
}

function capped(tau: THREE.Vector3, cap: number): THREE.Vector3 {
  const len = tau.length();
  if (len > cap) tau.multiplyScalar(cap / len);
  return tau;
}

/**
 * Apply one step of muscle, balance and walking forces.
 *
 * Standing (balance > 0): every body part is steered toward its world
 * orientation in the target pose, TABS style. Each part uses its own inertia,
 * which keeps the controller stable at any speed.
 * Fallen (balance = 0): only weak joint-relative muscles remain (tone), so the
 * body flops like a ragdoll but keeps a loose shape.
 */
export function drive(r: Ragdoll, d: Drive, h: number): void {
  const t = r.target;
  t.root.position.set(0, 0, 0);
  t.root.quaternion.setFromAxisAngle(UP, d.facing);
  if (d.rootTilt) t.root.quaternion.premultiply(d.rootTilt);
  t.root.scale.setScalar(1);
  applyPose(t, d.pose);
  t.root.updateMatrixWorld(true);

  const s = d.speed;
  const w0 = 2 * Math.PI * 10 * s;
  const kp = w0 * w0;
  const kd = 2 * w0;
  const kpL = kp * 0.3 * d.tone;
  const kdL = 2 * w0 * Math.sqrt(0.3 * d.tone);
  const capK = kp * 1.2 * Math.sqrt(d.strength);
  const balance = d.balance;
  const stab = d.stability ?? 1;

  for (const p of r.parts) {
    const cur = q(p.body.rotation(), tq);
    const w = v(p.body.angvel(), tv);
    const pt = d.partTone?.[p.name] ?? 1;
    // How much this part is held in the world (standing) versus only relative to its parent.
    const stand = balance * (ARMS.has(p.name) ? 1 : stab);
    alphaW.set(0, 0, 0);
    if (stand > 0) {
      const ov = d.override?.[p.name];
      if (ov) want.copy(ov);
      else t[p.key].getWorldQuaternion(want);
      if (p.name === 'head' && d.look && !ov) lookAt(p, d.look, d.lookTuck ?? 10, want);
      // Limbs have their own inertia: arms and the head follow a little behind the trunk.
      // Relaxed, they follow further behind, carried by the body rather than held.
      const rx = d.relax ?? 0;
      const soft = rx > 0 ? (ARMS.has(p.name) ? 1 - 0.75 * rx : p.name === 'head' ? 1 - 0.6 * rx : p.name === 'chest' ? 1 - 0.35 * rx : 1) : 1;
      const fq = (FREQ[p.name] ?? 1) * Math.sqrt(soft);
      rotErr(want, cur, alphaW).multiplyScalar(kp * fq * fq).addScaledVector(w, -kd * fq).multiplyScalar(stand * pt);
    }
    let Ibar = inertiaTimes(p.body, alphaW, alphaW);
    // A part driven harder than usual (a kicking leg) also gets more muscle to do it.
    capped(alphaW, Ibar * capK * Math.max(1, pt));
    if (p.parent && stand < 1 && d.tone > 0) {
      const pq = q(p.parent.body.rotation(), tq2);
      want.copy(pq).multiply(t[p.key].quaternion);
      const wp = v(p.parent.body.angvel(), tv2);
      rotErr(want, cur, alphaR).multiplyScalar(kpL).addScaledVector(w.sub(wp), -kdL).multiplyScalar((1 - stand) * pt);
      Ibar = inertiaTimes(p.body, alphaR, alphaR);
      capped(alphaR, Ibar * capK).multiplyScalar(h);
      p.parent.body.applyTorqueImpulse({ x: -alphaR.x, y: -alphaR.y, z: -alphaR.z }, true);
      alphaW.addScaledVector(alphaR, 1 / h);
    }
    alphaW.multiplyScalar(h);
    p.body.applyTorqueImpulse({ x: alphaW.x, y: alphaW.y, z: alphaW.z }, true);

    // Joint ranges: a stiff push back once a joint leaves its natural range.
    if (p.parent) {
      const pq = q(p.parent.body.rotation(), tq2);
      if (limitCorrection(p.name, pq, q(p.body.rotation(), tq), lt)) {
        lt.applyQuaternion(pq);
        lw.copy(v(p.body.angvel(), tv)).sub(v(p.parent.body.angvel(), tv2));
        // Spring back plus damping of the motion that pushes further out.
        const along = lv.copy(lt).normalize();
        const tau = lt.multiplyScalar(kp * 0.6).addScaledVector(along, -lw.dot(along) * kd * 0.8);
        const Ib = inertiaTimes(p.body, tau, tau);
        capped(tau, Ib * kp * 3);
        tau.multiplyScalar(h);
        p.body.applyTorqueImpulse({ x: tau.x, y: tau.y, z: tau.z }, true);
        // While standing, the trunk is held by the balance controller; a limb hitting
        // its joint limit (a kick reaching past the hip's range) must not tip it over,
        // so the reaction on the trunk fades in only as the fighter loses his feet.
        const back = 1 - balance * stab;
        if (back > 0) p.parent.body.applyTorqueImpulse({ x: -tau.x * back, y: -tau.y * back, z: -tau.z * back }, true);
      }
    }
  }

  const stand = balance * stab;
  if (stand <= 0) return;

  // Standing support: a spring that holds the pelvis at the pose height, and
  // walking: pushing toward the desired velocity. Both act on pelvis and chest.
  // The legs push too (their IK aims for this height), the spring only helps.
  const pb = r.pelvis.body;
  const pos = pb.translation();
  const vel = pb.linvel();
  const standY = d.pelvisY ?? t.pelvis.position.y * d.scale;
  const M = r.totalMass;
  let fy = 0;
  if (pos.y < standY + 0.45 * d.scale) {
    const ws = 2 * Math.PI * 2.5 * s;
    fy = M * (9.81 + ws * ws * (standY - pos.y) - 2 * ws * vel.y);
    fy = THREE.MathUtils.clamp(fy, 0, M * 9.81 * 2.5 * s * s) * stand * 0.7;
  }
  const boost = d.boost ?? 1;
  const kv = 10 * s * Math.sqrt(boost);
  let fx = M * kv * (d.move.x - vel.x);
  let fz = M * kv * (d.move.z - vel.z);
  // Feet can only push so hard: about half of g, more during a dash.
  const capA = M * 5 * s * s * boost;
  const fl = Math.hypot(fx, fz);
  if (fl > capA) {
    fx *= capA / fl;
    fz *= capA / fl;
  }
  const chest = r.byName.chest;
  const share = r.pelvis.mass / (r.pelvis.mass + chest.mass);
  for (const [b, k] of [[pb, share], [chest.body, 1 - share]] as const) {
    b.applyImpulse({ x: fx * h * stand * k, y: fy * h * k, z: fz * h * stand * k }, true);
  }
}

/** Holds a planted foot on its spot, like friction and the weight on it would. */
export function anchorFoot(
  r: Ragdoll,
  side: 'l' | 'r',
  spot: THREE.Vector3,
  local: THREE.Vector3,
  scale: number,
  speed: number,
  maxForce: number,
  h: number,
): void {
  const shin = r.byName[side === 'l' ? 'lShin' : 'rShin'];
  const p = partPoint(shin, tv.copy(local).multiplyScalar(scale), tv2);
  const lv = shin.body.linvel();
  const w = 2 * Math.PI * 5 * speed;
  const m = shin.mass * 3;
  let fx = m * (w * w * (spot.x - p.x) - 2 * w * lv.x);
  let fz = m * (w * w * (spot.z - p.z) - 2 * w * lv.z);
  const len = Math.hypot(fx, fz);
  if (len > maxForce) {
    fx *= maxForce / len;
    fz *= maxForce / len;
  }
  // Only pull a lifted foot back down, never into the floor.
  const fy = p.y > spot.y + 0.02 * scale ? -m * w * w * 0.3 * (p.y - spot.y) : 0;
  shin.body.applyImpulseAtPoint({ x: fx * h, y: fy * h, z: fz * h }, { x: p.x, y: p.y, z: p.z }, true);
}

/** Copy body transforms onto a visual rig built with the same proportions. */
export function syncRig(r: Ragdoll, rig: Rig, scale: number): void {
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  rig.root.scale.setScalar(scale);
  rig.tilt.rotation.set(0, 0, 0);
  for (const p of r.parts) {
    const g = rig[p.key];
    const pos = v(p.body.translation(), tv);
    const rot = q(p.body.rotation(), tq);
    if (!p.parent) {
      g.position.copy(pos).divideScalar(scale);
      g.quaternion.copy(rot);
    } else {
      const pq = q(p.parent.body.rotation(), tq2).invert();
      g.position.copy(pos).sub(v(p.parent.body.translation(), tv2)).applyQuaternion(pq).divideScalar(scale);
      g.quaternion.copy(pq.multiply(rot));
    }
  }
}

/** Closest distance between segments p1-q1 and p2-q2. */
export function segSegDist(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3, outOnSeg2: THREE.Vector3): number {
  const d1 = tv.subVectors(q1, p1);
  const d2 = tv2.subVectors(q2, p2);
  const rr = tv3.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(rr);
  let sP: number;
  let tP: number;
  if (a <= 1e-9 && e <= 1e-9) {
    outOnSeg2.copy(p2);
    return p1.distanceTo(p2);
  }
  if (a <= 1e-9) {
    sP = 0;
    tP = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(rr);
    if (e <= 1e-9) {
      tP = 0;
      sP = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      sP = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      tP = (b * sP + f) / e;
      if (tP < 0) {
        tP = 0;
        sP = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (tP > 1) {
        tP = 1;
        sP = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = tw.copy(p1).addScaledVector(d1, sP);
  outOnSeg2.copy(p2).addScaledVector(d2, tP);
  return c1.distanceTo(outOnSeg2);
}

const ikS = new THREE.Vector3();
const ikDir = new THREE.Vector3();
const ikPole = new THREE.Vector3();
const ikE = new THREE.Vector3();
const ikU = new THREE.Vector3();
const ikF = new THREE.Vector3();
const ikX = new THREE.Vector3();
const ikY = new THREE.Vector3();
const ikZ = new THREE.Vector3();
const ikM = new THREE.Matrix4();
export const ARM_UPPER = 0.29;
export const ARM_FORE = 0.29;
export const LEG_THIGH = 0.44;
export const LEG_SHIN = 0.46;

/**
 * Two-bone IK: world orientations of an upper and a lower bone that put the end
 * at `target`, with the middle joint pushed toward `pole`. Bones point along
 * local -Y. `bend` is the local Z direction the lower bone folds toward:
 * +1 for elbows (forearm folds forward), -1 for knees (shin folds back).
 */
export function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  L1: number,
  L2: number,
  bend: 1 | -1,
  outUpper: THREE.Quaternion,
  outLower: THREE.Quaternion,
): void {
  ikS.copy(root);
  ikDir.subVectors(target, ikS);
  const dist = THREE.MathUtils.clamp(ikDir.length(), Math.abs(L1 - L2) + 0.05 * (L1 + L2), (L1 + L2) * 0.999);
  ikDir.normalize();
  const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir));
  if (ikPole.lengthSq() < 1e-8) ikPole.set(0, -1, 0).addScaledVector(ikDir, ikDir.y);
  ikPole.normalize();
  ikE.copy(ikS).addScaledVector(ikDir, cosA * L1).addScaledVector(ikPole, sinA * L1);
  ikU.subVectors(ikE, ikS).normalize();
  ikF.copy(ikS).addScaledVector(ikDir, dist).sub(ikE).normalize();

  // Upper bone: Y back along the bone, Z toward (elbow) or away from (knee) the fold.
  ikY.copy(ikU).negate();
  ikZ.copy(ikF).addScaledVector(ikU, -ikF.dot(ikU));
  if (ikZ.lengthSq() < 1e-6) ikZ.copy(ikPole).negate();
  ikZ.normalize().multiplyScalar(bend);
  ikX.crossVectors(ikY, ikZ).normalize();
  ikZ.crossVectors(ikX, ikY);
  outUpper.setFromRotationMatrix(ikM.makeBasis(ikX, ikY, ikZ));

  // Lower bone shares the hinge axis.
  ikY.copy(ikF).negate();
  ikZ.crossVectors(ikX, ikY).normalize();
  outLower.setFromRotationMatrix(ikM.makeBasis(ikX, ikY, ikZ));
}

const ikRoot = new THREE.Vector3();

/** Arm IK: fist at `target`, elbow toward `pole`. */
export function solveArmIK(
  r: Ragdoll,
  side: 'l' | 'r',
  target: THREE.Vector3,
  pole: THREE.Vector3,
  scale: number,
  outUpper: THREE.Quaternion,
  outFore: THREE.Quaternion,
): void {
  v(r.byName[side === 'l' ? 'lUpper' : 'rUpper'].body.translation(), ikRoot);
  solveTwoBone(ikRoot, target, pole, ARM_UPPER * scale, ARM_FORE * scale, 1, outUpper, outFore);
}

/** Leg IK: ankle at `target`, knee toward `pole`. */
export function solveLegIK(
  r: Ragdoll,
  side: 'l' | 'r',
  target: THREE.Vector3,
  pole: THREE.Vector3,
  scale: number,
  outThigh: THREE.Quaternion,
  outShin: THREE.Quaternion,
): void {
  v(r.byName[side === 'l' ? 'lThigh' : 'rThigh'].body.translation(), ikRoot);
  solveTwoBone(ikRoot, target, pole, LEG_THIGH * scale, LEG_SHIN * scale, -1, outThigh, outShin);
}
