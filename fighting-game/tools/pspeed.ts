// Fastest body parts per fighter state: run.sh pspeed "0,2" 3
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
const which = (process.argv[2] ?? '0').split(',').map(Number), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  const top: Record<string, number> = {};
  let over = 0, samples = 0;
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 71, MAP_BY_ID[PRESETS[pi].map]);
    while (!sim.winner && sim.t < 90) {
      sim.step(sim.stepSize());
      for (const f of sim.fighters) for (const p of f.rag.parts) {
        const v = p.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
        const k = `${f.state}${f.state === 'ok' ? ':' + (f.action?.kind ?? 'idle') : ''} ${p.name}`;
        samples++; if (sp > 20) over++;
        if (sp > (top[k] ?? 0)) top[k] = sp;
      }
      sim.events.length = 0;
    }
    sim.dispose();
  }
  console.log(Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('\n'));
  console.log(`samples over 20 m/s: ${(1e6 * over / samples).toFixed(1)} per million`);
});
