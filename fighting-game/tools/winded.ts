// Time spent out of breath, and what he does then: run.sh winded "0,2" 3
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0').split(',').map(Number), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 41 + pi);
    let T = 0; const w = [0, 0], att = [0, 0], dist = [0, 0], minS = [1, 1];
    const lastA = [0, 0];
    while (!sim.winner && sim.t < 90) {
      const h = sim.stepSize(); sim.step(h); T += h;
      sim.fighters.forEach((f, i) => {
        minS[i] = Math.min(minS[i], f.stamina);
        if (f.winded) { w[i] += h; dist[i] += h * f.pos.distanceTo(f.enemy.pos); if (f.action?.kind === 'attack' && f.action.id !== lastA[i]) { lastA[i] = f.action.id; att[i]++; } }
      });
      sim.events.length = 0;
    }
    console.log(`${PRESETS[pi].name} ${sim.t.toFixed(0)}s ${sim.winner ? (sim.winner.team ? 'B' : 'R') + ' ' + sim.winner.enemy.koReason : 'draw'} | winded ${w.map((x) => x.toFixed(0) + 's').join('/')} strikes while winded ${att.join('/')} avg dist ${dist.map((d, i) => (w[i] ? d / w[i] : 0).toFixed(1)).join('/')} min wind ${minS.map((x) => x.toFixed(2)).join('/')}`);
    sim.dispose();
  }
});
