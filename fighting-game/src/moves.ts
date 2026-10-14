import { STANCE, POSE_KEYS, type Pose } from './rig';

// A move is data: keyframed torso poses over normalized time, a hit window and,
// for aimed strikes, the path the fist or foot follows to the target by IK.
// The set follows MMA: boxing punches, elbows and knees, Muay Thai and karate kicks.
// Orthodox stance: left is the lead side, right the rear.

export interface Keyframe {
  t: number;
  pose: Partial<Pose>;
}

export type Striker = 'lHand' | 'rHand' | 'lFoot' | 'rFoot' | 'lKnee' | 'rKnee' | 'lElbow' | 'rElbow';
export type Zone = 'head' | 'body' | 'leg';
export type PunchPath = 'straight' | 'hook' | 'upper' | 'swing' | 'over';
export type KickPath = 'teep' | 'round' | 'low' | 'back';

export interface Move {
  id: string;
  name: string;
  /** Length in the fighter's own seconds (divided by body speed in world time). */
  duration: number;
  /** Normalized time when the strike starts and stops being able to hit. */
  active: [number, number];
  /** Center-to-center reach for a 1.8 m fighter, not counting the target's body. */
  reach: number;
  /** Forward step during the wind-up, meters. */
  lunge: number;
  power: number;
  /** Extra upward share of the knockback. */
  lift: number;
  limb: Striker;
  /** How the target should dodge it. */
  dodge: 'side' | 'back';
  /** Clean technique, or a wild swing that needs no training. */
  style: 'clean' | 'wild';
  /** Where it can be aimed. */
  zones: Zone[];
  /** Aimed by IK along this path; keyframes then only move the rest of the body. */
  path?: PunchPath | KickPath;
  /** Whole-body turn over the move, radians (spinning techniques). */
  spin?: number;
  keys: Keyframe[];
}

type MoveDef = Omit<Move, 'lift' | 'dodge' | 'style' | 'lunge'> & Partial<Pick<Move, 'lift' | 'dodge' | 'style' | 'lunge'>>;

function move(d: MoveDef): Move {
  return { lift: 0, dodge: 'side', style: 'clean', lunge: 0.12, ...d };
}

const G: Partial<Pose> = {};

export const MOVES: Move[] = [
  // ---- Punches ----
  move({
    id: 'jab', name: 'джеб', duration: 0.36, active: [0.42, 0.66], reach: 0.62, lunge: 0.15, power: 1,
    limb: 'lHand', path: 'straight', zones: ['head', 'body'],
    keys: [
      { t: 0, pose: G },
      { t: 0.45, pose: { spineTwist: -34, spineLean: 9, pelvisTwist: -22 } },
      { t: 0.66, pose: { spineTwist: -34, spineLean: 9, pelvisTwist: -22 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'cross', name: 'кросс', duration: 0.48, active: [0.46, 0.7], reach: 0.6, lunge: 0.2, power: 1.6,
    limb: 'rHand', path: 'straight', zones: ['head', 'body'],
    keys: [
      { t: 0, pose: G },
      { t: 0.25, pose: { spineTwist: -20, crouch: 0.09 } },
      { t: 0.52, pose: { spineTwist: 34, pelvisTwist: 14, spineLean: 11 } },
      { t: 0.7, pose: { spineTwist: 34, pelvisTwist: 14, spineLean: 11 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'hook', name: 'левый хук', duration: 0.52, active: [0.45, 0.66], reach: 0.45, power: 1.8,
    limb: 'lHand', path: 'hook', zones: ['head', 'body'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { spineTwist: -40, crouch: 0.1 } },
      { t: 0.56, pose: { spineTwist: 30, spineSide: -8, pelvisTwist: 6 } },
      { t: 0.68, pose: { spineTwist: 36, spineSide: -8, pelvisTwist: 8 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'rhook', name: 'правый хук', duration: 0.58, active: [0.46, 0.66], reach: 0.47, power: 2,
    limb: 'rHand', path: 'hook', zones: ['head', 'body'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { spineTwist: 10, crouch: 0.1 } },
      { t: 0.56, pose: { spineTwist: 48, spineSide: 8, pelvisTwist: 22 } },
      { t: 0.68, pose: { spineTwist: 52, spineSide: 8, pelvisTwist: 24 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'luppercut', name: 'левый апперкот', duration: 0.5, active: [0.44, 0.66], reach: 0.45, power: 1.6,
    limb: 'lHand', path: 'upper', zones: ['head', 'body'], dodge: 'back', lift: 0.6,
    keys: [
      { t: 0, pose: G },
      { t: 0.32, pose: { crouch: 0.2, spineLean: 20, spineTwist: -26, spineSide: -10 } },
      { t: 0.55, pose: { crouch: 0, spineLean: -4, spineTwist: -8, headPitch: -12 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'uppercut', name: 'правый апперкот', duration: 0.56, active: [0.46, 0.68], reach: 0.5, lunge: 0.15, power: 2,
    limb: 'rHand', path: 'upper', zones: ['head', 'body'], dodge: 'back', lift: 0.8,
    keys: [
      { t: 0, pose: G },
      { t: 0.32, pose: { crouch: 0.22, spineLean: 24, spineTwist: 12 } },
      { t: 0.55, pose: { crouch: 0, spineLean: -6, spineTwist: 28, headPitch: -15 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'overhand', name: 'оверхенд', duration: 0.66, active: [0.5, 0.7], reach: 0.55, lunge: 0.25, power: 2.3,
    limb: 'rHand', path: 'over', zones: ['head'], dodge: 'side',
    keys: [
      { t: 0, pose: G },
      { t: 0.35, pose: { spineTwist: -12, spineSide: 14, crouch: 0.06 } },
      { t: 0.58, pose: { spineTwist: 42, spineSide: -12, spineLean: 22, pelvisTwist: 18, crouch: 0.14 } },
      { t: 0.72, pose: { spineTwist: 46, spineSide: -12, spineLean: 24, pelvisTwist: 20, crouch: 0.14 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'superman', name: 'супермен-панч', duration: 0.7, active: [0.52, 0.72], reach: 0.6, lunge: 0.75, power: 2.2,
    limb: 'rHand', path: 'straight', zones: ['head'],
    keys: [
      { t: 0, pose: G },
      { t: 0.25, pose: { crouch: 0.16, spineLean: 16 } },
      { t: 0.45, pose: { crouch: 0, spineLean: 4 } },
      { t: 0.58, pose: { spineTwist: 36, pelvisTwist: 16, spineLean: 14, crouch: 0.02 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'backfist', name: 'бэкфист с разворота', duration: 0.72, active: [0.5, 0.68], reach: 0.62, lunge: 0.2, power: 2,
    limb: 'rHand', path: 'straight', zones: ['head'], spin: -2 * Math.PI, dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { spineTwist: 25, crouch: 0.1 } },
      { t: 0.55, pose: { spineTwist: -20, spineSide: 10 } },
      { t: 1, pose: G },
    ],
  }),
  // ---- Elbows and knees ----
  move({
    id: 'lelbow', name: 'левый локоть', duration: 0.46, active: [0.42, 0.66], reach: 0.3, lunge: 0.15, power: 2,
    limb: 'lElbow', zones: ['head'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { lShF: 70, lShS: 75, lEl: 150, spineTwist: -38 } },
      { t: 0.55, pose: { lShF: 95, lShS: 60, lEl: 155, spineTwist: 30, spineLean: 12 } },
      { t: 0.7, pose: { lShF: 95, lShS: 45, lEl: 155, spineTwist: 34, spineLean: 12 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'relbow', name: 'правый локоть', duration: 0.5, active: [0.44, 0.66], reach: 0.32, lunge: 0.18, power: 2.3,
    limb: 'rElbow', zones: ['head'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { rShF: 70, rShS: 75, rEl: 150, spineTwist: 5 } },
      { t: 0.55, pose: { rShF: 95, rShS: 60, rEl: 155, spineTwist: 48, pelvisTwist: 18, spineLean: 12 } },
      { t: 0.7, pose: { rShF: 95, rShS: 45, rEl: 155, spineTwist: 52, pelvisTwist: 20, spineLean: 12 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'rknee', name: 'колено', duration: 0.56, active: [0.44, 0.68], reach: 0.38, lunge: 0.25, power: 2.4,
    limb: 'rKnee', zones: ['body'], dodge: 'back', lift: 0.4,
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { rHipF: 40, rKn: 120, spineLean: 18, lShF: 85, rShF: 85, lEl: 60, rEl: 60, lShS: -8, rShS: -8 } },
      { t: 0.52, pose: { rHipF: 115, rKn: 135, spineLean: -12, pelvisTwist: 10, lShF: 60, rShF: 60, lEl: 90, rEl: 90 } },
      { t: 0.7, pose: { rHipF: 110, rKn: 135, spineLean: -12, lShF: 60, rShF: 60, lEl: 90, rEl: 90 } },
      { t: 1, pose: G },
    ],
  }),
  // ---- Kicks ----
  move({
    id: 'teep', name: 'тип', duration: 0.58, active: [0.46, 0.68], reach: 0.82, lunge: 0.05, power: 1.6, lift: 0.1,
    limb: 'lFoot', path: 'teep', zones: ['body'],
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { spineLean: -6, crouch: 0.03 } },
      { t: 0.52, pose: { spineLean: -24, pelvisTwist: -10 } },
      { t: 0.7, pose: { spineLean: -22 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'lowkick', name: 'лоу-кик', duration: 0.6, active: [0.46, 0.68], reach: 0.66, power: 1.8,
    limb: 'rFoot', path: 'low', zones: ['leg'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { pelvisTwist: 20, spineTwist: -10, spineSide: 6 } },
      { t: 0.55, pose: { pelvisTwist: 65, spineTwist: -30, spineSide: 14, spineLean: 4, rShF: 20, rShS: 40, rEl: 40 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'calfkick', name: 'по икре', duration: 0.48, active: [0.42, 0.66], reach: 0.56, power: 1.3,
    limb: 'lFoot', path: 'low', zones: ['leg'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.5, pose: { pelvisTwist: -50, spineTwist: 20, spineSide: -10 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'bodykick', name: 'в корпус ногой', duration: 0.72, active: [0.48, 0.7], reach: 0.76, power: 2.6, lift: 0.2,
    limb: 'rFoot', path: 'round', zones: ['body'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { pelvisTwist: 30, spineTwist: -10, spineSide: 10 } },
      { t: 0.55, pose: { pelvisTwist: 85, spineTwist: -40, spineSide: 26, spineLean: -6, rShF: 10, rShS: 55, rEl: 30 } },
      { t: 0.7, pose: { pelvisTwist: 88, spineTwist: -40, spineSide: 26, spineLean: -6, rShF: 10, rShS: 55, rEl: 30 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'headkick', name: 'хай-кик', duration: 0.82, active: [0.5, 0.7], reach: 0.62, power: 3.4, lift: 0.3,
    limb: 'rFoot', path: 'round', zones: ['head'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.32, pose: { pelvisTwist: 35, spineTwist: -12, spineSide: 14, spineLean: -6 } },
      { t: 0.58, pose: { pelvisTwist: 95, spineTwist: -45, spineSide: 38, spineLean: -18, rShF: 10, rShS: 60, rEl: 30 } },
      { t: 0.72, pose: { pelvisTwist: 95, spineTwist: -45, spineSide: 38, spineLean: -18, rShF: 10, rShS: 60, rEl: 30 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'leadkick', name: 'передней ногой', duration: 0.6, active: [0.46, 0.68], reach: 0.66, power: 2, lift: 0.15,
    limb: 'lFoot', path: 'round', zones: ['body', 'head'], dodge: 'back',
    keys: [
      { t: 0, pose: G },
      { t: 0.3, pose: { pelvisTwist: -35, spineTwist: 12, spineSide: -10 } },
      { t: 0.55, pose: { pelvisTwist: -80, spineTwist: 38, spineSide: -26, spineLean: -6, lShF: 10, lShS: 55, lEl: 30 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'spinkick', name: 'с разворота ногой', duration: 0.9, active: [0.5, 0.68], reach: 0.82, lunge: 0.15, power: 3.2, lift: 0.15,
    limb: 'rFoot', path: 'back', zones: ['body'], spin: -2 * Math.PI, dodge: 'side',
    keys: [
      { t: 0, pose: G },
      { t: 0.35, pose: { spineLean: 22, crouch: 0.08, headPitch: 10 } },
      { t: 0.55, pose: { spineLean: 38, crouch: 0.06 } },
      { t: 1, pose: G },
    ],
  }),
  // ---- Wild ----
  move({
    id: 'haymaker', name: 'размашистый', duration: 0.8, active: [0.5, 0.7], reach: 0.5, lunge: 0.15, power: 2.4, lift: 0.1,
    limb: 'rHand', path: 'swing', zones: ['head'], dodge: 'back', style: 'wild',
    keys: [
      { t: 0, pose: G },
      { t: 0.38, pose: { spineTwist: -45, spineLean: -4, lShF: 40, lEl: 60 } },
      { t: 0.6, pose: { spineTwist: 48, spineLean: 18, pelvisTwist: 15, lShF: 30, lEl: 40 } },
      { t: 0.75, pose: { spineTwist: 55, spineLean: 20, pelvisTwist: 18 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'flail', name: 'машет руками', duration: 0.62, active: [0.3, 0.85], reach: 0.48, lunge: 0.25, power: 1.1,
    limb: 'lHand', zones: ['head'], dodge: 'back', style: 'wild',
    keys: [
      { t: 0, pose: G },
      { t: 0.22, pose: { lShF: 155, lShS: 20, lEl: 40, rShF: 60, rEl: 50, spineLean: 6 } },
      { t: 0.42, pose: { lShF: 55, lShS: 10, lEl: 25, rShF: 155, rShS: 20, rEl: 40, spineLean: 18, spineTwist: 15 } },
      { t: 0.62, pose: { lShF: 150, lShS: 20, lEl: 40, rShF: 55, rEl: 25, spineLean: 18, spineTwist: -15 } },
      { t: 0.8, pose: { lShF: 60, lEl: 25, rShF: 140, rEl: 40, spineLean: 14 } },
      { t: 1, pose: G },
    ],
  }),
  move({
    id: 'stomp', name: 'пинок', duration: 0.6, active: [0.45, 0.66], reach: 0.72, lunge: 0.1, power: 1.5,
    limb: 'rFoot', path: 'teep', zones: ['body', 'leg'], style: 'wild',
    keys: [
      { t: 0, pose: G },
      { t: 0.5, pose: { spineLean: -16, lShS: 35, rShS: 35, lShF: 30, rShF: 30 } },
      { t: 1, pose: G },
    ],
  }),
];

export const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m])) as Record<string, Move>;

/** What tends to follow what in a combination, with weights. */
export const FOLLOW: Record<string, [string, number][]> = {
  jab: [['jab', 0.2], ['cross', 0.5], ['hook', 0.15], ['lowkick', 0.1], ['superman', 0.05]],
  cross: [['hook', 0.4], ['luppercut', 0.1], ['lowkick', 0.2], ['bodykick', 0.1], ['jab', 0.1], ['lelbow', 0.1]],
  hook: [['cross', 0.4], ['uppercut', 0.25], ['rhook', 0.15], ['bodykick', 0.1], ['relbow', 0.1]],
  rhook: [['hook', 0.5], ['luppercut', 0.2], ['calfkick', 0.2], ['lelbow', 0.1]],
  luppercut: [['rhook', 0.4], ['cross', 0.4], ['rknee', 0.2]],
  uppercut: [['hook', 0.6], ['lelbow', 0.2], ['rknee', 0.2]],
  overhand: [['hook', 0.6], ['rknee', 0.4]],
  superman: [['hook', 0.6], ['bodykick', 0.4]],
  backfist: [['cross', 0.5], ['leadkick', 0.5]],
  lelbow: [['relbow', 0.6], ['rknee', 0.4]],
  relbow: [['lelbow', 0.5], ['rknee', 0.5]],
  rknee: [['relbow', 0.5], ['lelbow', 0.5]],
  teep: [['cross', 0.4], ['jab', 0.4], ['bodykick', 0.2]],
  lowkick: [['jab', 0.5], ['cross', 0.5]],
  calfkick: [['cross', 0.6], ['headkick', 0.4]],
  bodykick: [['jab', 0.6], ['cross', 0.4]],
  headkick: [['jab', 1]],
  leadkick: [['cross', 0.6], ['headkick', 0.4]],
  spinkick: [['jab', 1]],
  haymaker: [['haymaker', 0.4], ['flail', 0.4], ['stomp', 0.2]],
  flail: [['haymaker', 0.6], ['flail', 0.4]],
  stomp: [['haymaker', 1]],
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

export function withStance(p: Partial<Pose>, base: Pose = STANCE): Pose {
  return { ...base, ...p };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Pose of a move at normalized time u (0..1), over a fighter's own stance. */
export function sampleMove(m: Move, u: number, out: Pose, base: Pose = STANCE): Pose {
  const keys = m.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < u) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (u - a.t) / Math.max(1e-6, b.t - a.t))));
  for (const k of POSE_KEYS) {
    const va = a.pose[k] ?? base[k];
    const vb = b.pose[k] ?? base[k];
    out[k] = va + (vb - va) * t;
  }
  return out;
}
