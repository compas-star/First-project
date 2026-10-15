// A fight as a story: every decision with its time, plus share of quiet time.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const pi = Number(process.argv[2] ?? 0), T = Number(process.argv[3] ?? 20), seed = Number(process.argv[4] ?? 5);
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[pi]);
  const sim = new Sim(a, b, seed);
  const seq = [0, 0]; let quiet = 0, total = 0, qd = 0;
  while (!sim.winner && sim.t < T) {
    const h = sim.stepSize(); sim.step(h); total += h;
    if (sim.fighters.every((f) => f.action?.kind !== 'attack')) { quiet += h; qd += sim.fighters[0].pos.distanceTo(sim.fighters[1].pos) * h; }
    sim.fighters.forEach((f, i) => { if (f.thoughtSeq !== seq[i]) { seq[i] = f.thoughtSeq; console.log(`${sim.t.toFixed(1).padStart(5)} ${i ? '          ' : ''}${i ? 'С' : 'К'}: ${f.thought}`); } });
    for (const e of sim.events) if (e.type === 'hit') console.log(`${sim.t.toFixed(1).padStart(5)}     ${e.target.team ? '→С' : '→К'} ${e.blocked ? 'блок' : e.zone} ${e.dmg.toFixed(1)}`);
    sim.events.length = 0;
  }
  console.log(`quiet ${(100 * quiet / total).toFixed(0)}%, distance while quiet ${(qd / quiet).toFixed(2)} wantDist ${sim.fighters.map((f) => f.wantDist.toFixed(2)).join('/')}`);
});
