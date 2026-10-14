import * as THREE from 'three';
import { partPoint, solveLegIK, type PartName } from './physics';
import type { Fighter } from './sim';

// Foot placement. Each foot stays planted on the floor until the body has moved
// far enough from it, then takes a step to where it should be. Legs are posed by
// IK to reach their feet, so feet do not slide, and each foot keeps to its own
// side of the body: the left foot always lands left of the right one.

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

function idealFoot(f: Fighter, i: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
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

/** Advance steps; dl is the fighter's own (local) time step. */
export function updateFeet(f: Fighter, dl: number): void {
  const s = f.scale;
  const feet = f.feet;
  const speed = Math.hypot(f.rag.pelvis.body.linvel().x, f.rag.pelvis.body.linvel().z) / f.body;
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
  // One foot steps at a time; the one furthest from its spot goes first.
  if (feet.some((ft) => ft.t >= 0)) return;
  let best = -1;
  let bestErr = 0;
  const errs: number[] = [];
  for (const i of [0, 1] as const) {
    if (feet[i].free) {
      errs.push(0);
      continue;
    }
    const e = idealFoot(f, i, ideal).distanceTo(feet[i].pos);
    errs.push(e);
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
  // Never let the feet cross: keep each on its own side of the stance line.
  left.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  const other = feet[1 - best].pos;
  const sideGap = tmp.subVectors(ft.to, other).dot(left) * (best === 0 ? 1 : -1);
  const minGap = 0.12 * s;
  if (sideGap < minGap) ft.to.addScaledVector(left, (minGap - sideGap) * (best === 0 ? 1 : -1));
  ft.dur = THREE.MathUtils.clamp(0.24 - speed * 0.025, 0.12, 0.24);
  ft.t = 0;
}

const pole = new THREE.Vector3();
const target = new THREE.Vector3();

/** Leg orientations reaching the planted feet. */
export function legOverride(f: Fighter, res: Partial<Record<PartName, THREE.Quaternion>>): void {
  fwd.set(Math.sin(f.facing), 0, Math.cos(f.facing));
  left.set(Math.cos(f.facing), 0, -Math.sin(f.facing));
  for (const i of [0, 1] as const) {
    const ft = f.feet[i];
    if (ft.free) continue;
    target.copy(ft.pos);
    target.y += 0.035 * f.scale;
    // Knees point forward and a little out.
    pole.copy(fwd).addScaledVector(left, i === 0 ? 0.25 : -0.25);
    const thigh: PartName = i === 0 ? 'lThigh' : 'rThigh';
    const shin: PartName = i === 0 ? 'lShin' : 'rShin';
    solveLegIK(f.rag, i === 0 ? 'l' : 'r', target, pole, f.scale, (res[thigh] ??= new THREE.Quaternion()), (res[shin] ??= new THREE.Quaternion()));
  }
}
