// Leg kicks in fights: how many land, how hurt the leg gets (share of its limit), what it costs him.
// run.sh legs "2,3" 4 [secs]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '2,3').split(',').map(Number), N = Number(process.argv[3] ?? 4), SECS = Number(process.argv[4] ?? 90);
RAPIER.init().then(() => {
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 17 + pi);
    const legHits = [0, 0];
    const stride0 = sim.fighters.map((f) => f.stride);
    const limps: string[] = [];
    while (!sim.winner && sim.t < SECS) {
      sim.step(sim.stepSize());
      for (const ev of sim.events) if (ev.type === 'hit' && !ev.blocked && /ног/.test(ev.zone)) legHits[ev.target === sim.fighters[0] ? 0 : 1]++;
      sim.events.length = 0;
    }
    const line = sim.fighters.map((f, i) => {
      const worst = Math.max(f.limbDmg.lLeg, f.limbDmg.rLeg) / f.legLimit;
      return `${f.p.name}(${f.p.discipline}) leg hits taken ${legHits[i]}, worst leg ${(100 * worst).toFixed(0)}%${f.broken.lLeg || f.broken.rLeg ? ' BROKEN' : ''}, speed ${(100 * f.stride / stride0[i]).toFixed(0)}%`;
    });
    console.log(`p${pi} s${s} ${sim.t.toFixed(0)}s ${sim.winner ? 'won ' + sim.winner.p.name : 'no winner'} | ${line.join(' | ')}${limps.join('')}`);
    sim.dispose();
  }
});
