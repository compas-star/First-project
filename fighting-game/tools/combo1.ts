// A scripted combination at the lab dummy: does it flow and land? run.sh combo1 jab,cross,hook,lowkick
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import { MOVE_BY_ID } from '../src/moves';
const ids = (process.argv[2] ?? 'jab,cross,hook,lowkick').split(',');
RAPIER.init().then(() => {
  const sim = new Sim(defaultFighter(0), { ...defaultFighter(1), aggression: 0 }, 3, MAP_BY_ID.dojo);
  sim.lab = { dist: Number(process.env.DIST ?? 1.1), dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
  while (sim.t < 2.5) sim.step(sim.stepSize());
  const f = sim.fighters[0];
  const steps = ids.map((id) => ({ move: id, zone: MOVE_BY_ID[id].zones[0] }));
  sim.startAction(f, 'attack', { move: MOVE_BY_ID[ids[0]], zone: steps[0].zone, lunge: 0.2 });
  f.script = { steps, i: 1 };
  f.comboLeft = steps.length - 1;
  const t0 = sim.t;
  const seen: string[] = [];
  while (sim.t < t0 + 8 && (f.action || sim.t < t0 + 0.2)) {
    sim.step(sim.stepSize());
    const k = f.action?.move?.id;
    if (k && seen[seen.length - 1] !== k) seen.push(k);
  }
  console.log('thrown', seen.join(' → '), 'in', (sim.t - t0).toFixed(2), 's; hits', sim.labHits.map((h) => `${h.move}:${h.zone}${h.blocked ? '(блок)' : ''}`).join(' '));
});
