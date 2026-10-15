// Offline training of a style's school habits.
// run.sh evolve <discipline> <rounds> [pairs] [fights] [out.json]
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import { defaultFighter, type FighterParams } from '../src/config';
import { DISCIPLINES, type DisciplineId } from '../src/disciplines';
import { train, evaluate } from '../src/train';
import { schoolGenome, describeGenome, genesFor } from '../src/genome';

const disc = process.argv[2] as DisciplineId;
const rounds = Number(process.argv[3] ?? 10);
const pairs = Number(process.argv[4] ?? 6);
const fights = Number(process.argv[5] ?? 3);
const out = process.argv[6];
const maxT = 60;

function fighter(team: 0 | 1, d: DisciplineId, extra: Partial<FighterParams> = {}): FighterParams {
  return { ...defaultFighter(team), discipline: d, skill: d === 'street' ? 0.3 : 0.8, aggression: 0.6, ...extra };
}

RAPIER.init().then(() => {
  const me = fighter(0, disc);
  const opps: FighterParams[] = DISCIPLINES.map((d) => fighter(1, d.id, { genome: schoolGenome(d.id) }));
  opps.push(fighter(1, 'mma', { weight: 92, height: 1.88, genome: schoolGenome('mma') }));
  opps.push(fighter(1, 'kickboxing', { weight: 68, height: 1.74, aggression: 0.8, genome: schoolGenome('kickboxing') }));
  const t0 = Date.now();
  const it = train(me, opps, schoolGenome(disc), { pairs, fights, rounds, maxT, lr: 1, seed: 12345, keys: genesFor(disc) });
  let res = it.next();
  let lastRound = -1;
  while (!res.done) {
    const p = res.value;
    if (p.round !== lastRound && p.form !== null) {
      lastRound = p.round;
      console.log(`${disc} round ${p.round}/${rounds} form ${p.form.toFixed(2)} wins ${(100 * p.winRate!).toFixed(0)}% ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    res = it.next();
  }
  const g = res.value;
  // Honest check on fresh seeds: trained habits vs the school's starting ones.
  const seeds = Array.from({ length: opps.length * 5 }, (_, i) => 900000 + i * 7919);
  const run = (gen: typeof g) => {
    const e = evaluate({ ...me, genome: gen }, opps, seeds, maxT);
    let r = e.next();
    while (!r.done) r = e.next();
    return r.value;
  };
  const before = run(schoolGenome(disc));
  const after = run(g);
  console.log(`${disc} check: before score ${before.score.toFixed(2)} wins ${before.wins}/${seeds.length}, after ${after.score.toFixed(2)} wins ${after.wins}/${seeds.length}`);
  console.log(`${disc} habits: ${describeGenome(g, schoolGenome(disc), disc).join('; ')}`);
  if (out) writeFileSync(out, JSON.stringify({ disc, genome: g, before, after }, null, 1));
});
