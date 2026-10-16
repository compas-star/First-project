// Kicks at a standing dummy in the lab: where they land from each distance.
// run.sh kicklab bodykick,headkick,leadkick,lowkick
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import { MOVE_BY_ID } from '../src/moves';
const ids = (process.argv[2] ?? 'bodykick,headkick,leadkick,lowkick').split(',');
RAPIER.init().then(() => {
  for (const id of ids) {
    const row: string[] = [];
    let maxV = 0, falls = 0;
    for (const d of [0.9, 1.1, 1.3, 1.5]) {
      const sim = new Sim({ ...defaultFighter(0), discipline: 'muaythai', skill: 0.8 }, { ...defaultFighter(1), aggression: 0 }, 7, MAP_BY_ID.dojo);
      sim.lab = { dist: d, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
      while (sim.t < 2.5) sim.step(sim.stepSize());
      const f = sim.fighters[0];
      const res: string[] = [];
      for (let k = 0; k < 3; k++) {
        const m = MOVE_BY_ID[id];
        const dist = f.pos.distanceTo(f.enemy.pos);
        const r = sim.attackRange(f, m);
        const lunge = Math.max(m.lunge * f.scale, Math.min(dist - r * 0.85 + 0.05, dist - f.radius - f.enemy.radius - 0.1));
        const n0 = sim.labHits.length;
        sim.startAction(f, 'attack', { move: m, zone: m.zones[0], lunge });
        const t0 = sim.t;
        while ((f.action || sim.t < t0 + 0.1) && sim.t < t0 + 4) {
          sim.step(sim.stepSize());
          for (const p of f.rag.parts) { const v = p.body.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
        }
        if (f.state !== 'ok') falls++;
        const h = sim.labHits.slice(n0).map((x) => x.zone).join('+');
        res.push(h || '-');
        const t1 = sim.t; while (sim.t < t1 + 1.2) sim.step(sim.stepSize());
      }
      row.push(`${d}: ${res.join(' ')}`);
      sim.dispose();
    }
    console.log(`${id.padEnd(9)} ${row.join(' | ')} | max part ${maxV.toFixed(1)} falls ${falls}`);
  }
});
