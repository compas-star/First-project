// A full bout headless: per round the state of both fighters, then how it ended.
// run.sh bout <presetIdx> <rounds> [seed]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, bout, type Limb } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
const pi = Number(process.argv[2] ?? 0), R = Number(process.argv[3] ?? 7), seed = Number(process.argv[4] ?? 1);
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[pi]);
  const sim = new Sim(a, b, seed, MAP_BY_ID[PRESETS[pi].map], bout(R));
  const hits = [0, 0];
  const t0 = Date.now();
  let lastRound = 0;
  while (!sim.winner && !sim.draw) {
    if (sim.betweenRounds) sim.nextRound();
    sim.step(sim.stepSize());
    for (const e of sim.events) if (e.type === 'hit' && !e.blocked) hits[1 - e.target.team]++;
    sim.events.length = 0;
    if (sim.cards.length !== lastRound) {
      lastRound = sim.cards.length;
      const st = sim.fighters.map((f) => `daze ${f.daze.toFixed(2)} wind ${f.stamina.toFixed(2)} wear ${f.wear.toFixed(2)} trauma ${f.trauma.toFixed(2)} body ${f.bodyHurt.toFixed(2)} kd ${f.knockdowns} broken ${(Object.keys(f.broken) as Limb[]).filter((l) => f.broken[l]).join(',') || '-'}`);
      console.log(`R${lastRound} card ${sim.cards[lastRound - 1].join('-')} hits ${hits.join('/')} | ${st.join(' || ')}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }
  console.log(sim.winner ? `winner ${sim.winner.team ? 'B' : 'R'} at round ${sim.round} ${(sim.roundT / 60).toFixed(1)}min: ${sim.winner.enemy.koReason}` : 'draw', 'score', sim.score().join('-'));
});
