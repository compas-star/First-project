import { STANCE, POSE_KEYS, type Pose } from './rig';

// A move is data: keyframed poses over normalized time plus a hit window.
// This is the same format a future move editor will produce.

export interface Keyframe {
  t: number;
  pose: Partial<Pose>;
}

export interface Move {
  id: string;
  name: string;
  /** Length in the fighter's own seconds (divided by body speed in world time). */
  duration: number;
  /** Normalized time when the strike starts and stops being able to hit. */
  active: [number, number];
  /** Center-to-center reach for a 1.8 m fighter, not counting the target's body. */
  reach: number;
  /** Half-angle of the strike cone in degrees. */
  arc: number;
  /** Forward step during the wind-up, meters. */
  lunge: number;
  power: number;
  knock: number;
  /** Extra upward share of the knockback. */
  lift: number;
  limb: 'lHand' | 'rHand' | 'rFoot';
  /** How the target should dodge it. */
  dodge: 'side' | 'back';
  weight: number;
  /** Clean technique, or a wild swing that needs no training. */
  style: 'clean' | 'wild';
  /**
   * Punches are aimed: the fist follows this path to the enemy's real head or
   * body by IK, the keyframes only move the torso and legs.
   */
  path?: 'straight' | 'hook' | 'upper' | 'swing';
  keys: Keyframe[];
}

const guard: Partial<Pose> = {};

export const MOVES: Move[] = [
  {
    id: 'jab',
    name: 'джеб',
    duration: 0.38,
    active: [0.42, 0.66],
    reach: 0.62,
    arc: 26,
    lunge: 0.15,
    power: 1,
    knock: 0.7,
    lift: 0,
    limb: 'lHand',
    dodge: 'side',
    weight: 3,
    style: 'clean',
    path: 'straight',
    keys: [
      { t: 0, pose: guard },
      { t: 0.25, pose: { lShF: 70, lEl: 80, spineTwist: -18 } },
      { t: 0.48, pose: { lShF: 104, lShS: 2, lEl: 0, spineTwist: -36, spineLean: 8, pelvisTwist: -24 } },
      { t: 0.66, pose: { lShF: 104, lShS: 2, lEl: 0, spineTwist: -36, spineLean: 8, pelvisTwist: -24 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'cross',
    name: 'кросс',
    duration: 0.5,
    active: [0.46, 0.7],
    reach: 0.6,
    arc: 24,
    lunge: 0.2,
    power: 1.6,
    knock: 1.3,
    lift: 0,
    limb: 'rHand',
    dodge: 'side',
    weight: 2,
    style: 'clean',
    path: 'straight',
    keys: [
      { t: 0, pose: guard },
      { t: 0.28, pose: { rShF: 50, rEl: 110, spineTwist: -20, crouch: 0.09 } },
      { t: 0.52, pose: { rShF: 104, rShS: 0, rEl: 0, spineTwist: 32, pelvisTwist: 12, spineLean: 10, rHipF: -22, lKn: 18 } },
      { t: 0.7, pose: { rShF: 104, rShS: 0, rEl: 0, spineTwist: 32, pelvisTwist: 12, spineLean: 10, rHipF: -22, lKn: 18 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'hook',
    name: 'хук',
    duration: 0.55,
    active: [0.45, 0.66],
    reach: 0.45,
    arc: 55,
    lunge: 0.12,
    power: 1.8,
    knock: 1.4,
    lift: 0,
    limb: 'lHand',
    dodge: 'back',
    weight: 1.5,
    style: 'clean',
    path: 'hook',
    keys: [
      { t: 0, pose: guard },
      { t: 0.3, pose: { lShF: 45, lShS: 55, lEl: 85, spineTwist: -40, crouch: 0.1 } },
      { t: 0.55, pose: { lShF: 80, lShS: 65, lEl: 95, spineTwist: 28, spineSide: -8, pelvisTwist: 5 } },
      { t: 0.68, pose: { lShF: 85, lShS: 55, lEl: 95, spineTwist: 34, spineSide: -8, pelvisTwist: 8 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'uppercut',
    name: 'апперкот',
    duration: 0.58,
    active: [0.46, 0.68],
    reach: 0.5,
    arc: 32,
    lunge: 0.18,
    power: 2,
    knock: 2.2,
    lift: 0.8,
    limb: 'rHand',
    dodge: 'back',
    weight: 1,
    style: 'clean',
    path: 'upper',
    keys: [
      { t: 0, pose: guard },
      { t: 0.32, pose: { crouch: 0.22, rShF: 10, rEl: 100, spineLean: 24, spineTwist: 12, rShS: 10 } },
      { t: 0.55, pose: { crouch: 0, rShF: 110, rEl: 70, spineLean: -6, spineTwist: 26, headPitch: -15 } },
      { t: 0.7, pose: { crouch: 0, rShF: 115, rEl: 65, spineLean: -6, spineTwist: 26, headPitch: -15 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'kick',
    name: 'прямой ногой',
    duration: 0.66,
    active: [0.44, 0.68],
    reach: 0.78,
    arc: 24,
    lunge: 0.1,
    power: 2.2,
    knock: 2.6,
    lift: 0.15,
    limb: 'rFoot',
    dodge: 'side',
    weight: 1.2,
    style: 'clean',
    keys: [
      { t: 0, pose: guard },
      { t: 0.3, pose: { rHipF: 85, rKn: 105, spineLean: -4, lKn: 16, crouch: 0.04 } },
      { t: 0.5, pose: { rHipF: 88, rKn: 4, spineLean: -22, lKn: 12, crouch: 0.04 } },
      { t: 0.68, pose: { rHipF: 86, rKn: 6, spineLean: -22, lKn: 12, crouch: 0.04 } },
      { t: 0.85, pose: { rHipF: 50, rKn: 80 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'roundhouse',
    name: 'боковой ногой',
    duration: 0.75,
    active: [0.46, 0.68],
    reach: 0.65,
    arc: 60,
    lunge: 0.12,
    power: 2.6,
    knock: 3.2,
    lift: 0.25,
    limb: 'rFoot',
    dodge: 'back',
    weight: 0.8,
    style: 'clean',
    keys: [
      { t: 0, pose: guard },
      { t: 0.3, pose: { rHipF: 55, rHipS: 45, rKn: 115, pelvisTwist: 40, spineSide: 12, spineTwist: -10 } },
      { t: 0.55, pose: { rHipF: 60, rHipS: 75, rKn: 8, pelvisTwist: 80, spineSide: 28, spineTwist: -40, lShS: 40, rShS: 50 } },
      { t: 0.7, pose: { rHipF: 55, rHipS: 70, rKn: 15, pelvisTwist: 85, spineSide: 26, spineTwist: -40 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'haymaker',
    name: 'размашистый',
    duration: 0.8,
    active: [0.5, 0.7],
    reach: 0.5,
    arc: 70,
    lunge: 0.15,
    power: 2.4,
    knock: 2,
    lift: 0.1,
    limb: 'rHand',
    dodge: 'back',
    weight: 1.6,
    style: 'wild',
    path: 'swing',
    keys: [
      { t: 0, pose: guard },
      { t: 0.38, pose: { rShF: 35, rShS: 85, rEl: 45, spineTwist: -45, spineLean: -4, lShF: 40, lEl: 60 } },
      { t: 0.6, pose: { rShF: 88, rShS: 35, rEl: 35, spineTwist: 48, spineLean: 18, pelvisTwist: 15, lShF: 30, lEl: 40 } },
      { t: 0.75, pose: { rShF: 80, rShS: 10, rEl: 40, spineTwist: 55, spineLean: 20, pelvisTwist: 18 } },
      { t: 1, pose: guard },
    ],
  },
  {
    id: 'flail',
    name: 'машет руками',
    duration: 0.62,
    active: [0.3, 0.85],
    reach: 0.48,
    arc: 60,
    lunge: 0.25,
    power: 1.1,
    knock: 1,
    lift: 0,
    limb: 'lHand',
    dodge: 'back',
    weight: 1.4,
    style: 'wild',
    keys: [
      { t: 0, pose: guard },
      { t: 0.22, pose: { lShF: 155, lShS: 20, lEl: 40, rShF: 60, rEl: 50, spineLean: 6 } },
      { t: 0.42, pose: { lShF: 55, lShS: 10, lEl: 25, rShF: 155, rShS: 20, rEl: 40, spineLean: 18, spineTwist: 15 } },
      { t: 0.62, pose: { lShF: 150, lShS: 20, lEl: 40, rShF: 55, rEl: 25, spineLean: 18, spineTwist: -15 } },
      { t: 0.8, pose: { lShF: 60, lEl: 25, rShF: 140, rEl: 40, spineLean: 14 } },
      { t: 1, pose: guard },
    ],
  },
];

export const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m])) as Record<string, Move>;

/** What tends to follow what in a combination, with weights. */
export const FOLLOW: Record<string, [string, number][]> = {
  jab: [['jab', 0.2], ['cross', 0.55], ['hook', 0.2], ['kick', 0.05]],
  cross: [['hook', 0.5], ['uppercut', 0.2], ['jab', 0.15], ['roundhouse', 0.15]],
  hook: [['cross', 0.45], ['uppercut', 0.3], ['roundhouse', 0.25]],
  uppercut: [['hook', 0.55], ['cross', 0.45]],
  kick: [['cross', 0.5], ['jab', 0.5]],
  roundhouse: [['jab', 0.6], ['cross', 0.4]],
  haymaker: [['haymaker', 0.4], ['flail', 0.6]],
  flail: [['haymaker', 0.6], ['flail', 0.4]],
};

/** Poses for non-attack actions, merged over the stance. */
export const POSES = {
  block: { lShF: 82, lShS: -6, lEl: 140, rShF: 78, rShS: -6, rEl: 145, spineLean: 18, crouch: 0.12, headPitch: 6 },
  stagger: { spineLean: -22, headPitch: -28, crouch: 0.12, lShF: 25, rShF: 15, lEl: 50, rEl: 40, lShS: 25, rShS: 25 },
  dodgeL: { spineSide: -28, spineLean: 18, crouch: 0.2, headPitch: 5 },
  dodgeR: { spineSide: 28, spineLean: 18, crouch: 0.2, headPitch: 5 },
  dodgeBack: { spineLean: -18, crouch: 0.12, headPitch: -5 },
  air: { lShF: 120, lShS: 60, lEl: 30, rShF: 110, rShS: 60, rEl: 30, lHipF: 30, rHipF: 10, lKn: 40, rKn: 20 },
  down: { lShF: 160, lShS: 40, lEl: 20, rShF: 150, rShS: 40, rEl: 20, lHipF: 10, rHipF: -5, lKn: 30, rKn: 10, crouch: 0, headPitch: 0 },
  parry: { lShF: 95, lShS: 38, lEl: 45, spineTwist: -28, spineLean: 12, rShF: 55, rEl: 120, crouch: 0.1 },
  slamUp: { lShF: 172, rShF: 172, lShS: 18, rShS: 18, lEl: 20, rEl: 20, crouch: 0, spineLean: -12, headPitch: -15 },
  slamDown: { lShF: 75, rShF: 75, lShS: 10, rShS: 10, lEl: 10, rEl: 10, crouch: 0.4, spineLean: 42, headPitch: 20 },
  dash: { spineLean: 32, crouch: 0.18, lShF: 20, rShF: 20, lShS: 25, rShS: 25, lEl: 40, rEl: 40 },
  /** Guard of someone who never trained: hands low and wide, chin up. */
  sloppy: { lShF: 32, lShS: 26, lEl: 70, rShF: 28, rShS: 26, rEl: 80, spineLean: 3, crouch: 0.02, pelvisTwist: -4, spineTwist: -3, headPitch: 2 },
  victory: { lShF: 170, lShS: 22, lEl: 12, rShF: 170, rShS: 22, rEl: 12, crouch: 0, spineLean: -8, headPitch: -12, pelvisTwist: 0, spineTwist: 0 },
} satisfies Record<string, Partial<Pose>>;

export function withStance(p: Partial<Pose>): Pose {
  return { ...STANCE, ...p };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Pose of a move at normalized time u (0..1). */
export function sampleMove(m: Move, u: number, out: Pose): Pose {
  const keys = m.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < u) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (u - a.t) / Math.max(1e-6, b.t - a.t))));
  for (const k of POSE_KEYS) {
    const va = a.pose[k] ?? STANCE[k];
    const vb = b.pose[k] ?? STANCE[k];
    out[k] = va + (vb - va) * t;
  }
  return out;
}
