// A Thai fighter kicks the same leg again and again: how the leg gives, kick by kick.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { MOVE_BY_ID } from '../src/moves';
import { defaultFighter } from '../src/config';
RAPIER.init().then(() => {
  const a = { ...defaultFighter(0), discipline: 'muaythai' as const, aggression: 0.2 };
  const b = { ...defaultFighter(1), aggression: 0, evasion: 0 };
  const sim = new Sim(a as any, b as any, 7);
  const [A, B] = sim.fighters;
  const stride0 = B.stride;
  let next = 2, kicks = 0, landed = 0, downs = 0, prevState = 'ok';
  sim.lab = { dist: 1.15, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0, hurts: true };
  while (sim.t < 60 && !sim.winner && kicks < 20) {
    sim.step(sim.stepSize());
    for (const ev of sim.events) if (ev.type === 'hit' && ev.target === B && /ног/.test(ev.zone)) {
      landed++;
      console.log(`${sim.t.toFixed(1)} kick ${kicks}: ${ev.blocked ? 'checked' : 'landed'} dmg ${ev.dmg.toFixed(1)} | leg ${(100 * B.limbDmg.rLeg / B.legLimit).toFixed(0)}%/${(100 * B.limbDmg.lLeg / B.legLimit).toFixed(0)}% lame ${Math.max(B.lame('lLeg'), B.lame('rLeg')).toFixed(2)} speed ${(100 * B.stride / stride0).toFixed(0)}% buckle ${B.buckleK.toFixed(2)} "${B.thought}"`);
    }
    sim.events.length = 0;
    if (B.state !== 'ok' && prevState === 'ok') { downs++; console.log(`${sim.t.toFixed(1)} B down: ${B.thought}`); }
    prevState = B.state;
    if (sim.t > next && !A.action && A.state === 'ok' && B.state === 'ok') {
      next = sim.t + 1.6;
      kicks++;
      sim.startAction(A, 'attack', { move: MOVE_BY_ID.lowkick, zone: 'leg', lunge: Math.max(0, A.pos.distanceTo(B.pos) - 1.1) });
    }
  }
  console.log(`kicks ${kicks}, landed ${landed}, B downs ${downs}`);
});
