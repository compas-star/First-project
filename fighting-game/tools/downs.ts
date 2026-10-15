// Why fighters go down: counts knockdowns per reason per fight.
// run.sh downs "presetIdx,..." N
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[3] ?? 4);
const which = process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 1, 2, 3];
RAPIER.init().then(() => {
  for (const pi of which) {
    const stat: Record<string, number> = {};
    let total = 0, time = 0, downT = 0;
    for (let s = 1; s <= N; s++) {
      const [a, b] = applyPreset(PRESETS[pi]);
      const sim = new Sim(a, b, s * 13 + 5);
      const kd = (sim as any).knockDown.bind(sim);
      let lastHit = [-9, -9];
      (sim as any).knockDown = (f: any, why: string, ...rest: any[]) => {
        if (f.state === 'ok') {
          const recent = sim.t - lastHit[f.team] < 0.6 ? 'после удара' : 'сам';
          const act = f.action?.kind === 'attack' ? 'бил ' + f.action.move.id : f.action?.kind ?? '-';
          const k = `${why || 'вылет'} | ${recent} | ${act}`;
          stat[k] = (stat[k] ?? 0) + 1; total++;
        }
        return kd(f, why, ...rest);
      };
      while (!sim.winner && sim.t < 60) {
        sim.step(sim.stepSize());
        for (const e of sim.events) if (e.type === 'hit') lastHit[(e as any).target.team] = sim.t;
        sim.events.length = 0;
        for (const f of sim.fighters) if (f.state !== 'ok') downT += sim.stepSize();
      }
      time += sim.t;
      sim.dispose();
    }
    console.log(`${PRESETS[pi].name}: падений ${total} за ${time.toFixed(0)}с боя (${(total / time * 60).toFixed(1)}/мин), на полу ${(downT / time * 50).toFixed(0)}% времени (на бойца)`);
    for (const [k, v] of Object.entries(stat).sort((x, y) => y[1] - x[1])) console.log('   ', v, k);
  }
});
