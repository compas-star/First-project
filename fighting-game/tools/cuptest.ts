// The cup of «Подкова» over many weeks: our results, bets, ambushes, the ladder.
// run.sh cuptest [weeks]  (env GROW = our daily stat growth)
import { newCareer, nextDay, rating } from '../src/career';
import { ladder, cup, cupJoin, cupMyMatch, cupFought, cupCountRest, cupBet, cupTonight, ambushFight, ambushDone, ranked, cupPerson } from '../src/clubs';
const WEEKS = Number(process.argv[2] ?? 12);
const c = newCareer();
const f = c.roster[0];
ladder(c).open = true;
for (const k of ladder(c).clubs) console.log(k.name, ranked(k).map((m) => `${m.name.split(' ')[0]} ${rating(m)}`).join(', '));
const log: string[] = [];
let ambushes = 0;
let staked = 0;
const money0 = c.money;
for (let d = 0; d < WEEKS * 7; d++) {
  c.incidents = [];
  c.act1 = undefined;
  if (!cup(c).ours) {
    const r = cupJoin(c, f);
    if (!/запись закрыта|уже/.test(r)) log.push(`д${c.day}: ${r}`);
  }
  const a = ambushFight(c);
  if (a) { ambushes++; ambushDone(c, f, Math.random() < 0.5); }
  const t = cupTonight(c);
  if (t) {
    const cp = cup(c);
    // a $10 bet on the favourite of every other fight
    t.ms.forEach((m, i) => {
      if (m.w || m.a === cp.ours || m.b === cp.ours) return;
      const fav = rating(cupPerson(c, cp, m.a)) >= rating(cupPerson(c, cp, m.b)) ? m.a : m.b;
      if (!cupBet(c, t.r, m === cp.third ? -1 : i, fav, 10).startsWith('Ставка')) return;
      staked += 10;
    });
    const m = cupMyMatch(c);
    if (m) {
      const opp = cupPerson(c, cp, m.a === f.id ? m.b : m.a);
      const won = Math.random() < 1 / (1 + Math.exp((rating(opp) - rating(f)) / 7));
      log.push(`д${c.day} ${['1/8', '1/4', '1/2', 'финал'][t.r]}: ${rating(f)} vs ${opp.name.split(' ')[0]} ${rating(opp)} → ${won ? 'W' : 'L'} ${cupFought(c, f, m, won).slice(1).join(' | ')}`);
    }
    cupCountRest(c);
  }
  for (const s of Object.keys(f.stats) as (keyof typeof f.stats)[]) f.stats[s] = Math.min(f.caps[s], f.stats[s] + Number(process.env.GROW ?? 0.002));
  f.busyUntil = 0;
  c.money = Math.max(c.money, 100);
  nextDay(c, true);
}
console.log(log.join('\n'));
console.log('ambushes', ambushes, 'stage', ladder(c).stage, 'wins', ladder(c).cupWins, 'rating', rating(f), 'staked', staked, 'money', c.money - money0);
console.log(ladder(c).history.slice(0, 6).join('\n'));
