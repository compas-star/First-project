import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { predict, blowKind } from '../src/brain';
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[0]);
  a.mindSpeed = 3; a.linkMind = false;
  const sim = new Sim(a, b, 5);
  const me = sim.fighters[0], e = sim.fighters[1];
  let att = 0, expSet = 0, match = 0, lastId = -1;
  while (!sim.winner && sim.t < 60) {
    sim.step(sim.stepSize());
    sim.events.length = 0;
    const ea = e.action;
    if (ea?.kind === 'attack' && ea.id !== lastId) {
      lastId = ea.id; att++;
      if (me.expect && sim.t < me.expect.untilW) { expSet++; if (me.expect.id === blowKind(ea.move!)) match++; }
    }
  }
  console.log('insight', me.insight.toFixed(2), 'his attacks', att, 'with expectation', expSet, 'matched', match);
  console.log('follow', JSON.stringify(me.mem.follow));
  console.log('answer', JSON.stringify(me.mem.answer));
  for (const k of Object.keys(me.mem.follow)) console.log(k, JSON.stringify(predict(me.mem.follow, k)));
});
