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

export function targetPose(f: Fighter, out: Pose = clonePose(STANCE)): Pose {
  if (f.state !== 'ok') {
    Object.assign(out, DOWN);
    return out;
  }
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
        if (a.noise) {
          for (const k of POSE_KEYS) out[k] += (a.noise[k] ?? 0) * env;
        }
        break;
      }
      case 'block':
        lerpPose(out, out, withStance(POSES.block), smooth(u * 8));
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
  // An untrained fighter carries the hands low and wide whatever he does.
  const sloppy = 1 - f.tech;
  if (sloppy > 0) {
    for (const k of POSE_KEYS) out[k] += (SLOPPY[k] - STANCE[k]) * sloppy * 0.85;
  }
  return out;
}
