// A hook thrown at a man ducking under it: how high does the fist end up?
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { defaultFighter } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import { MOVE_BY_ID } from '../src/moves';
RAPIER.init().then(() => {
  for (const id of ['rhook', 'hook', 'cross']) {
    const sim = new Sim({ ...defaultFighter(0), discipline: 'boxing' }, { ...defaultFighter(1), aggression: 0 }, 5, MAP_BY_ID.dojo);
    sim.lab = { dist: 0.75, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
    while (sim.t < 2.5) sim.step(sim.stepSize());
    const f = sim.fighters[0];
    sim.startAction(f, 'attack', { move: MOVE_BY_ID[id], zone: 'head', lunge: 0 });
    let maxY = 0, sh = 0;
    while (f.action && sim.t < 6) {
      sim.step(sim.stepSize());
      // The dummy ducks as soon as the blow is on its way.
      if (f.action && f.action.t > f.action.dur * 0.25) sim.lab.crouch = 0.28;
      const hand = f.rag.byName[id === 'hook' ? 'lFore' : 'rFore'].body.translation();
      if (hand.y > maxY) { maxY = hand.y; sh = f.rag.byName[id === 'hook' ? 'lUpper' : 'rUpper'].body.translation().y; }
    }
    console.log(`${id}: highest fist ${maxY.toFixed(2)} m (shoulder then ${sh.toFixed(2)}), hits ${sim.labHits.map((h) => h.zone).join(',') || '-'}`);
  }
});
