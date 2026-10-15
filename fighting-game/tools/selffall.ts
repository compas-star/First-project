// Timeline before falls nobody caused: stability, balance error, pelvis tilt/height, speed, feet.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[2] ?? 2);
RAPIER.init().then(() => {
  let shown = 0;
  for (let s = 1; s <= N && shown < 5; s++) {
    const [a, b] = applyPreset(PRESETS[Number(process.argv[3] ?? 0)]);
    const sim = new Sim(a, b, s * 13 + 5);
    const hist: string[][] = [[], []];
    const lastHit = [-9, -9];
    const kd = (sim as any).knockDown.bind(sim);
    (sim as any).knockDown = (f: any, why: string, ...rest: any[]) => {
      if (f.state === 'ok' && why === 'потерял равновесие' && sim.t - lastHit[f.team] > 0.8 && shown < 5) {
        shown++;
        console.log(`--- ${f.p.name} t=${sim.t.toFixed(2)}`);
        console.log(hist[f.team].slice(-16).join('\n'));
      }
      return kd(f, why, ...rest);
    };
    let next = 0;
    while (!sim.winner && sim.t < 60) {
      sim.step(sim.stepSize());
      for (const e of sim.events as any[]) if (e.type === 'hit') { lastHit[e.target.team] = sim.t; }
      sim.events.length = 0;
      if (sim.t >= next) {
        next = sim.t + 0.08;
        for (const f of sim.fighters as any[]) {
          const pb = f.rag.pelvis.body; const r = pb.rotation(); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
          const v = pb.linvel(); const tq = new THREE.Quaternion(); f.rag.target.pelvis.getWorldQuaternion(tq); const tup = new THREE.Vector3(0,1,0).applyQuaternion(tq).y; const w = pb.angvel();
          const ft = f.feet.map((x: any) => x.free ? 'F' : x.t >= 0 ? 's' + x.t.toFixed(1) : 'p').join(',');
          const d = f.pos.distanceTo(f.enemy.pos);
          hist[f.team].push(`${sim.t.toFixed(2)} st=${f.stability.toFixed(2)} err=${f.balanceErr.toFixed(2)} up=${up.y.toFixed(2)}/${tup.toFixed(2)} w=${Math.hypot(w.x,w.y,w.z).toFixed(0)} y=${pb.translation().y.toFixed(2)} v=${Math.hypot(v.x, v.z).toFixed(1)} vy=${v.y.toFixed(1)} feet=${ft} act=${f.action ? f.action.kind + (f.action.move ? ':' + f.action.move.id : '') + '@' + (f.action.t / f.action.dur).toFixed(2) : '-'} d=${d.toFixed(2)} wob=${(f.wobbleUntilW > sim.t) ? 1 : 0}`);
        }
      }
    }
    sim.dispose();
  }
});
