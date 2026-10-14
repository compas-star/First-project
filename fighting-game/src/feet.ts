import * as THREE from 'three';
import { anchorFoot, partPoint, solveTwoBone, v, LEG_SHIN, LEG_THIGH, type PartName } from './physics';
import type { Fighter } from './sim';

// Feet and balance.
//
// Each foot stays planted on the floor (held there like friction would) until
// the body has moved far enough from it, then steps to where it should be.
// Legs are posed by IK toward the feet from where the hips *should* be, so a
// sagging body is pushed back up through the legs.
//
// Balance follows the capture point: where the center of mass is heading,
// projected to where it would come to rest (COM + velocity * sqrt(h / g)). While
// that point stays over the feet the fighter is stable. When a push carries it
// outside, the nearest foot makes a quick catching step; if it is too far, the
// fighter loses stability and tips over the way he was pushed.

export interface Foot {
  /** Ground point the foot stands on (or is moving through). */
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Step progress 0..1, or -1 when planted. */
  t: number;
  dur: number;
  /** Used by a kick: placement leaves it alone. */
  free: boolean;
}

export function makeFeet(): [Foot, Foot] {
  const mk = (): Foot => ({
    pos: new THREE.Vector3(),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    t: -1,
    dur: 0.2,
    free: false,
  });
  return [mk(), mk()];
}

const fwd = new THREE.Vector3();
const left = new THREE.Vector3();
const vel = new THREE.Vector3();
const ideal = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const com = new THREE.Vector3();
const comVel = new THREE.Vector3();
const FOOT_LOCAL = new THREE.Vector3(0, -0.46, 0.05);
const SHIN: [PartName, PartName] = ['lShin', 'rShin'];

/** Where the foot would be now, read from the physical leg. */
export function actualFoot(f: Fighter, i: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
  partPoint(f.rag.byName[SHIN[i]], tmp.copy(FOOT_LOCAL).multiplyScalar(f.scale), out);
  return out.setY(0);
}

/** Put the feet (or one foot) where the legs really are, e.g. after getting up or a kick. */
export function resetFeet(f: Fighter, only?: 0 | 1): void {
  for (const i of [0, 1] as const) {
    if (only !== undefined && i !== only) continue;
    actualFoot(f, i, f.feet[i].pos);
    f.feet[i].t = -1;
    f.feet[i].free = false;
  }
}

export function idealFoot(f: Fighter, i: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
  const s = f.scale;
  const st = f.stance;
  fwd.set(Math.sin(f.facing), 0, Math.cos(f.facing));
  left.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  out.copy(f.pos);
  // Lead (left) foot forward, rear foot back; width keeps them apart.
  if (i === 0) out.addScaledVector(fwd, st.footFwd * s).addScaledVector(left, st.footWidth * s);
  else out.addScaledVector(fwd, -st.footBack * s).addScaledVector(left, -st.footWidth * s);
  // Lead the step in the direction of travel.
  const lv = f.rag.pelvis.body.linvel();
  vel.set(lv.x, 0, lv.z);
  out.addScaledVector(vel, Math.min(0.3, 0.22 / f.body));
  return out.setY(0);
}

/** Distance from point p to segment a-b on the floor plane. */
function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 1e-9 ? THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/**
 * Updates the center of mass and capture point, and how far the capture point
 * is outside the base of support (0 = balanced). Feet in the air count where
 * they are about to land.
 */
export function measureBalance(f: Fighter): number {
  com.set(0, 0, 0);
  comVel.set(0, 0, 0);
  let M = 0;
  for (const p of f.rag.parts) {
    partPoint(p, p.com, tmp);
    com.addScaledVector(tmp, p.mass);
    comVel.addScaledVector(v(p.body.linvel(), tmp2), p.mass);
    M += p.mass;
  }
  com.divideScalar(M);
  comVel.divideScalar(M);
  const h = Math.max(0.3 * f.scale, com.y);
  // A faster body brakes and steps proportionally faster, so its momentum carries it less far.
  const k = Math.sqrt(h / 9.81) / f.body;
  f.capture.set(com.x + comVel.x * k, 0, com.z + comVel.z * k);

  // A foot in the air counts where it will land: a step can catch the body, but
  // only as far as a step reaches. Beyond that the body falls.
  const pts: THREE.Vector3[] = [];
  for (const ft of f.feet) if (!ft.free) pts.push(ft.t >= 0 ? ft.to : ft.pos);
  const margin = 0.1 * f.scale;
  let d: number;
  if (pts.length === 2) d = distToSegment(f.capture, pts[0], pts[1]);
  else if (pts.length === 1) d = Math.hypot(f.capture.x - pts[0].x, f.capture.z - pts[0].z);
  else d = 1;
  return Math.max(0, d - margin);
}

/** Advance steps; dl is the fighter's own (local) time step. */
export function updateFeet(f: Fighter, dl: number): void {
  const s = f.scale;
  const feet = f.feet;
  const lv = f.rag.pelvis.body.linvel();
  const speed = Math.hypot(lv.x, lv.z) / f.body;
  for (const i of [0, 1] as const) {
    const ft = feet[i];
    if (ft.free || ft.t < 0) continue;
    ft.t += dl / ft.dur;
    if (ft.t >= 1) {
      ft.t = -1;
      ft.pos.copy(ft.to);
    } else {
      const k = ft.t * ft.t * (3 - 2 * ft.t);
      ft.pos.lerpVectors(ft.from, ft.to, k);
      ft.pos.y = Math.sin(Math.PI * ft.t) * (0.06 + 0.03 * Math.min(1, speed)) * s;
    }
  }
  // One foot steps at a time.
  if (feet.some((ft) => ft.t >= 0)) return;
  left.set(Math.cos(f.facing), 0, -Math.sin(f.facing));

  // Catching step: the body is being carried off its feet, put a foot under it.
  if (f.balanceErr > 0.04 * s && f.balanceErr < 0.7 * s) {
    let best = -1;
    let bestD = Infinity;
    for (const i of [0, 1] as const) {
      if (feet[i].free) continue;
      // Step with the foot further from where the body is going.
      const d = -Math.hypot(f.capture.x - feet[i].pos.x, f.capture.z - feet[i].pos.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      const ft = feet[best];
      ft.from.copy(ft.pos).setY(0);
      // A little past the capture point, on the foot's own side.
      ft.to.copy(f.capture).addScaledVector(left, (best === 0 ? 1 : -1) * 0.08 * s);
      tmp.subVectors(ft.to, ft.from);
      const reach = 0.75 * s;
      if (tmp.length() > reach) ft.to.copy(ft.from).addScaledVector(tmp.normalize(), reach);
      ft.dur = 0.13;
      ft.t = 0;
      return;
    }
  }

  let best = -1;
  let bestErr = 0;
  for (const i of [0, 1] as const) {
    if (feet[i].free) continue;
    const e = idealFoot(f, i, ideal).distanceTo(feet[i].pos);
    if (e > bestErr) {
      bestErr = e;
      best = i;
    }
  }
  const threshold = (speed > 0.3 ? 0.08 : 0.15) * s;
  if (best < 0 || bestErr < threshold) return;
  const ft = feet[best];
  ft.from.copy(ft.pos).setY(0);
  idealFoot(f, best as 0 | 1, ft.to);
  // A step only reaches so far.
  tmp.subVectors(ft.to, ft.from);
  if (tmp.length() > 0.75 * s) ft.to.copy(ft.from).addScaledVector(tmp.normalize(), 0.75 * s);
  // Never let the feet cross: keep each on its own side of the stance line.
  const other = feet[1 - best].pos;
  const sideGap = tmp.subVectors(ft.to, other).dot(left) * (best === 0 ? 1 : -1);
  const minGap = 0.12 * s;
  if (sideGap < minGap) ft.to.addScaledVector(left, (minGap - sideGap) * (best === 0 ? 1 : -1));
  ft.dur = THREE.MathUtils.clamp(0.24 - speed * 0.025, 0.12, 0.24);
  ft.t = 0;
}

/** Hold planted feet on their spots; the grip is limited like friction. */
export function anchorFeet(f: Fighter, h: number): void {
  const planted = f.feet.filter((ft) => !ft.free && ft.t < 0).length;
  if (!planted) return;
  const grip = (0.35 * f.rag.totalMass * 9.81) / planted;
  for (const i of [0, 1] as const) {
    const ft = f.feet[i];
    if (ft.free || ft.t >= 0) continue;
    anchorFoot(f.rag, i === 0 ? 'l' : 'r', ft.pos, FOOT_LOCAL, f.scale, f.body, grip * f.stability, h);
  }
}

const pole = new THREE.Vector3();
const target = new THREE.Vector3();
const hip = new THREE.Vector3();

/**
 * Leg orientations reaching the feet from where the hips should be (at the
 * wanted pelvis height), so the legs push a sagging body back up.
 */
export function legOverride(f: Fighter, pelvisY: number, res: Partial<Record<PartName, THREE.Quaternion>>): void {
  fwd.set(Math.sin(f.facing), 0, Math.cos(f.facing));
  left.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  const lift = pelvisY - f.rag.pelvis.body.translation().y;
  for (const i of [0, 1] as const) {
    const ft = f.feet[i];
    if (ft.free) continue;
    target.copy(ft.pos);
    target.y += 0.035 * f.scale;
    v(f.rag.byName[i === 0 ? 'lThigh' : 'rThigh'].body.translation(), hip);
    hip.y += THREE.MathUtils.clamp(lift, -0.2 * f.scale, 0.3 * f.scale);
    // Knees point forward and a little out.
    pole.copy(fwd).addScaledVector(left, i === 0 ? 0.25 : -0.25);
    const thigh: PartName = i === 0 ? 'lThigh' : 'rThigh';
    const shin: PartName = i === 0 ? 'lShin' : 'rShin';
    solveTwoBone(
      hip, target, pole, LEG_THIGH * f.scale, LEG_SHIN * f.scale, -1,
      (res[thigh] ??= new THREE.Quaternion()), (res[shin] ??= new THREE.Quaternion()),
    );
  }
}
