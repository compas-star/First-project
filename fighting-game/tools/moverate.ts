// Per move: thrown, landed clean, landing rate, across presets (both fighters).
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[3] ?? 6);
const which = (process.argv[2] ?? '0,2,3').split(',').map(Number);
RAPIER.init().then(() => {
  const tries: Record<string, number> = {}, hits: Record<string, number> = {};
  let T = 0;
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 19 + pi);
    while (!sim.winner && sim.t < 40) sim.step(sim.stepSize());
    T += sim.t;
    for (const f of sim.fighters) {
      for (const [k, v] of Object.entries(f.mem.tries)) tries[k] = (tries[k] ?? 0) + v;
      for (const [k, v] of Object.entries(f.mem.hits)) hits[k] = (hits[k] ?? 0) + v;
    }
    sim.dispose();
  }
  console.log(`total fight time ${T.toFixed(0)}s`);
  for (const k of Object.keys(tries).sort((x, y) => tries[y] - tries[x])) console.log(k.padEnd(10), String(tries[k]).padStart(4), String(hits[k] ?? 0).padStart(4), `${Math.round(100 * (hits[k] ?? 0) / tries[k])}%`);
});
