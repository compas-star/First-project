// Shin checks: how often kicks are checked and what it does to the kicker's leg.
// run.sh checks "2,3" [seeds] [secs]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { makeFighter, toParams, TIERS, WCLASSES } from '../src/career';
import { MAP_BY_ID } from '../src/maps';
const which = (process.argv[2] ?? '2,3').split(',').map(Number);
const N = Number(process.argv[3] ?? 3), T = Number(process.argv[4] ?? 60);
RAPIER.init().then(() => {
  for (const pi of which) {
    let kicks = 0, checksUp = 0, checked = 0, lameEnd = 0, n = 0;
    const lameAfter: string[] = [];
    for (let s = 1; s <= N; s++) {
      let sim: Sim;
      if (process.env.TOP) {
        // World title level: two top fighters of a style in a full bout.
        const A = makeFighter(0.95, 0.95, WCLASSES[1]), B = makeFighter(0.95, 0.95, WCLASSES[1]);
        A.discipline = B.discipline = (process.env.TOP as 'muaythai');
        sim = new Sim(toParams(A, 0), toParams(B, 1), s * 7 + 1, MAP_BY_ID.ring, TIERS[5].rules);
      } else {
        const [a, b] = applyPreset(PRESETS[pi]);
        sim = new Sim(a, b, s * 7 + 1);
      }
      const seen = new Set<number>();
      const seq = [0, 0];
      while (!sim.winner && !sim.draw && sim.t < T) {
        if (sim.betweenRounds) sim.nextRound();
        sim.step(sim.stepSize());
        sim.fighters.forEach((f, i) => {
          const a = f.action;
          if (a && !seen.has(a.id)) {
            seen.add(a.id);
            if (a.kind === 'attack' && (a.move!.path === 'low' || a.move!.path === 'round') && !a.feint) kicks++;
            if (a.kind === 'check') checksUp++;
          }
          if (f.thoughtSeq !== seq[i]) {
            seq[i] = f.thoughtSeq;
            if (f.thought.startsWith('чек голенью')) {
              checked++;
              const e = f.enemy;
              lameAfter.push(Math.max(e.lame('lLeg'), e.lame('rLeg')).toFixed(2));
            }
          }
        });
        sim.events.length = 0;
      }
      for (const f of sim.fighters) { lameEnd += Math.max(f.lame('lLeg'), f.lame('rLeg')); n++; }
      sim.dispose();
    }
    console.log(`${process.env.TOP ? 'top ' + process.env.TOP : PRESETS[pi].name}: round/low kicks ${kicks}, checks raised ${checksUp}, kicks checked ${checked}, kicker lame after each check: ${lameAfter.join(' ')}, avg lame at end ${(lameEnd / n).toFixed(2)}`);
  }
});
