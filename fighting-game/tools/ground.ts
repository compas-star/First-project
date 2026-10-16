// Grappling: story of shots, takedowns, positions and submissions, and how fights end.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
const pi = Number(process.argv[2] ?? 4), N = Number(process.argv[3] ?? 3), V = !!process.env.V;
RAPIER.init().then(() => {
  const st: Record<string, number> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 71 + Number(process.env.OFF ?? 0), MAP_BY_ID[PRESETS[pi].map]);
    const seq = [0, 0];
    let groundT = 0, maxV = 0;
    while (!sim.winner && sim.t < 120) {
      const h = sim.stepSize(); sim.step(h);
      if (sim.grapple) groundT += h;
      for (const f of sim.fighters) for (const p of f.rag.parts) { const v = p.body.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
      sim.fighters.forEach((f, i) => { if (f.thoughtSeq !== seq[i]) { seq[i] = f.thoughtSeq; const k = f.thought.split(':')[0]; if (/проход|спрол|тейкдаун|прыгнул|гард|маунт|удуш|рычаг|треуг|перевернул|встал|встаю|вырвался|дожал|колено навстречу|рефери|не смог|не дотянулся/.test(k)) { st[k] = (st[k] ?? 0) + 1; if (V) console.log(sim.t.toFixed(1), i ? 'B' : 'R', f.thought, sim.grapple ? `[${sim.grapple.pos}]` : ''); } } });
      sim.events.length = 0;
    }
    console.log(`fight ${s}: ${sim.t.toFixed(0)}s ${sim.winner ? (sim.winner.team ? 'B' : 'R') + ' ' + sim.winner.enemy.koReason : 'draw'} | on the ground ${groundT.toFixed(0)}s, max part speed ${maxV.toFixed(1)}`);
    sim.dispose();
  }
  console.log(JSON.stringify(st));
});
