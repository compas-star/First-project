import * as THREE from 'three';
import type { PartName } from './physics';
import { partPoint, solveArmIK, v } from './physics';
import type { Action, Fighter } from './sim';

// Aimed punches. Instead of replaying a fixed arm animation, the fist follows a
// path to a point on the enemy's real body, recomputed every step, and the arm
// is posed by IK. Paths are described in the puncher's body frame:
// (forward, up, outward from that shoulder), in meters for a 1.8 m fighter.

type Path = NonNullable<NonNullable<Action['move']>['path']>;

interface PathShape {
  /** Where the fist goes while loading the punch, relative to the shoulder. */
  chamber: [number, number, number];
  /** Bezier control point of the strike leg; null for a straight line. */
  via: [number, number, number] | null;
  /** Elbow hint. */
  pole: [number, number, number];
}

const SHAPES: Record<Path, PathShape> = {
  straight: { chamber: [0.2, 0.02, 0.06], via: null, pole: [0, -1, 0.7] },
  hook: { chamber: [0.14, -0.02, 0.36], via: [0.42, 0.02, 0.4], pole: [0, 0.35, 1] },
  upper: { chamber: [0.14, -0.34, 0.06], via: [0.3, -0.2, 0.02], pole: [-0.3, -1, 0.35] },
  swing: { chamber: [-0.12, 0.14, 0.45], via: [0.32, 0.16, 0.6], pole: [0, 0.6, 1] },
};

/** Point on the enemy each zone is aimed at, in that part's local frame (unscaled). */
const AIM: Record<'head' | 'body' | 'leg', { part: PartName; at: [number, number, number] }> = {
  head: { part: 'head', at: [0, 0.12, 0] },
  body: { part: 'chest', at: [0, 0.16, 0] },
  leg: { part: 'lThigh', at: [0, -0.2, 0] },
};

const fwd = new THREE.Vector3();
const out = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const shoulder = new THREE.Vector3();
const tmp = new THREE.Vector3();
const aim = new THREE.Vector3();
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const hand = new THREE.Vector3();
const pole = new THREE.Vector3();
const FIST = new THREE.Vector3(0, -0.29, 0);

const ease = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

function basis(f: Fighter, side: 'l' | 'r'): void {
  fwd.set(Math.sin(f.facing), 0, Math.cos(f.facing));
  // Fighter's left is +X when facing +Z.
  out.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  if (side === 'r') out.negate();
  v(f.rag.byName[side === 'l' ? 'lUpper' : 'rUpper'].body.translation(), shoulder);
}

function fromBasis(o: [number, number, number] | THREE.Vector3, s: number, res: THREE.Vector3): THREE.Vector3 {
  const [x, y, z] = Array.isArray(o) ? o : [o.x, o.y, o.z];
  return res.copy(shoulder).addScaledVector(fwd, x * s).addScaledVector(up, y * s).addScaledVector(out, z * s);
}

/** Where this punch is aimed right now, in world space. */
export function aimPointOf(f: Fighter, a: Action, res: THREE.Vector3): THREE.Vector3 {
  const z = AIM[a.zone];
  const e = f.enemy;
  partPoint(e.rag.byName[z.part], tmp.set(z.at[0], z.at[1], z.at[2]).multiplyScalar(e.scale), res);
  return res.addScaledVector(a.jitter, f.scale);
}

/**
 * Arm orientations for an aimed punch at its current progress.
 * Returns false for moves that are not aimed (kicks, flailing).
 */
export function punchOverride(
  f: Fighter,
  a: Action,
  res: Partial<Record<PartName, THREE.Quaternion>>,
): boolean {
  const m = a.move;
  if (!m?.path || m.limb === 'rFoot') return false;
  const side = m.limb === 'lHand' ? 'l' : 'r';
  const s = f.scale;
  basis(f, side);

  // Remember where the fist started, in the body frame, to come back there.
  if (!a.handStart) {
    partPoint(f.rag.byName[side === 'l' ? 'lFore' : 'rFore'], tmp.copy(FIST).multiplyScalar(s), hand);
    hand.sub(shoulder);
    a.handStart = new THREE.Vector3(hand.dot(fwd) / s, hand.dot(up) / s, hand.dot(out) / s);
  }
  const shape = SHAPES[m.path];
  const u = a.t / a.dur;
  const [act0, act1] = m.active;
  const loadEnd = act0 * 0.5;
  const reachEnd = act0 + (act1 - act0) * 0.35;

  // Aim through the target, so the fist is still accelerating at contact.
  aimPointOf(f, a, aim);
  tmp.subVectors(aim, shoulder).normalize();
  aim.addScaledVector(tmp, 0.14 * s);

  fromBasis(a.handStart, s, p0);
  if (m.path === 'straight') fromBasis(a.handStart, s, p1).addScaledVector(fwd, (shape.chamber[0] - 0.2) * s).addScaledVector(up, shape.chamber[1] * s);
  else fromBasis(shape.chamber, s, p1);

  if (u < loadEnd) {
    hand.lerpVectors(p0, p1, ease(u / loadEnd));
  } else if (u < reachEnd) {
    // Accelerating strike: slow out of the chamber, fastest at the end.
    const k = (u - loadEnd) / (reachEnd - loadEnd);
    const t = k * k * (1.6 - 0.6 * k);
    if (shape.via) {
      fromBasis(shape.via, s, p2);
      hand.copy(p1).multiplyScalar((1 - t) * (1 - t)).addScaledVector(p2, 2 * (1 - t) * t).addScaledVector(aim, t * t);
    } else {
      hand.lerpVectors(p1, aim, t);
    }
  } else if (u < act1) {
    hand.copy(aim);
  } else {
    hand.lerpVectors(aim, p0, ease((u - act1) / (1 - act1)));
  }

  pole.set(0, 0, 0).addScaledVector(fwd, shape.pole[0]).addScaledVector(up, shape.pole[1]).addScaledVector(out, shape.pole[2]);
  const upperName: PartName = side === 'l' ? 'lUpper' : 'rUpper';
  const foreName: PartName = side === 'l' ? 'lFore' : 'rFore';
  const qu = (res[upperName] ??= new THREE.Quaternion());
  const qf = (res[foreName] ??= new THREE.Quaternion());
  solveArmIK(f.rag, side, hand, pole, s, qu, qf);
  return true;
}
