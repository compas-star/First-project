// How "drunk" fighters look: trunk tilt and sway, head wobble, losing balance, falls nobody caused.
// run.sh drunk "0,1,2,3" 3
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number), N = Number(process.argv[3] ?? 2), SECS = Number(process.argv[4] ?? 40);
const q = (r: { x: number; y: number; z: number; w: number }) => new THREE.Quaternion(r.x, r.y, r.z, r.w);
const UP = new THREE.Vector3(0, 1, 0);
RAPIER.init().then(() => {
  const lag: Record<string, number> = {}; let lagN = 0; let hIdle = 0, cIdle = 0, n = 0, nIdle = 0, tilt = 0, tiltIdle = 0, chestW = 0, headW = 0, pelvW = 0, unstable = 0, brace = 0, self = 0, falls = 0, time = 0;
  const tilts: number[] = [];
  const causes: Record<string, number> = {};
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 7 + pi);
    const lastHit = [-9, -9];
    const prev = ['ok', 'ok'];
    const kd = (sim as any).knockDown.bind(sim);
    (sim as any).knockDown = (f: any, why: string, ...rest: any[]) => {
      if (f.state === 'ok' && sim.t - lastHit[f.team] > 1) {
        const a = f.action;
        const k = `${why} | ${a ? a.kind + (a.move ? ':' + a.move.id : '') + (a.overcommit ? ' overcommit' : '') + (a.lean ? ' lean' : '') : '-'} | ${f.p.discipline}`;
        causes[k] = (causes[k] ?? 0) + 1;
      }
      return kd(f, why, ...rest);
    };
    while (!sim.winner && sim.t < SECS) {
      sim.step(sim.stepSize());
      for (const ev of sim.events) if (ev.type === 'hit') lastHit[ev.target === sim.fighters[0] ? 0 : 1] = sim.t;
      sim.events.length = 0;
      sim.fighters.forEach((f, i) => {
        if (prev[i] === 'ok' && f.state === 'down') { falls++; if (sim.t - lastHit[i] > 1) self++; }
        prev[i] = f.state;
        if (f.state !== 'ok' || f.action?.kind === 'getup' || sim.grapple) return;
        const ch = f.rag.byName.chest.body, hd = f.rag.byName.head.body, pv = f.rag.pelvis.body;
        const up = UP.clone().applyQuaternion(q(ch.rotation()));
        const ang = THREE.MathUtils.radToDeg(up.angleTo(UP));
        const w = (b: typeof ch) => { const v = b.angvel(); return Math.hypot(v.x, v.y, v.z); };
        const cw = ch.angvel(), hw = hd.angvel();
        n++; tilt += ang; tilts.push(ang);
        chestW += w(ch); pelvW += w(pv);
        headW += Math.hypot(hw.x - cw.x, hw.y - cw.y, hw.z - cw.z);
        // How far each part is from where its muscles want it: floppiness, lag, wobble.
        if (!f.action || f.action.kind === 'block') {
          lagN++;
          for (const p of f.rag.parts) {
            const want = new THREE.Quaternion();
            (f.rag as any).target[p.key].getWorldQuaternion(want);
            const deg = THREE.MathUtils.radToDeg(want.angleTo(q(p.body.rotation())));
            lag[p.name] = (lag[p.name] ?? 0) + deg;
          }
        }
        if (f.stability < 0.9) unstable++;
        if (f.stability < 0.75) brace++;
        if (!f.action) { nIdle++; tiltIdle += ang; cIdle += w(ch); hIdle += Math.hypot(hw.x - cw.x, hw.y - cw.y, hw.z - cw.z); }
      });
      time += sim.stepSize();
    }
    sim.dispose();
  }
  tilts.sort((x, y) => x - y);
  const mins = time / 60;
  console.log(`trunk tilt ${(tilt / n).toFixed(1)}° (idle ${(tiltIdle / nIdle).toFixed(1)}°, p90 ${tilts[Math.floor(tilts.length * 0.9)].toFixed(1)}°)`);
  console.log(`spin rad/s: chest ${(chestW / n).toFixed(2)} pelvis ${(pelvW / n).toFixed(2)} head-vs-chest ${(headW / n).toFixed(2)}`);
  console.log(`idle (no action): chest ${(cIdle / nIdle).toFixed(2)} head-vs-chest ${(hIdle / nIdle).toFixed(2)} rad/s, idle share ${(100 * nIdle / n).toFixed(0)}%`);
  console.log('off target, idle, deg: ' + Object.entries(lag).map(([k, v]) => `${k} ${(v / lagN).toFixed(0)}`).join(' '));
  console.log(`stability<0.9 ${(100 * unstable / n).toFixed(1)}%  arms flailing (<0.75) ${(100 * brace / n).toFixed(1)}%`);
  for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log('  ', v, k);
  console.log(`falls/min ${(falls / mins).toFixed(2)}, nobody hit him ${(self / mins).toFixed(2)}/min (${self} of ${falls})`);
});
