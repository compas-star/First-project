// Two styles head to head on the floor: run.sh gvs wrestling bjj [fights]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import type { DisciplineId } from '../src/disciplines';
const [da, db] = [process.argv[2] as DisciplineId, process.argv[3] as DisciplineId];
const N = Number(process.argv[4] ?? 4);
RAPIER.init().then(() => {
  for (let s = 1; s <= N; s++) {
    const a = { ...defaultFighter(0), discipline: da, skill: 0.75 };
    const b = { ...defaultFighter(1), discipline: db, skill: 0.75 };
    const sim = new Sim(a, b, s * 97, MAP_BY_ID.cage);
    let groundT = 0; const shots = [0, 0]; const seq = [0, 0];
    while (!sim.winner && sim.t < 120) {
      const h = sim.stepSize(); sim.step(h);
      if (sim.grapple) groundT += h;
      sim.fighters.forEach((f, i) => { if (f.thoughtSeq !== seq[i]) { seq[i] = f.thoughtSeq; if (/проход в ноги|прыгнул/.test(f.thought)) shots[i]++; } });
      sim.events.length = 0;
    }
    console.log(`${da} vs ${db} #${s}: ${sim.t.toFixed(0)}s ${sim.winner ? (sim.winner.team ? db : da) + ' ' + sim.winner.enemy.koReason : 'draw'} | ground ${groundT.toFixed(0)}s, shots/pounces ${shots.join('/')}`);
    sim.dispose();
  }
});
