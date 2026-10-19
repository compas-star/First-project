// The weekly basement tournament over many weeks: our place, prizes, ambushes, the ladder.
// run.sh cuptest [weeks]
import { newCareer, nextDay, rating } from '../src/career';
import { ladder, cup, cupJoin, cupMyMatch, cupFought, ambushFight, ambushDone, ranked } from '../src/clubs';
const WEEKS = Number(process.argv[2] ?? 10);
const c = newCareer();
const f = c.roster[0];
ladder(c).open = true;
for (const k of ladder(c).clubs) console.log(k.name, ranked(k).map((m) => `${m.name.split(' ')[0]} ${rating(m)}`).join(', '));
const places: string[] = [];
let ambushes = 0;
for (let d = 0; d < WEEKS * 7; d++) {
  c.incidents = [];
  c.act1 = undefined;
  if (!cup(c).ours) cupJoin(c, f);
  for (let k = 0; k < 3; k++) {
    const a = ambushFight(c);
    if (a) { ambushes++; ambushDone(c, f, Math.random() < 0.5); }
    const m = cupMyMatch(c);
    if (!m) break;
    const opp = c.ladder!.cup!.entrants.find((x) => x.id === (m.a === f.id ? m.b : m.a))!;
    const won = Math.random() < 1 / (1 + Math.exp((rating(opp) - rating(f)) / 7));
    const lines = cupFought(c, f, m, won);
    if (lines.some((l) => /место|призов|ступень|повержен/.test(l))) places.push(`д${c.day}: ${lines.join(' | ')}`);
  }
  // he trains a bit every day
  for (const s of Object.keys(f.stats) as (keyof typeof f.stats)[]) f.stats[s] = Math.min(f.caps[s], f.stats[s] + Number(process.env.GROW ?? 0.002));
  f.busyUntil = 0;
  c.money = Math.max(c.money, 100);
  const err = nextDay(c, true);
  if (err) console.log('nextDay', err);
}
console.log(places.join('\n'));
console.log('ambushes', ambushes, 'stage', ladder(c).stage, 'wins', ladder(c).cupWins, 'rating', rating(f), 'history', ladder(c).history.slice(0, 3));
