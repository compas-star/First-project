// After a ground exchange, how long until the fighters collide with each other again.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
RAPIER.init().then(() => {
  for (let s = 1; s <= 4; s++) {
    const [a, b] = applyPreset(PRESETS[0]);
    const sim = new Sim(a, b, s) as unknown as Sim & { startGrapple: Function; endGrapple: Function; contactOff: boolean };
    while (sim.t < 3) sim.step(sim.stepSize());
    sim.startGrapple(sim.fighters[0], sim.fighters[1], 'mount', '');
    while (sim.t < 6) sim.step(sim.stepSize());
    if (sim.grapple) sim.endGrapple('');
    const t0 = sim.t;
    while (sim.contactOff && sim.t < t0 + 30) sim.step(sim.stepSize());
    console.log(`seed ${s}: contact back after ${(sim.t - t0).toFixed(1)}s ${sim.contactOff ? '(never)' : ''}`);
  }
});
