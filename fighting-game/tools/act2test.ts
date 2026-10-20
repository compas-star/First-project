// Acts 1 and 2 played through with random choices (fights by a weighted coin): endings of
// act 2, soft locks (a forced card with no open choice), and the old-save case (act 1 over
// long ago, the tester's save). run.sh act2test [runs]
import { newCareer, nextDay, rating, type Career } from '../src/career';
import { actCard, actChoose, actFightDone, actSeen, actFilm, actCheck, forcedNow } from '../src/acts';
import { act1Pay, callDue, callDone } from '../src/act1';
import { act2Fee, inSewer } from '../src/act2';
import { ambushFight, ambushDone, ladder } from '../src/clubs';
const RUNS = Number(process.argv[2] ?? 100);
const ends: Record<string, number> = {};
let locks = 0;
let sample: string[] = [];

function play(c: Career, days: number, log: string[]): void {
  for (let d = 0; d < days; d++) {
    c.incidents = [];
    // The cup of «Подкова» is not played here: count it as won once act 1 is over.
    if (c.act1?.ending) ladder(c).stage = Math.max(ladder(c).stage, 2);
    if (callDue(c)) callDone(c);
    actCheck(c);
    for (let k = 0; k < 6; k++) {
      const amb = ambushFight(c);
      if (amb) {
        ambushDone(c, c.roster[0], Math.random() < 0.5);
        log.push(`д${c.day} засада`);
        continue;
      }
      const card = actCard(c);
      if (!card) break;
      if (card.film) { if (!actFilm(c)) log.push('NO FILM ' + card.id); actSeen(c); }
      const opts = actCard(c)!.opts.filter((o) => !o.no);
      if (!opts.length) {
        if (card.forced) { locks++; log.push(`!!! SOFTLOCK ${card.id}`); }
        break;
      }
      const o = opts[Math.floor(Math.random() * opts.length)];
      const r = actChoose(c, o.id);
      log.push(`д${c.day} ${card.id}:${o.id} ${r.lines.join("; ")} [done ${c.act2?.done.join(",")} p=${c.act2?.pending}]`);
      if (r.fight) {
        const f = r.fight.who ?? c.roster[0];
        const won = Math.random() < 1 / (1 + Math.exp((rating(r.fight.opp) - rating(f)) / 8));
        const res = actFightDone(c, f, r.fight, { won, ko: won, reason: 'нокаут', trauma: 0, body: 0, broken: 0 } as never);
        log.push(`   бой ${r.fight.tier.rules.rounds}р с ${r.fight.opp.name} (${rating(r.fight.opp)} vs ${rating(f)}): ${won ? 'W' : 'L'} ${res.lines.join('; ')}`);
      }
    }
    if (Math.random() < 0.3) act1Pay(c, 100);
    if (c.act2 && Math.random() < 0.2) act2Fee(c);
    c.money += 60;
    for (const f of c.roster) f.busyUntil = Math.min(f.busyUntil, c.day + 1);
    const fz = forcedNow(c);
    if (fz) log.push(`д${c.day} всё ещё обязательно: ${fz.title}`);
    nextDay(c, true);
  }
}

for (let run = 0; run < RUNS; run++) {
  const c = newCareer();
  const log: string[] = [];
  play(c, 60, log);
  const e = c.act2?.ending ?? (c.act2 ? 'running' : 'no act2');
  ends[e] = (ends[e] ?? 0) + 1;
  if (inSewer(c) !== (e === 'final' || e === 'out')) log.push('!!! sewer flag wrong');
  if (run === 0 || log.some((l) => l.startsWith('!!!'))) sample = log;
}
console.log('act 2 endings', ends, 'softlocks', locks);

// The tester: act 1 ended ~2 months ago and its last card may still be open.
let ok = 0;
for (let run = 0; run < 30; run++) {
  const c = newCareer();
  const log: string[] = [];
  play(c, 24, log);
  for (let d = 0; d < 40; d++) { c.act2 = undefined; nextDay(c, true); c.act2 = undefined; }
  // Old saves had no act2: strip it and leave the end card pending half the time.
  delete c.act2;
  if (run % 2 && c.act1) { c.act1.done = c.act1.done.filter((x) => x !== 'end'); c.act1.pending = 'end'; }
  const day0 = c.day;
  play(c, 40, log);
  if (c.act2 && c.act2.start >= day0) ok++;
  else console.log('old save did not start act 2', c.act1?.ending, c.act1?.pending, log.slice(-5));
}
console.log('old saves into act 2:', ok, '/ 30');
console.log(sample.filter((l) => /t[123]|tfix|бой 3р|бой 5р|s8|end/.test(l)).join('\n'));
