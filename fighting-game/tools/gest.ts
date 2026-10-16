// How often each piece of body language shows: run.sh gest "0,2" 3
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0').split(',').map(Number), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  const c: Record<string, number> = {}; let T = 0;
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 41 + pi);
    const last = [0, 0];
    while (!sim.winner && sim.t < 90) {
      sim.step(sim.stepSize());
      sim.fighters.forEach((f, i) => { if (f.gesture && f.gestureW !== last[i]) { last[i] = f.gestureW; c[f.gesture] = (c[f.gesture] ?? 0) + 1; } });
      sim.events.length = 0;
    }
    T += sim.t; sim.dispose();
  }
  console.log(`per fighter-minute: ` + Object.entries(c).map(([k, v]) => `${k} ${(v / (2 * T / 60)).toFixed(1)}`).join(', '));
});
