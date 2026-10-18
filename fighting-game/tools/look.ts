// Looking ahead (mind = depth): a quick-minded fighter against an equal body, with the
// look-ahead on and off. Reads (blows he waited for), traps, clean hits each way, wins.
// tools/run.sh look [mindSpeed=3] [fights=12] [preset=0]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { fadeMemory, type Memory } from '../src/brain';
const MIND = Number(process.argv[2] ?? 3), N = Number(process.argv[3] ?? 12), PRE = Number(process.argv[4] ?? 0);
RAPIER.init().then(() => {
  for (const off of [true, false]) {
    (globalThis as { __noLook?: boolean }).__noLook = off;
    // Memory carries from fight to fight against the same man, as in the game.
    let past: [Memory | null, Memory | null] = [null, null];
    let wins = 0, losses = 0, reads = 0, traps = 0, cleanTo = 0, cleanFrom = 0, readHit = 0, secs = 0;
    for (let s = 1; s <= N; s++) {
      const [a, b] = applyPreset(PRESETS[PRE]);
      const smart = s % 2;
      const p = [a, b][smart];
      p.mindSpeed = MIND;
      p.linkMind = false;
      p.name = 'Умный';
      const sim = new Sim(a, b, s * 17);
      const me = sim.fighters[smart];
      const other = sim.fighters[1 - smart];
      if (past[0]) me.mem = fadeMemory(past[0]);
      if (past[1]) other.mem = fadeMemory(past[1]);
      let lastThought = '';
      let readId = -1;
      while (!sim.winner && sim.t < 90) {
        sim.step(sim.stepSize());
        for (const ev of sim.events) if (ev.type === 'hit' && !ev.blocked && ev.zone !== 'в руку') {
          if (ev.target === me) { cleanFrom++; if (me.action?.id === readId) readHit++; } else cleanTo++;
        }
        sim.events.length = 0;
        if (me.thought !== lastThought) {
          lastThought = me.thought;
          if (me.thought.startsWith('ждал')) { reads++; readId = me.action?.id ?? -1; }
          if (me.thought.startsWith('ловушка')) traps++;
        }
      }
      past = [fadeMemory(me.mem, 1), fadeMemory(other.mem, 1)];
      secs += sim.t;
      if (sim.winner === me) wins++; else if (sim.winner) losses++;
      sim.dispose();
    }
    console.log(`${off ? 'OFF' : 'ON '} mind x${MIND}: wins ${wins} losses ${losses} | clean hits landed ${cleanTo} taken ${cleanFrom} | reads ${reads} (hit anyway ${readHit}) traps ${traps} | avg ${(secs / N).toFixed(0)}s`);
  }
});
