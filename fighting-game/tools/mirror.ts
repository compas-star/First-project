// Same fighter on both sides: red/blue should win equally often.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
const N = Number(process.argv[2] ?? 20);
RAPIER.init().then(() => {
  const w = [0, 0, 0]; const hp = [0, 0];
  for (let s = 1; s <= N; s++) {
    const a = { ...defaultFighter(0), skill: 0.8, aggression: 0.6 };
    const b = { ...defaultFighter(1), skill: 0.8, aggression: 0.6, ...(process.env.SAME ? { name: a.name } : {}) };
    const sim = new Sim(a, b, s * 31 + 3 + Number(process.env.OFF ?? 0));
    while (!sim.winner && sim.t < 75) sim.step(sim.stepSize());
    w[sim.winner ? sim.winner.team : 2]++; hp[0] += sim.fighters[0].hp; hp[1] += sim.fighters[1].hp;
    sim.dispose();
  }
  console.log(`red ${w[0]} blue ${w[1]} draw ${w[2]}; avg hp red ${(hp[0] / N).toFixed(0)} blue ${(hp[1] / N).toFixed(0)}`);
});
