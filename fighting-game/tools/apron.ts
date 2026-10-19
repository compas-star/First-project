// Puts a fighter on the ring apron behind the ropes and checks the referee brings him back.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID, room } from '../src/maps';
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[0]);
  const sim = new Sim(a, b, 3, MAP_BY_ID.ring, { roundLen: 180, clock: 3, rounds: 3, tough: 1.6, standing: true } as never);
  while (sim.t < 2) sim.step(sim.stepSize());
  const f = sim.fighters[0];
  const p = f.rag.pelvis.body.translation();
  const dx = sim.map.size + 0.18 - p.x;
  for (const part of f.rag.parts) { const t = part.body.translation(); part.body.setTranslation({ x: t.x + dx, y: t.y + 0.05, z: t.z }, true); }
  f.pos.x += dx;
  for (let i = 0; i < 6; i++) {
    const t0 = sim.t;
    while (sim.t < t0 + 0.5) sim.step(sim.stepSize());
    const q = f.rag.pelvis.body.translation();
    console.log(`t${sim.t.toFixed(1)} room ${room(sim.map, q.x, q.z, { x: 0, z: 0 }).toFixed(2)} y ${q.y.toFixed(2)} state ${f.state}`);
  }
});
