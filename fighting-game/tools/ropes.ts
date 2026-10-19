// Fighters stuck outside the ring ropes: time each spends with the pelvis beyond the ropes
// while still on the platform. run.sh ropes [seeds] [secs] [bout=1]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID, room } from '../src/maps';
const SEEDS = Number(process.argv[2] ?? 8);
const SECS = Number(process.argv[3] ?? 60);
const BOUT = (process.argv[4] ?? '1') === '1';
RAPIER.init().then(() => {
  for (const pi of (process.env.P ?? "0,2").split(",").map(Number)) {
    for (let s = 1; s <= SEEDS; s++) {
      const [a, b] = applyPreset(PRESETS[pi]);
      const rules = BOUT ? { roundLen: 180, clock: 3, rounds: 3, tough: 1.6, standing: true } : undefined;
      const sim = new Sim(a, b, s, MAP_BY_ID.ring, rules as never);
      const out = [0, 0];
      let longest = [0, 0], cur = [0, 0];
      const notes: string[] = [];
      while (sim.t < SECS && !sim.winner) {
        const h = sim.stepSize();
        sim.step(h);
        sim.fighters.forEach((f, i) => {
          const p = f.rag.pelvis.body.translation();
          const r = room(sim.map, p.x, p.z, { x: 0, z: 0 });
          if (r < Number(process.env.TH ?? -0.08) && p.y > -0.5) {
            out[i] += h; cur[i] += h;
            if (cur[i] > longest[i]) longest[i] = cur[i];
            if (Math.abs(cur[i] - 2) < h) notes.push(`${f.p.name} t${sim.t.toFixed(0)} state ${f.state} act ${f.action?.kind ?? '-'} y ${p.y.toFixed(2)} room ${r.toFixed(2)}`);
          } else cur[i] = 0;
        });
      }
      console.log(`preset ${pi} seed ${s}: outside ${out.map((x) => x.toFixed(1)).join('/')}s longest ${longest.map((x) => x.toFixed(1)).join('/')}s ${notes.slice(0, 3).join(' | ')}`);
    }
  }
});
