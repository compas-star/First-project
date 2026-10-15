// How fights end under the condition model: duration, reason, knockdowns, condition of both at the end.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
const N = Number(process.argv[3] ?? 6);
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number);
RAPIER.init().then(() => {
  for (const pi of which) {
    const rows: string[] = [];
    for (let s = 1; s <= N; s++) {
      const [a, b] = applyPreset(PRESETS[pi]);
      const sim = new Sim(a, b, s * 61 + pi + Number(process.env.OFF ?? 0), MAP_BY_ID[(process.env.MAP ?? PRESETS[pi].map) as 'ring']);
      let minRoom = 9;
      let maxDaze = [0, 0], livers = 0;
      while (!sim.winner && sim.t < 90) {
        sim.step(sim.stepSize());
        sim.fighters.forEach((f, i) => { maxDaze[i] = Math.max(maxDaze[i], f.daze); minRoom = Math.min(minRoom, require('../src/maps').room(sim.map, f.pos.x, f.pos.z, { x: 0, z: 0 })); });
        for (const e of sim.events) if (e.type === 'liver') livers++;
        sim.events.length = 0;
      }
      const L = sim.winner?.enemy;
      rows.push(`[${sim.map.id} minRoom ${minRoom.toFixed(2)}] ${sim.t.toFixed(0)}s ${sim.winner ? (sim.winner.team ? 'B' : 'R') + ' by ' + L!.koReason : 'draw'} | kd ${sim.fighters.map((f) => f.knockdowns).join('/')} liver ${livers} | maxDaze ${maxDaze.map((x) => x.toFixed(2)).join('/')} trauma ${sim.fighters.map((f) => f.trauma.toFixed(2)).join('/')} body ${sim.fighters.map((f) => f.bodyHurt.toFixed(2)).join('/')}`);
      sim.dispose();
    }
    console.log(PRESETS[pi].name); console.log('  ' + rows.join('\n  '));
  }
});
