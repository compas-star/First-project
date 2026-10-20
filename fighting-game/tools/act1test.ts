// Act 1 played through many times with random choices (fights by a weighted coin):
// which endings come out, and a sample log. run.sh act1test [runs]
import { newCareer, nextDay, rating } from '../src/career';
import { ensureAct1, act1Card, act1Choose, act1FightDone, act1Seen, act1Pay, act, act1Film } from '../src/act1';
const RUNS = Number(process.argv[2] ?? 200);
const ends: Record<string, number> = {};
let sample: string[] = [];
for (let run = 0; run < RUNS; run++) {
  const c = newCareer();
  ensureAct1(c);
  const log: string[] = [];
  for (let d = 0; d < 26; d++) {
    c.incidents = [];
    for (let k = 0; k < 6; k++) {
      const card = act1Card(c);
      if (!card) break;
      if (card.film) { if (!act1Film(c)) log.push('NO FILM ' + card.id); act1Seen(c); }
      const opts = act1Card(c)!.opts.filter((o) => !o.no);
      if (!opts.length) break;
      const o = opts[Math.floor(Math.random() * opts.length)];
      const r = act1Choose(c, o.id);
      log.push(`д${c.day} ${card.id}:${o.id} ${r.lines.join('; ')}`);
      if (r.fight) {
        const f = c.roster[0];
        const won = Math.random() < 1 / (1 + Math.exp((rating(r.fight.opp) - rating(f)) / 8));
        const res = act1FightDone(c, f, r.fight, { won, ko: won, reason: 'нокаут', trauma: 0, body: 0, broken: 0 } as never);
        log.push(`   бой с ${r.fight.opp.name} (${rating(r.fight.opp)} vs ${rating(f)}): ${won ? 'W' : 'L'} ${res.lines.join('; ')}${res.scene ? ' [сцена]' : ''}`);
      }
    }
    if (Math.random() < 0.3) act1Pay(c, 100);
    c.money += 60; // a day's odd jobs, roughly
    for (const f of c.roster) f.busyUntil = Math.min(f.busyUntil, c.day + 1);
    const err = nextDay(c, true);
    if (err) log.push('nextDay ' + err);
  }
  const a = act(c)!;
  const e = a.ending ?? 'none';
  ends[e] = (ends[e] ?? 0) + 1;
  if ((log.some((l) => l.includes('d20'))) || (e === 'none' && sample.length === 0)) sample = log;
}
console.log(ends);
console.log(sample.join('\n'));
