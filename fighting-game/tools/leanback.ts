// Leaning back from head shots and firing back: how often, with what, how it ends.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  let leans = 0, leanHit = 0, ctr = 0, falls = 0;
  const fate: Record<string, Record<string, number>> = {};
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 31 + pi);
    const seenLean = new Set<number>();
    const cur: ({ id: number; m: string; got: string } | null)[] = [null, null];
    while (!sim.winner && sim.t < 60) {
      sim.step(sim.stepSize());
      for (const ev of sim.events) if (ev.type === 'hit') {
        const def = ev.target === sim.fighters[0] ? 0 : 1;
        const c = cur[1 - def];
        if (c && !c.got) c.got = ev.blocked ? 'blocked' : 'clean';
        const da = sim.fighters[def].action;
        if (da?.kind === 'dodge' && da.lean && !ev.blocked) leanHit++;
      }
      sim.events.length = 0;
      sim.fighters.forEach((f, i) => {
        const act = f.action;
        if (act?.kind === 'dodge' && act.lean && !seenLean.has(act.id)) { seenLean.add(act.id); leans++; }
        const c = cur[i];
        if (c && (!act || act.id !== c.id)) {
          const g = c.got || (f.state !== 'ok' ? 'fell' : 'miss');
          if (g === 'fell') { falls++; console.log('fell', pi, s, sim.t.toFixed(2), i, f.state, f.thought, c.m); }
          (fate[c.m] ??= {})[g] = (fate[c.m][g] ?? 0) + 1;
          cur[i] = null;
        }
        if (act?.kind === 'attack' && !cur[i] && f.thought.startsWith('отклон →')) { ctr++; cur[i] = { id: act.id, m: act.move!.id, got: '' }; }
      });
    }
    sim.dispose();
  }
  console.log('lean-backs', leans, 'hit while leaning', leanHit, 'counters', ctr, 'counter-kicker fell', falls);
  for (const [m, r] of Object.entries(fate)) console.log(' ', m.padEnd(10), JSON.stringify(r));
});
