import * as THREE from 'three';
import type { PartName } from './physics';
import { partPoint, solveArmIK, solveLegIK, v } from './physics';
import type { KickPath, PunchPath, PathShape, Move } from './moves';
import type { Action, Fighter } from './sim';

// Aimed punches. Instead of replaying a fixed arm animation, the fist follows a
// path to a point on the enemy's real body, recomputed every step, and the arm
// is posed by IK. Paths are described in the puncher's body frame:
// (forward, up, outward from that shoulder), in meters for a 1.8 m fighter.


export const SHAPES: Record<PunchPath, PathShape> = {
  straight: { chamber: [0.2, 0.02, 0.06], via: null, pole: [0, -1, 0.7] },
  hook: { chamber: [0.14, -0.02, 0.36], via: [0.42, 0.02, 0.4], pole: [0, 0.35, 1] },
  upper: { chamber: [0.14, -0.34, 0.06], via: [0.3, -0.2, 0.02], pole: [-0.3, -1, 0.35] },
  swing: { chamber: [-0.12, 0.14, 0.45], via: [0.32, 0.16, 0.6], pole: [0, 0.6, 1] },
  // Looping over the top and down onto the head.
  over: { chamber: [-0.05, 0.3, 0.35], via: [0.3, 0.42, 0.25], pole: [0, 1, 0.8] },
};

/** Kicks, relative to the hip joint: (forward, up, outward from that hip). */
export const KICKS: Record<KickPath, PathShape> = {
  // Knee up, then push the sole straight into the target.
  teep: { chamber: [0.32, -0.42, 0.02], via: null, pole: [0.6, 1, 0] },
  // A wide swing: the foot leaves the floor out to the side, the hip turns over and the
  // leg whips round in a big arc onto the target, knee pointing up and out.
  round: { chamber: [0.02, -0.6, 0.38], via: [0.3, -0.22, 0.85], pole: [0.2, 0.8, 0.9] },
  // Low arc into the thigh, swung from the side.
  low: { chamber: [0.1, -0.5, 0.4], via: [0.32, -0.55, 0.62], pole: [0.35, 0.5, 0.9] },
  // Knee tucked, then the heel drives straight back (the body has spun round).
  back: { chamber: [0.02, -0.5, 0.04], via: null, pole: [0, -1, 0.2] },
};

/** Point on the enemy each zone is aimed at, in that part's local frame (unscaled). */
const AIM: Record<'head' | 'body' | 'leg', { part: PartName; at: [number, number, number] }> = {
  head: { part: 'head', at: [0, 0.12, 0] },
  body: { part: 'chest', at: [0, 0.16, 0] },
  leg: { part: 'lThigh', at: [0, -0.25, 0] },
};

const KICK_BODY = { part: 'chest' as PartName, at: [0, -0.04, 0] as [number, number, number] };
/** A kick to the head goes to the jaw and temple, not over the top of the head. */
const KICK_HEAD = { part: 'head' as PartName, at: [0, 0.02, 0] as [number, number, number] };

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
const ANKLE = new THREE.Vector3(0, -0.46, 0.05);

const ease = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

function basis(f: Fighter, side: 'l' | 'r', joint: PartName): void {
  fwd.set(Math.sin(f.facing), 0, Math.cos(f.facing));
  // Fighter's left is +X when facing +Z.
  out.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  if (side === 'r') out.negate();
  v(f.rag.byName[joint].body.translation(), shoulder);
}

/** Walks a strike path: load from the start into the chamber, accelerate to the target, hold, return. */
function pathPoint(a: Action, shape: PathShape, start: THREE.Vector3, s: number, res: THREE.Vector3, straightLoad: boolean): void {
  const m = a.move!;
  const u = a.t / a.dur;
  const [act0, act1] = m.active;
  const loadEnd = act0 * 0.5;
  // A kick's foot is heavy and lags its target: aim it to arrive as the window opens.
  const reachEnd = m.limb.endsWith('Foot') ? act0 : act0 + (act1 - act0) * 0.35;
  fromBasis(start, s, p0);
  if (straightLoad) fromBasis(start, s, p1).addScaledVector(fwd, (shape.chamber[0] - 0.2) * s).addScaledVector(up, shape.chamber[1] * s);
  else fromBasis(shape.chamber, s, p1);
  // A punch to the head is loaded at the height of the target, so it travels level
  // into the face instead of rising through the guard and the chest.
  // A shape drawn by the player in the editor is taken as drawn.
  if (!m.shape && !(m.limb.endsWith('Foot')) && m.path !== 'upper' && aim.y > p1.y) p1.y = Math.max(p1.y, aim.y - 0.06 * s);
  if (u < loadEnd) {
    res.lerpVectors(p0, p1, ease(u / loadEnd));
  } else if (u < reachEnd) {
    // Accelerating strike: slow out of the chamber, fastest at the end.
    const k = (u - loadEnd) / (reachEnd - loadEnd);
    const t = k * k * (1.6 - 0.6 * k);
    if (shape.via) {
      fromBasis(shape.via, s, p2);
      res.copy(p1).multiplyScalar((1 - t) * (1 - t)).addScaledVector(p2, 2 * (1 - t) * t).addScaledVector(aim, t * t);
    } else {
      res.lerpVectors(p1, aim, t);
    }
  } else if (u < act1) {
    res.copy(aim);
  } else {
    res.lerpVectors(aim, p0, ease((u - act1) / (1 - act1)));
  }
}

function fromBasis(o: [number, number, number] | THREE.Vector3, s: number, res: THREE.Vector3): THREE.Vector3 {
  const [x, y, z] = Array.isArray(o) ? o : [o.x, o.y, o.z];
  return res.copy(shoulder).addScaledVector(fwd, x * s).addScaledVector(up, y * s).addScaledVector(out, z * s);
}

/** The frame a strike's path is drawn in, and where it starts and lands, for the editor. */
export function strikeFrame(f: Fighter, m: Move, zone: 'head' | 'body' | 'leg'): { origin: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; out: THREE.Vector3; fist: THREE.Vector3; target: THREE.Vector3; s: number } {
  const kick = /Foot$/.test(m.limb);
  const side = m.limb[0] as 'l' | 'r';
  const joint = `${side}${kick ? 'Thigh' : 'Upper'}` as PartName;
  const end = `${side}${kick ? 'Shin' : 'Fore'}` as PartName;
  basis(f, side, joint);
  const fist = partPoint(f.rag.byName[end], tmp.copy(kick ? ANKLE : FIST).multiplyScalar(f.scale), new THREE.Vector3());
  const z = kick && zone === 'body' ? KICK_BODY : kick && zone === 'head' ? KICK_HEAD : AIM[zone];
  const e = f.enemy;
  const target = partPoint(e.rag.byName[z.part], tmp.set(z.at[0], z.at[1], z.at[2]).multiplyScalar(e.scale), new THREE.Vector3());
  return { origin: shoulder.clone(), fwd: fwd.clone(), up: up.clone(), out: out.clone(), fist, target, s: f.scale };
}

/** Where this punch is aimed right now, in world space. */
export function aimPointOf(f: Fighter, a: Action, res: THREE.Vector3): THREE.Vector3 {
  // Kicks to the body go to the ribs and liver, below the chest centre.
  const kick = /Foot$/.test(a.move!.limb);
  const z = kick && a.zone === 'body' ? KICK_BODY : kick && a.zone === 'head' ? KICK_HEAD : AIM[a.zone];
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
  if (!m?.path) return false;
  const s = f.scale;
  const kick = m.limb === 'lFoot' || m.limb === 'rFoot';
  if (!kick && m.limb !== 'lHand' && m.limb !== 'rHand') return false;
  const side = m.limb === 'lHand' || m.limb === 'lFoot' ? 'l' : 'r';
  const joint: PartName = kick ? (side === 'l' ? 'lThigh' : 'rThigh') : side === 'l' ? 'lUpper' : 'rUpper';
  const end: PartName = kick ? (side === 'l' ? 'lShin' : 'rShin') : side === 'l' ? 'lFore' : 'rFore';
  basis(f, side, joint);

  // Remember where the fist or foot started, in the body frame, to come back there.
  if (!a.handStart) {
    partPoint(f.rag.byName[end], tmp.copy(kick ? ANKLE : FIST).multiplyScalar(s), hand);
    hand.sub(shoulder);
    a.handStart = new THREE.Vector3(hand.dot(fwd) / s, hand.dot(up) / s, hand.dot(out) / s);
  }

  // Aim through the target, so the strike is still accelerating at contact.
  // Once the blow is thrown it is committed: it goes where the target was, with
  // only a little correction, so a slip or a duck at that moment makes it miss.
  aimPointOf(f, a, aim);
  const committed = a.t / a.dur >= m.active[0] * 0.55;
  if (committed) {
    if (!a.lockAim) a.lockAim = aim.clone();
    aim.lerpVectors(a.lockAim, aim, 0.08 + 0.07 * f.tech);
  }
  tmp.subVectors(aim, shoulder);
  // A punch drives through the target level: when the target ducks under a hook and the
  // puncher dips, the follow-through must not tip up into the air.
  if (!kick && m.path !== 'upper') tmp.y = 0;
  tmp.normalize();
  aim.addScaledVector(tmp, (kick ? 0.1 : 0.14) * s);

  const shape = m.shape ?? (kick ? KICKS[m.path as KickPath] : SHAPES[m.path as PunchPath]);
  pathPoint(a, shape, a.handStart, s, hand, !kick && m.path === 'straight' && !m.shape);

  pole.set(0, 0, 0).addScaledVector(fwd, shape.pole[0]).addScaledVector(up, shape.pole[1]).addScaledVector(out, shape.pole[2]);
  const qu = (res[joint] ??= new THREE.Quaternion());
  const qf = (res[end] ??= new THREE.Quaternion());
  if (kick) solveLegIK(f.rag, side, hand, pole, s, qu, qf);
  else solveArmIK(f.rag, side, hand, pole, s, qu, qf);
  return true;
}
