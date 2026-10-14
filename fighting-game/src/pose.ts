import { clonePose, lerpPose, STANCE, type Pose } from './rig';
import { POSES, sampleMove, withStance } from './moves';
import type { Fighter } from './sim';

// The pose a fighter's muscles aim for right now. Physics decides how much of
// it the body actually reaches.

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const DOWN = withStance(POSES.down);

export function targetPose(f: Fighter, out: Pose = clonePose(STANCE)): Pose {
  if (f.state !== 'ok') {
    Object.assign(out, DOWN);
    return out;
  }
  Object.assign(out, STANCE);
  const a = f.action;
  if (!a || a.kind === 'block') {
    const amp = Math.min(1, f.groundSpeed / (f.stride * f.body * 0.6));
    const s = Math.sin(f.walkPhase);
    out.lHipF += 28 * s * amp;
    out.rHipF -= 28 * s * amp;
    out.lKn += Math.max(0, -s) * 50 * amp;
    out.rKn += Math.max(0, s) * 50 * amp;
    out.lShF -= 8 * s * amp;
    out.rShF += 8 * s * amp;
  }
  if (!a) return out;
  const u = a.t / a.dur;
  switch (a.kind) {
    case 'attack':
      sampleMove(a.move!, u, out);
      break;
    case 'block':
      lerpPose(out, out, withStance(POSES.block), smooth(u * 8));
      break;
    case 'dodge':
      lerpPose(out, out, withStance(POSES[a.pose ?? 'dodgeBack']), smooth(Math.min(u * 5, (1 - u) * 3)));
      break;
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
  return out;
}
