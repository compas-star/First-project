// One kick at the lab dummy, traced: distance, foot height, foot to target.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import { MOVE_BY_ID } from '../src/moves';
import { partPoint } from '../src/physics';
import { aimPointOf } from '../src/strikes';
const id = process.argv[2] ?? 'headkick', D = Number(process.argv[3] ?? 1.3);
RAPIER.init().then(() => {
  const sim = new Sim({ ...defaultFighter(0), discipline: 'muaythai', skill: 0.8 }, { ...defaultFighter(1), aggression: 0 }, 7, MAP_BY_ID.dojo);
  sim.lab = { dist: D, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
  while (sim.t < 2.5) sim.step(sim.stepSize());
  const f = sim.fighters[0];
  const m = MOVE_BY_ID[id];
  const dist = f.pos.distanceTo(f.enemy.pos);
  const r = sim.attackRange(f, m);
  const lunge = process.env.LUNGE ? Number(process.env.LUNGE) : Math.max(m.lunge * f.scale, Math.min(dist - r * 0.85 + 0.05, dist - f.radius - f.enemy.radius - 0.1));
  console.log('start dist', dist.toFixed(2), 'range', r.toFixed(2), 'lunge', lunge.toFixed(2));
  const a = sim.startAction(f, 'attack', { move: m, zone: m.zones[0], lunge });
  const foot = new THREE.Vector3(), aim = new THREE.Vector3();
  let next = 0;
  while (f.action === a && sim.t < 20) {
    sim.step(sim.stepSize());
    const u = a.t / a.dur;
    if (u >= next) {
      next += 0.05;
      partPoint(f.rag.byName.rShin, new THREE.Vector3(0, -0.46, 0.05), foot);
      aimPointOf(f, a, aim);
      const hip = f.rag.byName.rThigh.body.translation();
      const pq = f.rag.pelvis.body.rotation();
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(pq.x, pq.y, pq.z, pq.w));
      const tq = f.rag.byName.rThigh.body.rotation();
      const th = new THREE.Vector3(0, -1, 0).applyQuaternion(new THREE.Quaternion(tq.x, tq.y, tq.z, tq.w));
      process.stdout.write(`pelvis tilt ${(Math.acos(upv.y) * 57.3).toFixed(0)}° thigh from down ${(Math.acos(-th.y) * 57.3).toFixed(0)}° stab ${f.stability.toFixed(2)} | `);
      if (u > 0.5) console.log('state', f.state, f.stability.toFixed(2), f.balance.toFixed(2));
      console.log(`u ${u.toFixed(2)} dist ${f.pos.distanceTo(f.enemy.pos).toFixed(2)} foot y ${foot.y.toFixed(2)} foot→aim ${foot.distanceTo(aim).toFixed(2)} hip y ${hip.y.toFixed(2)} aim y ${aim.y.toFixed(2)} hits ${sim.labHits.length}`);
    }
  }
  console.log('after', f.action?.kind, f.state, f.thought);
});
