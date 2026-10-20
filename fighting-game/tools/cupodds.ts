// Calibrates the cup's odds on real fights: plays whole cups of «Подкова» on the engine (every
// fight simulated, rounds as in the cup), records rating and weight differences and who won.
// run.sh cupodds [cups] [stage] [seed0] > out.json   (stage 1 = basement clubs, 2 = district)
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { MAP_BY_ID } from '../src/maps';
import { newCareer, rating, toParams, type CareerFighter } from '../src/career';
import { ladder, cup, cupTier, cupAdvance, cupResult, cupPerson, CUP_NIGHTS, nightDay, clubOf } from '../src/clubs';

const CUPS = Number(process.argv[2] ?? 3);
const STAGE = Number(process.argv[3] ?? 1);
const SEED0 = Number(process.argv[4] ?? 1);

function fight(a: CareerFighter, b: CareerFighter, r: number, seed: number): { aWon: number; how: string } {
  const sim = new Sim(toParams(a, 0), toParams(b, 1), seed, MAP_BY_ID.void, cupTier(r).rules);
  while (!sim.winner && !sim.draw && sim.t < 400) {
    if (sim.betweenRounds) sim.nextRound();
    sim.step(sim.stepSize());
    sim.events.length = 0;
  }
  const res = sim.winner ? { aWon: sim.winner.team === 0 ? 1 : 0, how: sim.winner.enemy.koReason ?? '' } : { aWon: 0.5, how: 'draw' };
  sim.dispose();
  return res;
}

RAPIER.init().then(() => {
  const rows: { dr: number; dw: number; ra: number; rb: number; a: string; b: string; r: number; aWon: number; how: string }[] = [];
  const champs: string[] = [];
  let seed = SEED0 * 1000;
  for (let n = 0; n < CUPS; n++) {
    const c = newCareer();
    const L = ladder(c);
    L.open = true;
    if (STAGE >= 2) L.stage = 2;
    const cp = cup(c);
    for (let r = 0; r < CUP_NIGHTS; r++) {
      c.day = nightDay(cp, r);
      cupAdvance(c);
      const ms = [...cp.rounds[r], ...(r === CUP_NIGHTS - 1 && cp.third ? [cp.third] : [])];
      for (const m of ms) {
        const A = cupPerson(c, cp, m.a), B = cupPerson(c, cp, m.b);
        const res = fight(A, B, m === cp.third ? 2 : r, ++seed);
        const w = res.aWon === 0.5 ? (Math.random() < 0.5 ? m.a : m.b) : res.aWon ? m.a : m.b;
        rows.push({ dr: rating(A) - rating(B), dw: A.weight - B.weight, ra: rating(A), rb: rating(B), a: `${A.name.split(' ')[0]} (${clubOf(c, A.id)?.name ?? '—'})`, b: `${B.name.split(' ')[0]} (${clubOf(c, B.id)?.name ?? '—'})`, r, aWon: res.aWon, how: res.how });
        cupResult(c, m, w);
        console.error(`cup ${n + 1} r${r} ${rows[rows.length - 1].a} ${rating(A)} vs ${rows[rows.length - 1].b} ${rating(B)} -> ${res.aWon} ${res.how}`);
      }
    }
    const fin = cp.rounds[CUP_NIGHTS - 1][0];
    champs.push(cupPerson(c, cp, fin.w!).name);
  }
  console.log(JSON.stringify({ rows, champs }));
});
