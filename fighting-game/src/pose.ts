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

/**
 * On the floor. Top: kneeling tall in the guard, sitting on him in the mount,
 * lying across him in side control; a strike from the top is a hand raised and
 * driven down. Bottom: legs wrapped round him in the guard, framing or covering
 * the face. Submissions bend both into the hold.
 */
function groundPose(f: Fighter, out: Pose): Pose {
  const g = f.grapple!;
  Object.assign(out, STANCE);
  out.crouch = 0;
  out.pelvisTwist = 0;
  out.spineTwist = 0;
  out.spineSide = 0;
  out.bodyTilt = 0;
  const now = f.clock;
  // Breathing and small shifts of weight, so nobody lies frozen.
  const breathe = Math.sin(now * 2.2 + f.style.phase[0]);
  if (g.top === f) {
    // The whole body is upright here (the sim turns it); kneeling, sitting, or lying across.
    const p = g.pos;
    if (p === 'guard') {
      Object.assign(out, {
        lHipF: 5, rHipF: 5, lKn: 95, rKn: 95, lHipS: 22, rHipS: 22,
        spineLean: 35 + 3 * breathe, headPitch: 20,
        lShF: 70, lShS: 12, lEl: 35, rShF: 70, rShS: 12, rEl: 35,
      });
    } else if (p === 'mount') {
      Object.assign(out, {
        lHipF: 65, rHipF: 65, lKn: 135, rKn: 135, lHipS: 42, rHipS: 42,
        spineLean: 18 + 3 * breathe, headPitch: 15,
        lShF: 55, lShS: 20, lEl: 35, rShF: 55, rShS: 20, rEl: 35,
      });
    } else {
      Object.assign(out, {
        lHipF: 35, rHipF: 25, lKn: 100, rKn: 110, lHipS: 25, rHipS: 25,
        spineLean: 68 + 3 * breathe, headPitch: 10,
        lShF: 80, lShS: 30, lEl: 60, rShF: 80, rShS: 30, rEl: 60,
      });
    }
    if (g.strike) out.spineTwist = g.strike.hand === 'l' ? 18 : -18;
    if (g.sub?.by === f) {
      if (g.sub.kind === 'choke') Object.assign(out, { lShF: 85, lShS: -30, lEl: 125, rShF: 85, rShS: -30, rEl: 125, spineLean: out.spineLean + 15, headPitch: 35 });
      else Object.assign(out, { spineLean: -45, lShF: 40, rShF: 40, lEl: 20, rEl: 20, lHipF: 80, rHipF: 80, lKn: 60, rKn: 60 });
    }
  } else {
    // On his back (the sim lays him down): "forward" here is up toward the top man.
    const guard = g.pos === 'guard';
    Object.assign(out, guard
      ? { lHipF: 85, rHipF: 85, lKn: 105, rKn: 105, lHipS: 50, rHipS: 50, spineLean: 18 + 2 * breathe, headPitch: 25,
          lShF: 100, lShS: 10, lEl: 60, rShF: 100, rShS: 10, rEl: 60 }
      : { lHipF: 45, rHipF: 30, lKn: 90, rKn: 70, lHipS: 12, rHipS: 12, spineLean: 12 + 2 * breathe, headPitch: 25,
          lShF: 90, lShS: 15, lEl: 85, rShF: 90, rShS: 15, rEl: 85 });
    if (g.covering || f.daze > 0.4) Object.assign(out, { lShF: 125, lShS: 5, lEl: 135, rShF: 125, rShS: 5, rEl: 135, headPitch: 35 });
    if (f.daze > 0.75) Object.assign(out, { lShF: 30, lEl: 30, rShF: 40, rEl: 20, lHipF: 15, rHipF: 25, lKn: 25, rKn: 40, headPitch: -10, spineLean: 0 });
    if (g.sub?.by === f) {
      // Triangle or armbar from the guard: the legs go high round his head and arm.
      Object.assign(out, { lHipF: 115, rHipF: 110, lKn: 80, rKn: 65, lHipS: 22, rHipS: 28, lShF: 110, rShF: 110, lEl: 50, rEl: 50, spineLean: 25 });
    }
    if (g.sub && g.sub.by !== f) {
      // Fighting the hold.
      Object.assign(out, { lShF: 110, rShF: 110, lEl: 70, rEl: 70 });
      out.spineSide = 12 * Math.sin(now * 9);
      out.lHipF += 20 * Math.sin(now * 7);
    }
  }
  return out;
}

export function targetPose(f: Fighter, out: Pose = clonePose(STANCE)): Pose {
  if (f.state === 'ground' && f.grapple) return groundPose(f, out);
  if (f.state !== 'ok') return downPose(f, out);
  // The fighter's own stance comes from the fighting style.
  const base = stanceOf(f);
  Object.assign(out, base);
  const a = f.action;
  if (!a || a.kind === 'block') {
    // Never quite still: the head and torso keep moving, a trained fighter bounces.
    const st = f.style;
    const disc = f.disc;
    const ev = f.p.evasion;
    const hm = st.headMove * disc.headMove * (1 + 1.6 * ev);
    const t = f.clock;
    out.spineSide += hm * 9 * (Math.sin(t * 1.9 + st.phase[0]) + 0.5 * Math.sin(t * 3.7 + st.phase[1]));
    out.spineLean += hm * 6 * Math.sin(t * 1.3 + st.phase[2]);
    out.headPitch += hm * 4 * Math.sin(t * 2.3 + st.phase[1]);
    // Bobbing and weaving: an elusive fighter keeps changing level and line.
    if (ev > 0.3) {
      const w = (ev - 0.3) / 0.7;
      out.crouch += 0.05 * w * (1 + Math.sin(t * 2.6 + st.phase[2]));
      out.spineSide += 12 * w * Math.sin(t * 1.3 + st.phase[0]);
      out.spineLean += 6 * w * (1 + Math.sin(t * 2.6 + st.phase[2]));
    }
    out.crouch += 0.03 * st.bounce * disc.bounce * (1 + Math.sin(t * 2 * Math.PI * 2.8 + st.phase[0]));
    // Arms swing a little with the steps; the legs themselves are placed by the feet.
    const amp = Math.min(1, f.groundSpeed / (f.stride * f.body * 0.6));
    const s = Math.sin(f.walkPhase);
    out.lShF -= 6 * s * amp;
    out.rShF += 6 * s * amp;
    // Shoulder feint: a sharp half-turn as if a punch is coming. Level feint: a quick dip.
    const tw = f.clock - f.twitchW;
    if (f.twitch && tw >= 0 && tw < 0.35) {
      const k = Math.sin((Math.PI * tw) / 0.35);
      if (f.twitch === 'shoulder') {
        out.spineTwist += 26 * k;
        out.pelvisTwist += 10 * k;
        out.rShF += 12 * k;
      } else {
        out.crouch += 0.14 * k;
        out.spineLean += 12 * k;
      }
    }
    // Not under attack, the guard is relaxed; it comes up fully only in a block.
    if (!a) {
      const relax = 8 + 14 * (1 - f.tech);
      out.lShF -= relax;
      out.rShF -= relax * 0.8;
      out.lEl -= relax * 0.6;
      out.rEl -= relax * 0.5;
    }
    // Tired: the hands sink, the chin comes up, the chest heaves.
    const tired = f.fatigue;
    if (tired > 0) {
      out.lShF -= 28 * tired;
      out.rShF -= 22 * tired;
      out.lEl -= 18 * tired;
      out.rEl -= 18 * tired;
      out.headPitch -= 8 * tired;
      out.spineLean += 6 * tired + 4 * tired * Math.sin(t * 2 * Math.PI * (0.6 + 0.6 * tired));
      out.crouch -= 0.02 * tired;
    }
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
        // The head leaves the line of a straight punch, to the outside of the punching arm.
        if (m.path === 'straight' && m.limb.endsWith('Hand')) {
          const off = 8 * (0.4 + 0.6 * f.tech) * Math.sin(Math.PI * Math.min(1, u));
          out.spineSide += m.limb[0] === 'l' ? off : -off;
        }
        // The hand that is not punching should stay at the chin; without training it drops.
        if (m.path && m.limb.endsWith('Hand')) {
          const drop = 30 * (1 - f.tech) * Math.sin(Math.PI * Math.min(1, u));
          if (m.limb[0] === 'l') {
            out.rShF -= drop;
            out.rEl -= drop * 0.8;
          } else {
            out.lShF -= drop;
            out.lEl -= drop * 0.8;
          }
        }
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
      case 'shoot':
        lerpPose(out, out, withStance(POSES.shoot), smooth(Math.min(u * 4, (1 - u) * 3)));
        break;
      case 'sprawl':
        lerpPose(out, out, withStance(POSES.sprawl), smooth(Math.min(u * 6, (1 - u) * 2.5)));
        break;
      case 'catch':
      case 'sweep':
        lerpPose(out, out, withStance(POSES.block), smooth(Math.min(u * 6, (1 - u) * 4)));
        break;
      case 'parry':
        lerpPose(out, out, withStance(POSES.parry), smooth(Math.min(u * 7, (1 - u) * 3)));
        break;
      case 'dodge': {
        if (!a.dodgeOff) {
          lerpPose(out, out, withStance(POSES[a.pose ?? 'dodgeBack']), smooth(Math.min(u * 6, (1 - u) * 2.6)));
          break;
        }
        // Precise head movement: straight to the spot that clears the blow, hold it while
        // the blow goes by, then back. The trunk bends to carry the head there.
        const reach = a.reachT ?? 0.15;
        const back = Math.min(0.22, a.dur * 0.35);
        const t0 = a.t - (a.delayT ?? 0);
        const k = t0 < 0 ? 0 : t0 < reach ? smooth(t0 / reach) : a.t > a.dur - back ? smooth((a.dur - a.t) / back) : 1;
        const o = a.dodgeOff;
        const L = 0.62 * f.scale;
        const deg = (x: number) => (Math.asin(THREE.MathUtils.clamp(x / L, -0.8, 0.8)) * 180) / Math.PI;
        const down = Math.max(0, -o.y);
        out.spineSide += -deg(o.x) * k;
        out.spineLean += (deg(o.z) + (down / f.scale) * 75) * k;
        out.crouch += (down / f.scale) * 0.75 * k;
        out.headPitch += (down / f.scale) * 30 * k - (o.z < 0 ? 12 : 0) * k;
        out.spineTwist += -deg(o.x) * 0.35 * k;
        break;
      }
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
