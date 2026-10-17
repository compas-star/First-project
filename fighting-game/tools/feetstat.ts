// How the feet move: steps per second, which foot leads when advancing or retreating,
// stance kept or lost (crossed, narrow, wide), planted feet slipping, gliding without steps.
// run.sh feetstat "0,2,3" 2 [secs]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { actualFoot, stepStats } from '../src/feet';
const which = (process.argv[2] ?? '0,2,3').split(',').map(Number), N = Number(process.argv[3] ?? 2), SECS = Number(process.argv[4] ?? 40);
RAPIER.init().then(() => {
  let t = 0, steps = 0, fwdLead = 0, fwdRear = 0, backLead = 0, backRear = 0, crossed = 0, narrow = 0, wide = 0, n = 0, slip = 0, glide = 0, moving = 0;
  const sp: number[] = [];
  const by: Record<string, number[]> = {};
  const add = (k: string, j: number) => { (by[k] ??= [0, 0, 0])[j]++; };
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 11 + pi);
    const lastStep = [0, 0];
    const wasStepping = [[false, false], [false, false]];
    const af = new THREE.Vector3();
    while (!sim.winner && sim.t < SECS) {
      const h = sim.stepSize();
      sim.step(h);
      sim.events.length = 0;
      sim.fighters.forEach((f, k) => {
        if (f.state !== 'ok' || sim.grapple || f.action?.kind === 'getup') return;
        const kick = f.feet.some((x) => x.free);
        const fwd = new THREE.Vector3(Math.sin(f.facing), 0, Math.cos(f.facing));
        const left = new THREE.Vector3(Math.cos(f.facing), 0, -Math.sin(f.facing));
        const lv = f.rag.pelvis.body.linvel();
        const along = lv.x * fwd.x + lv.z * fwd.z;
        const speed = Math.hypot(lv.x, lv.z);
        t += h;
        for (const i of [0, 1] as const) {
          const st = f.feet[i].t >= 0;
          if (st && !wasStepping[k][i]) {
            steps++;
            lastStep[k] = sim.t;
            // Which foot moves first when travelling: a step starting while the other foot is planted.
            if (f.feet[1 - i].t < 0) {
              if (along > 0.35 * f.scale) i === 0 ? fwdLead++ : fwdRear++;
              else if (along < -0.35 * f.scale) i === 0 ? backLead++ : backRear++;
            }
          }
          wasStepping[k][i] = st;
          if (!st && !f.feet[i].free) {
            actualFoot(f, i, af);
            if (af.distanceTo(f.feet[i].pos) > 0.08 * f.scale) { slip++; add(f.action?.kind ?? 'idle', 2); }
          }
        }
        if (kick) return;
        n++;
        add(f.action?.kind ?? 'idle', 0);
        const d = new THREE.Vector3().subVectors(f.feet[0].pos, f.feet[1].pos);
        const side = d.dot(left), depth = d.dot(fwd);
        const want = (f.stance.footFwd + f.stance.footBack) * f.scale;
        if (depth < 0.05 * f.scale || side < -0.02 * f.scale) { crossed++; add(f.action?.kind ?? 'idle', 1); }
        else if (Math.hypot(side, depth) < 0.5 * want) narrow++;
        else if (Math.hypot(side, depth) > 1.8 * want) wide++;
        if (speed > 0.5 * f.scale) {
          moving++;
          sp.push(speed);
          if (sim.t - lastStep[k] > 0.35 && f.feet.every((x) => x.t < 0)) glide++;
        }
      });
    }
    sim.dispose();
  }
  const pc = (x: number, of: number) => `${((100 * x) / Math.max(1, of)).toFixed(1)}%`;
  for (const [k, [m, c, sl]] of Object.entries(by)) console.log(`  ${k.padEnd(8)} time ${pc(m, n)}  crossed ${pc(c, m)}  slipping feet ${pc(sl, 2 * m)}`);
  console.log('steps: catching', stepStats.catch, 'planned', stepStats.plan);
  console.log(`steps/s per fighter ${(steps / t).toFixed(2)}`);
  console.log(`advancing: lead foot first ${fwdLead}, rear first ${fwdRear} | retreating: rear first ${backRear}, lead first ${backLead}`);
  console.log(`stance: crossed/square ${pc(crossed, n)} narrow ${pc(narrow, n)} wide ${pc(wide, n)}`);
  console.log(`planted foot off its spot ${pc(slip, n * 2)}; moving ${pc(moving, n)} of the time, gliding (no step for 0.35 s while moving) ${pc(glide, moving)}`);
});
