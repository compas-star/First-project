import * as THREE from 'three';
import type { Move } from './moves';
import type { Fighter } from './sim';
import { partPoint } from './physics';

// Reading the moment. Before a blow the fighter looks at the opponent's body
// and at his own: is the head low and coming in, which side did he open by
// throwing his hand, is the guard up, is he standing on one leg, how far is
// he, which of my hands is free. Each strike gets a multiplier for how well it
// fits this moment, and the strongest reason is said out loud.

export interface Read {
  /** 0..1 his head is lower than in his stance (bent over after a miss, ducking). */
  headLow: number;
  /** 0..1 his trunk leans toward me. */
  leanIn: number;
  /** His side left open by an extended or busy arm ('l' = his left), or null. */
  open: 'l' | 'r' | null;
  guardUp: boolean;
  oneLeg: boolean;
  dist: number;
  /** My hand that is busy (just blocked with it), or null. */
  busyHand: 'l' | 'r' | null;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const FIST = new THREE.Vector3(0, -0.29, 0);
const UP = new THREE.Vector3(0, 1, 0);

export function readOpponent(f: Fighter, e: Fighter, now: number): Read {
  const s = e.scale;
  const head = e.rag.byName.head.body.translation();
  const headLow = THREE.MathUtils.clamp((1.38 * s - head.y) / (0.3 * s), 0, 1);
  const toMe = tmp2.subVectors(f.pos, e.pos).setY(0).normalize();
  const cq = e.rag.byName.chest.body.rotation();
  const chestUp = tmp.copy(UP).applyQuaternion(new THREE.Quaternion(cq.x, cq.y, cq.z, cq.w));
  const leanIn = THREE.MathUtils.clamp((chestUp.dot(toMe) - 0.15) / 0.35, 0, 1);

  // An arm reaching out (a punch or its recovery) leaves that side of the head open.
  let open: 'l' | 'r' | null = null;
  let best = 0.5 * s;
  for (const side of ['l', 'r'] as const) {
    const fist = partPoint(e.rag.byName[side === 'l' ? 'lFore' : 'rFore'], tmp.copy(FIST).multiplyScalar(s), new THREE.Vector3());
    const shoulder = e.rag.byName[side === 'l' ? 'lUpper' : 'rUpper'].body.translation();
    const reach = Math.hypot(fist.x - shoulder.x, fist.y - shoulder.y, fist.z - shoulder.z);
    if (reach > best) {
      best = reach;
      open = side;
    }
  }
  const ea = e.action;
  if (ea?.kind === 'attack' && !ea.feint && ea.move!.limb.endsWith('Hand')) open = ea.move!.limb[0] as 'l' | 'r';
  else if (now < e.openUntilW) open = e.openSide;

  return {
    headLow,
    leanIn,
    open,
    guardUp: ea?.kind === 'block' || ea?.kind === 'catch',
    oneLeg: e.feet.some((ft) => ft.free) || (ea?.kind === 'attack' && /Foot|Knee/.test(ea.move!.limb)),
    dist: f.pos.distanceTo(e.pos),
    busyHand: now < f.blockedW ? f.blockedSide : null,
  };
}

/** Which side of the target a blow comes in on: hooks and round kicks land on his far side. */
function landsOn(m: Move): 'l' | 'r' | 'mid' {
  const side = m.limb[0] as 'l' | 'r';
  const curved = m.path === 'hook' || m.path === 'swing' || m.path === 'over' || m.path === 'round' || /Elbow/.test(m.limb);
  if (!curved) return 'mid';
  // Facing each other, my left hand comes round onto his right side.
  return side === 'l' ? 'r' : 'l';
}

const UPPERS = new Set(['uppercut', 'luppercut', 'rknee']);
const CLOSE = new Set(['uppercut', 'luppercut', 'lelbow', 'relbow', 'rknee', 'hook', 'rhook']);
const LONG = new Set(['jab', 'cross', 'teep', 'leadkick', 'superman']);
const BODY_WORK = new Set(['bodykick', 'lowkick', 'calfkick', 'rknee', 'uppercut', 'luppercut', 'teep']);

/** How well a strike fits this moment, and the reason if it is a strong one. */
export function fitOf(f: Fighter, m: Move, r: Read, range: number): { k: number; why: string | null } {
  let k = 1;
  let why: string | null = null;
  let top = 1.25;
  const note = (mul: number, text: string) => {
    k *= mul;
    if (mul > top) {
      top = mul;
      why = text;
    }
  };
  const tech = f.tech;
  // How well the distance suits this strike right now (1 = in range without a step).
  const fill = r.dist / Math.max(0.3, range);
  const near = THREE.MathUtils.clamp((1.15 - fill) / 0.3, 0, 1);
  // Reading the moment is a skill: an untrained fighter barely does it.
  const sharp = 0.3 + 0.7 * tech;

  // Bent over or coming in with the head: an uppercut or a knee meets it.
  const low = Math.max(r.headLow, r.leanIn);
  if (low > 0.2) {
    if (UPPERS.has(m.id)) note(1 + 3 * low * sharp * near, 'он наклонился');
    else if (m.path === 'straight' || m.path === 'teep') k *= 1 - 0.4 * low * sharp;
  }
  // An arm out on one side: that side of the head is open for a hook.
  if (r.open && landsOn(m) === r.open) note(1 + 1.6 * sharp * near, r.open === 'l' ? 'открыл левую сторону' : 'открыл правую сторону');
  // Guard up: go round it or under it.
  if (r.guardUp) {
    if (BODY_WORK.has(m.id)) note(1 + 1.2 * sharp, 'держит блок');
    else if (m.path === 'straight') k *= 1 - 0.4 * sharp;
  }
  // On one leg: knock him off it.
  if (r.oneLeg && (m.id === 'cross' || m.id === 'teep' || m.id === 'lowkick' || m.id === 'jab')) note(1 + 1.4 * sharp, 'он на одной ноге');
  // Distance: long strikes from outside, short ones in close.
  if (fill < 0.75) {
    if (CLOSE.has(m.id)) note(1 + 0.9 * sharp, 'вплотную');
    else if (LONG.has(m.id)) k *= 1 - 0.5 * sharp;
  } else if (fill > 1.05 && LONG.has(m.id)) k *= 1 + 0.5 * sharp;
  // The hand that just blocked is late; the other one is ready.
  if (r.busyHand && m.limb.endsWith('Hand')) {
    if (m.limb[0] === r.busyHand) k *= 1 - 0.7 * sharp;
    else note(1 + 0.6 * sharp, 'бью свободной рукой');
  }
  return { k, why };
}

/** Body or head for a blow that can go to either. */
export function zoneBias(r: Read): number {
  return (r.guardUp ? 0.3 : 0) - (r.headLow > 0.4 ? 0.25 : 0);
}
