// Stamina over a fight: sampled every 2 s for both fighters.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[3] ?? 3);
const which = (process.argv[2] ?? '0,2').split(',').map(Number);
RAPIER.init().then(() => {
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 29 + pi);
    let next = 0; const line: string[] = [];
    while (!sim.winner && sim.t < 60) {
      sim.step(sim.stepSize());
      if (sim.t >= next) { next += 2; line.push(sim.fighters.map((f) => f.stamina.toFixed(2)).join('/')); }
    }
    console.log(`${PRESETS[pi].name} ${sim.t.toFixed(0)}s: ${line.join(' ')}`);
    sim.dispose();
  }
});
