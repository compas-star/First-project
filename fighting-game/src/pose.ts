import * as THREE from 'three';
import { clonePose, lerpPose, POSE_KEYS, STANCE, type Pose } from './rig';
import { POSES, sampleMove, withStance } from './moves';
import type { Fighter } from './sim';

// The pose a fighter's muscles aim for right now. Physics decides how much of
// it the body actually reaches.

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const DOWN = withStance(POSES.down);
const stances = new Map<string, Pose>();

/** Stance of a fighter's style, built once per style. */
function stanceOf(f: Fighter): Pose {
  let p = stances.get(f.disc.id);
  if (!p) {
    p = withStance(f.stance.pose);
    stances.set(f.disc.id, p);
  }
  return p;
}
const SLOPPY = withStance(POSES.sloppy);

const FENCING = withStance(POSES.fencing);
const FOLD = withStance(POSES.fold);
const TUCK = withStance(POSES.tuck);
const CATCH = withStance(POSES.catch);
const DOWN_BACK = withStance(POSES.downBack);
const DOWN_FRONT = withStance(POSES.downFront);

/**
 * Pose the muscles hold while falling and lying. A knockout locks rigid, a body
 * shot folds, a buckled leg gives way, a fall is braced with the arms; on the
 * floor a conscious fighter pulls his knees up or pushes with his hands.
 */
function downPose(f: Fighter, out: Pose): Pose {
  const t = f.fallT;
  const falling = t < 0.8;
  if (f.state === 'ko' && t > 1.2) return Object.assign(out, DOWN);
  if (falling) {
    switch (f.fall) {
      case 'timber':
        return Object.assign(out, FENCING);
      case 'fold':
        return Object.assign(out, FOLD);
      case 'buckle': {
        Object.assign(out, f.faceUp < 0 ? CATCH : TUCK);
        // The leg that was hit folds under him.
        if (f.fallSide === 'l') {
          out.lHipF = 55;
          out.lKn = 130;
        } else {
          out.rHipF = 55;
          out.rKn = 130;
        }
        return out;
      }
      case 'back':
        // Arms go where the floor is coming from.
        return Object.assign(out, f.faceUp < -0.2 ? CATCH : TUCK);
      default:
        return Object.assign(out, DOWN);
    }
  }
  if (f.state === 'ko') return Object.assign(out, DOWN);
  // Conscious on the floor: never quite still.
  Object.assign(out, f.faceUp > 0.2 ? DOWN_BACK : f.faceUp < -0.2 ? DOWN_FRONT : FOLD);
  const w = Math.sin(t * 2.3);
  out.lHipF += 12 * w;
  out.rHipF -= 10 * w;
  out.lKn += 15 * Math.sin(t * 1.7 + 1);
  out.headPitch += 8 * Math.sin(t * 1.1);
  return out;
}

const chain = { ...STANCE } as Pose;

export function targetPose(f: Fighter, out: Pose = clonePose(STANCE)): Pose {
  if (f.state !== 'ok') return downPose(f, out);
  // The fighter's own stance comes from the fighting style.
  const base = stanceOf(f);
  Object.assign(out, base);
  const a = f.action;
  if (!a || a.kind === 'block') {
    // Never quite still: the head and torso keep moving, a trained fighter bounces.
    const st = f.style;
    const disc = f.disc;
    const hm = st.headMove * disc.headMove;
    const t = f.clock;
    out.spineSide += hm * 9 * (Math.sin(t * 1.9 + st.phase[0]) + 0.5 * Math.sin(t * 3.7 + st.phase[1]));
    out.spineLean += hm * 6 * Math.sin(t * 1.3 + st.phase[2]);
    out.headPitch += hm * 4 * Math.sin(t * 2.3 + st.phase[1]);
    out.crouch += 0.03 * st.bounce * disc.bounce * (1 + Math.sin(t * 2 * Math.PI * 2.8 + st.phase[0]));
    // Arms swing a little with the steps; the legs themselves are placed by the feet.
    const amp = Math.min(1, f.groundSpeed / (f.stride * f.body * 0.6));
    const s = Math.sin(f.walkPhase);
    out.lShF -= 6 * s * amp;
    out.rShF += 6 * s * amp;
  }
  if (a) {
    const u = a.t / a.dur;
    switch (a.kind) {
      case 'attack': {
        const m = a.move!;
        sampleMove(m, u, out, base);
        // Kinetic chain: the hips turn first, the trunk follows, the arm comes last.
        // The hips and trunk are sampled a little ahead of the arm's own timing.
        const lead = 0.05 + 0.04 * f.tech;
        sampleMove(m, Math.min(1, u + lead), chain, base);
        out.pelvisTwist = chain.pelvisTwist;
        out.crouch = chain.crouch;
        sampleMove(m, Math.min(1, u + lead * 0.5), chain, base);
        out.spineTwist = chain.spineTwist;
        out.spineLean = chain.spineLean;
        out.spineSide = chain.spineSide;
        const st = f.style;
        // Personal manner: how far the hips and shoulders turn into the blow.
        out.spineTwist = base.spineTwist + (out.spineTwist - base.spineTwist) * st.twist;
        out.pelvisTwist = base.pelvisTwist + (out.pelvisTwist - base.pelvisTwist) * st.twist;
        const env = Math.sin(Math.PI * Math.min(1, u));
        if (m.path && a.zone === 'body') {
          // Dip the level to punch to the body.
          out.crouch += 0.13 * env;
          out.spineLean += 10 * env;
        }
        // Weight behind the blow: the level drops a little as it lands.
        const [a0, a1] = m.active;
        const land = Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp((u - a0 * 0.7) / (a1 - a0 * 0.7), 0, 1)));
        out.crouch += 0.035 * land * Math.min(1.5, m.power / 1.6);
        // Missed with everything behind it: the body keeps going past the target.
        if (a.overcommit > 0) {
          const k = a.overcommit * Math.sin(Math.PI * THREE.MathUtils.clamp((u - a1) / (1 - a1), 0, 1));
          const dir = out.spineTwist >= base.spineTwist ? 1 : -1;
          out.spineTwist += dir * 22 * k;
          out.pelvisTwist += dir * 12 * k;
          out.spineLean += 14 * k;
          out.headPitch += 8 * k;
        }
        if (a.noise) {
          for (const k of POSE_KEYS) out[k] += (a.noise[k] ?? 0) * env;
        }
        break;
      }
      case 'block':
        lerpPose(out, out, withStance(POSES.block), smooth(u * 8));
        break;
      case 'catch':
      case 'sweep':
        lerpPose(out, out, withStance(POSES.block), smooth(Math.min(u * 6, (1 - u) * 4)));
        break;
      case 'parry':
        lerpPose(out, out, withStance(POSES.parry), smooth(Math.min(u * 7, (1 - u) * 3)));
        break;
      case 'dodge':
        lerpPose(out, out, withStance(POSES[a.pose ?? 'dodgeBack']), smooth(Math.min(u * 5, (1 - u) * 3)));
        break;
      case 'dash':
        lerpPose(out, out, withStance(POSES.dash), smooth(Math.min(u * 6, (1 - u) * 4)));
        break;
      case 'slam': {
        const up = withStance(POSES.slamUp);
        if (u < 0.45) lerpPose(out, out, up, smooth(u / 0.3));
        else if (u < 0.6) lerpPose(out, up, withStance(POSES.slamDown), smooth((u - 0.45) / 0.1));
        else lerpPose(out, withStance(POSES.slamDown), STANCE, smooth((u - 0.6) / 0.4));
        break;
      }
      case 'stagger':
        lerpPose(out, out, withStance(POSES.stagger), smooth(Math.min(u * 6, (1 - u) * 2.5)));
        break;
      case 'getup':
        lerpPose(out, DOWN, STANCE, smooth(u * 1.4));
        break;
      case 'victory':
        lerpPose(out, out, withStance(POSES.victory), smooth(u * 3));
        break;
    }
  }
  // Losing balance: the arms go out to catch the fall.
  if (f.stability < 0.75 && a?.kind !== 'getup') {
    lerpPose(out, out, withStance(POSES.brace, base), smooth((0.75 - f.stability) / 0.5));
  }
  // Dazed: hands drop, knees go soft, the body sways.
  if (f.dazed && a?.kind !== 'getup') {
    const t = f.clock;
    lerpPose(out, out, SLOPPY, 0.6);
    out.spineSide += 14 * Math.sin(t * 2.1);
    out.spineLean += 8 * Math.sin(t * 1.3 + 0.7);
    out.headPitch += 12 * Math.sin(t * 1.7);
    out.crouch += 0.06 * (1 + Math.sin(t * 3.1));
  }
  // An untrained fighter carries the hands low and wide whatever he does.
  const sloppy = 1 - f.tech;
  if (sloppy > 0) {
    for (const k of POSE_KEYS) out[k] += (SLOPPY[k] - STANCE[k]) * sloppy * 0.85;
  }
  return out;
}
