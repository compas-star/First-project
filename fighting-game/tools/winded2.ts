// What a winded fighter thinks and does: run.sh winded2 <preset> <seed> [aggression]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const pi = Number(process.argv[2] ?? 0), seed = Number(process.argv[3] ?? 1), ag = process.argv[4];
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[pi]);
  if (ag) { a.aggression = Number(ag); b.aggression = Number(ag); }
  const sim = new Sim(a, b, seed);
  const seq = [0, 0]; const cnt: Record<string, number> = {};
  let wT = 0, dsum = 0, wantSum = 0;
  while (!sim.winner && sim.t < 90) {
    const h = sim.stepSize(); sim.step(h);
    sim.fighters.forEach((f, i) => {
      if (f.winded) { wT += h; dsum += h * f.pos.distanceTo(f.enemy.pos); wantSum += h * f.wantDist; }
      if (f.thoughtSeq !== seq[i]) { seq[i] = f.thoughtSeq; if (f.stamina < 0.3) { const k = f.thought.split(':')[0].slice(0, 40) + (f.winded ? ' [W]' : ''); cnt[k] = (cnt[k] ?? 0) + 1; } }
    });
    sim.events.length = 0;
  }
  console.log(`winded ${wT.toFixed(0)}s, avg dist ${(dsum / wT).toFixed(2)} want ${(wantSum / wT).toFixed(2)}`);
  console.log(Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => `${v} ${k}`).join('\n'));
});
