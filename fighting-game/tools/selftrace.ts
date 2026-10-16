// Timeline of the last second before falls nobody caused. run.sh selftrace "0,1,2,3,6,7" 2 [max]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number), N = Number(process.argv[3] ?? 2), MAX = Number(process.argv[4] ?? 6);
RAPIER.init().then(() => {
  let shown = 0;
  for (const pi of which) for (let s = 1; s <= N && shown < MAX; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 7 + pi);
    const hist: string[][] = [[], []];
    const lastHit = [-9, -9];
    const kd = (sim as any).knockDown.bind(sim);
    (sim as any).knockDown = (f: any, why: string, ...rest: any[]) => {
      if (f.state === 'ok' && why === 'потерял равновесие' && sim.t - lastHit[f.team] > 1 && shown < MAX) {
        shown++;
        console.log(`--- preset ${pi} seed ${s} ${f.p.name} (${f.p.discipline}) t=${sim.t.toFixed(2)} body ${f.body.toFixed(2)}`);
        console.log(hist[f.team].slice(-14).join('\n'));
      }
      return kd(f, why, ...rest);
    };
    let next = 0;
    while (!sim.winner && sim.t < 40) {
      sim.step(sim.stepSize());
      for (const e of sim.events as any[]) if (e.type === 'hit') lastHit[e.target.team] = sim.t;
      sim.events.length = 0;
      if (sim.t < next) continue;
      next = sim.t + 0.06;
      for (const f of sim.fighters as any[]) {
        const pb = f.rag.pelvis.body;
        const r = pb.rotation();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        const lv = pb.linvel();
        const a = f.action;
        hist[f.team].push(`${sim.t.toFixed(2)} ${(a ? a.kind + (a.move ? ':' + a.move.id : '') + (a.overcommit ? '!oc' : '') : '-').padEnd(20)} stab ${f.stability.toFixed(2)} bErr ${f.balanceErr.toFixed(2)} pelvUp ${up.y.toFixed(2)} y ${pb.translation().y.toFixed(2)} v ${Math.hypot(lv.x, lv.z).toFixed(1)} feet ${f.feet.map((x: any) => (x.free ? 'F' : x.step ? 'S' : 'p')).join('')} self ${f.self.length().toFixed(1)} ${f.thought.slice(0, 26)}`);
        if (hist[f.team].length > 40) hist[f.team].shift();
      }
    }
    sim.dispose();
  }
});
