// Looking ahead (mind = depth): a quick-minded fighter against an equal body, with the
// look-ahead on and off. Reads (blows he waited for), traps, clean hits each way, wins.
// tools/run.sh look [mindSpeed=3] [fights=12] [preset=0]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, QUICK } from '../src/sim';
import { MAP_BY_ID } from '../src/maps';
import { PRESETS, applyPreset } from '../src/config';
import { fadeMemory, type Memory } from '../src/brain';
const MIND = Number(process.argv[2] ?? 3), N = Number(process.argv[3] ?? 12), PRE = Number(process.argv[4] ?? 0);
const SEED = Number(process.argv[5] ?? 0), MODES = (process.argv[6] ?? 'off,on').split(',');
RAPIER.init().then(() => {
  for (const mode of MODES) {
    const off = mode === 'off';
    (globalThis as { __noLook?: boolean }).__noLook = off;
    (globalThis as { __look?: Record<string, boolean> }).__look = { [mode]: true };
    // Memory carries from fight to fight against the same man, as in the game.
    let past: [Memory | null, Memory | null] = [null, null];
    const ends: Record<string, number> = {};
    let dmgTo = 0, dmgFrom = 0, windT = 0, dodges = 0, intoN = 0, frames = 0;
    let wins = 0, losses = 0, reads = 0, traps = 0, cleanTo = 0, cleanFrom = 0, readHit = 0, secs = 0;
    for (let s = 1; s <= N; s++) {
      const [a, b] = applyPreset(PRESETS[PRE]);
      const smart = s % 2;
      const p = [a, b][smart];
      p.mindSpeed = MIND;
      p.linkMind = false;
      p.name = 'Умный';
      // Stand-up only, on the open floor: fewer accidents of the ground game and the edges.
      const sim = new Sim(a, b, s * 17 + SEED * 1000, MAP_BY_ID.void, { ...QUICK, standing: true });
      const me = sim.fighters[smart];
      const other = sim.fighters[1 - smart];
      if (past[0]) me.mem = fadeMemory(past[0]);
      if (past[1]) other.mem = fadeMemory(past[1]);
      let lastThought = '';
      let readId = -1;
      while (!sim.winner && sim.t < 90) {
        sim.step(sim.stepSize());
        for (const ev of sim.events) if (ev.type === 'hit' && !ev.blocked && ev.zone !== 'в руку') {
          if (ev.target === me) { cleanFrom++; dmgFrom += ev.dmg; if (me.action?.id === readId) readHit++; } else { cleanTo++; dmgTo += ev.dmg; }
        }
        sim.events.length = 0;
        frames++;
        if (me.winded) windT++;
        if (me.action?.kind === 'dodge' && me.action.t === 0) { dodges++; if (me.action.into) intoN++; }
        if (me.thought !== lastThought) {
          lastThought = me.thought;
          if (me.thought.startsWith('ждал')) { reads++; readId = me.action?.id ?? -1; }
          if (me.thought.startsWith('ловушка')) traps++;
        }
      }
      past = [fadeMemory(me.mem, 1), fadeMemory(other.mem, 1)];
      secs += sim.t;
      if (sim.winner === me) wins++; else if (sim.winner) losses++;
      const loser = sim.winner ? sim.winner.enemy : null;
      if (loser) { const key = (loser === me ? 'умный: ' : 'он: ') + (loser.koReason || '?'); ends[key] = (ends[key] ?? 0) + 1; }
      sim.dispose();
    }
    console.log(`${mode.padEnd(8)} mind x${MIND}: wins ${wins} losses ${losses} | clean hits landed ${cleanTo} taken ${cleanFrom} | reads ${reads} (hit anyway ${readHit}) traps ${traps} | avg ${(secs / N).toFixed(0)}s`);
    console.log(`   dmg dealt ${dmgTo.toFixed(0)} taken ${dmgFrom.toFixed(0)} | winded ${(100 * windT / frames).toFixed(0)}% | dodges ${dodges} into ${intoN}`);
    console.log('   ', JSON.stringify(ends));
  }
});
