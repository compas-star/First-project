// Act 3 played through with random choices (fights by a weighted coin): how often story scenes
// come (user: every 5-6 days on average), when the poster goes up, what Мясник does to Тимоха,
// soft locks, the robbery of rich saves. run.sh act3test [runs]
import { newCareer, nextDay, rating, type Career } from '../src/career';
import { actCard, actChoose, actFightDone, actSeen, actFilm, actCheck, forcedNow } from '../src/acts';
import { act1Pay, callDue, callDone } from '../src/act1';
import { act2Fee } from '../src/act2';
import { act3Buttons, act3Act, act3BrFight, act3Sides, finalDay } from '../src/act3';
import { brCount } from '../src/bracket';
import { ambushFight, ambushDone, ladder } from '../src/clubs';
const RUNS = Number(process.argv[2] ?? 40);
let locks = 0;
const posters: number[] = [];
const kid: Record<string, number> = {};
const gaps: number[] = [];
const robbed = { rich: 0, ok: 0 };
const ends: Record<string, number> = {};
const sides: Record<string, number> = {};
const bkRes: Record<string, number> = {};
let sample: string[] = [];

function fight(c: Career, r: ReturnType<typeof actChoose>, log: string[]): void {
  if (!r.fight) return;
  const f = r.fight.who ?? c.roster[0];
  const won = Math.random() < 1 / (1 + Math.exp((rating(r.fight.opp) - rating(f)) / 8));
  const res = actFightDone(c, f, r.fight, { won, ko: won, reason: 'нокаут', trauma: 0, body: 0, broken: 0 } as never);
  log.push(`   бой «${r.fight.title}» (${rating(r.fight.opp)} vs ${rating(f)}): ${won ? 'W' : 'L'} ${res.lines.join('; ')}`);
}

function play(c: Career, days: number, log: string[], cards: number[]): void {
  for (let d = 0; d < days; d++) {
    c.incidents = [];
    if (c.act1?.ending) ladder(c).stage = Math.max(ladder(c).stage, 2);
    if (callDue(c)) callDone(c);
    actCheck(c);
    for (let k = 0; k < 8; k++) {
      const amb = ambushFight(c);
      if (amb) {
        ambushDone(c, c.roster[0], Math.random() < 0.5);
        continue;
      }
      const card = actCard(c);
      if (!card) break;
      if (card.film) { if (!actFilm(c) && card.id !== 'end') log.push('NO FILM ' + card.id); actSeen(c); }
      const opts = actCard(c)!.opts.filter((o) => !o.no);
      if (!opts.length) {
        if (card.forced) { locks++; log.push(`!!! SOFTLOCK ${card.id}`); }
        break;
      }
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (c.act3?.start && !['t6', 't7', 'l2', 'u3', 'end'].includes(card.id)) cards.push(c.day);
      const r = actChoose(c, o.id);
      if (c.act3) log.push(`д${c.day - (c.act3.start || c.day) + 1} ${card.id}:${o.id} ${r.lines.join('; ')} [риск ${c.act3.risk}]`);
      fight(c, r, log);
    }
    // The goal card's buttons: the ring, «Подземка», a visit to the hospital.
    if (c.act3) for (const w of ['bk', 'ch'] as const) {
      const br = c.act3[w];
      if (!br) continue;
      if (Math.random() < 0.5) brCount(c, br);
      for (let k = 0; k < 2; k++) {
        const ft = act3BrFight(c, w);
        if (!ft) break;
        fight(c, { lines: [], fight: ft }, log);
      }
    }
    if (c.act3) for (const b of act3Buttons(c)) {
      if (b.id.startsWith('br_')) continue;
      if (b.no || Math.random() < (b.id === 'call' ? 0.6 : 0.15)) continue;
      const r = act3Act(c, b.id);
      fight(c, r, log);
      break;
    }
    // Side lines now and then.
    if (c.act3 && Math.random() < 0.35) {
      const sd = act3Sides(c).filter((x) => !x.no);
      if (sd.length) {
        const pick = sd[Math.floor(Math.random() * sd.length)];
        const r = act3Act(c, pick.id);
        sides[pick.id] = (sides[pick.id] ?? 0) + 1;
        if (r.opened) {
          const card = actCard(c);
          if (card) {
            if (card.film) actSeen(c);
            const opts = actCard(c)!.opts.filter((o) => !o.no);
            if (opts.length) {
              const rr = actChoose(c, opts[Math.floor(Math.random() * opts.length)].id);
              log.push(`д${c.day - (c.act3.start || c.day) + 1} side ${card.id}: ${rr.lines.join('; ')}`);
              fight(c, rr, log);
            }
          }
        }
      }
    }
    if (Math.random() < 0.3) act1Pay(c, 100);
    if (c.act2 && Math.random() < 0.2) act2Fee(c);
    c.money += 60;
    for (const f of c.roster) if (f.busyUntil < c.day + 100) f.busyUntil = Math.min(f.busyUntil, c.day + 1);
    for (const f of c.roster) f.energy = 100;
    const fz = forcedNow(c);
    if (fz) log.push(`д${c.day} всё ещё обязательно: ${fz.title}`);
    nextDay(c, true);
  }
}

for (let run = 0; run < RUNS; run++) {
  const c = newCareer();
  const log: string[] = [];
  const cards: number[] = [];
  // Acts 1-2 (as act2test), then act 3.
  for (let d = 0; d < 200 && !(c.act2?.ending && c.act2.done.includes('end')); d++) play(c, 1, [], []);
  if (!c.act2?.done.includes('end')) { log.push('!!! act 2 not over'); continue; }
  if (run % 2) c.money = 9000;
  // A trained fighter (the test does not train): every quality at his cap.
  if (run % 4 < 2) for (const f of c.roster) for (const k of Object.keys(f.stats) as (keyof typeof f.stats)[]) f.stats[k] = f.caps[k];
  const day0 = c.day;
  play(c, 2, log, cards);
  if (!c.act3) { console.log('no act 3'); continue; }
  if (c.act3.rob) robbed.rich++;
  play(c, 150, log, cards);
  const a = c.act3;
  ends[a.ending ?? 'running'] = (ends[a.ending ?? 'running'] ?? 0) + 1;
  bkRes[a.flags.bkWon ? 'won' : a.bk?.ours ? 'played' : 'skipped'] = (bkRes[a.flags.bkWon ? 'won' : a.bk?.ours ? 'played' : 'skipped'] ?? 0) + 1;
  if (a.m && !a.ending) log.push(`!!! no ending: day ${c.day}, final ${finalDay(a)}, pending ${a.pending}`);
  if (run % 2 && a.flags.robbed && c.money < 9000) robbed.ok++;
  const start = a.flags.cityDay ?? a.start;
  if (a.m) posters.push(a.m - start + 1);
  else log.push(`!!! no poster after ${c.day - day0} days (wins ${a.wins})`);
  const k = a.flags.kidGone ? 'уехал' : a.flags.cutman ? 'катмен (колено)' : a.flags.kidHurt ? ['', 'нос', 'рука', 'колено'][a.flags.kidHurt] : 'цел';
  kid[k] = (kid[k] ?? 0) + 1;
  const main = cards.filter((d) => d >= start && (!a.m || d <= finalDay(a)));
  for (let i = 1; i < main.length; i++) gaps.push(main[i] - main[i - 1]);
  if (run === 0 || log.some((l) => l.startsWith('!!!'))) sample = log;
}
const avg = (x: number[]) => (x.reduce((s, v) => s + v, 0) / Math.max(1, x.length)).toFixed(1);
console.log('softlocks', locks, '| rich saves robbed', robbed);
console.log('poster on act day: avg', avg(posters), 'min', Math.min(...posters), 'max', Math.max(...posters));
console.log('Тимоха:', kid);
console.log('endings', ends, '| Кубок Бархата', bkRes);
console.log('side actions', sides);
console.log('days between story scenes: avg', avg(gaps), 'min', Math.min(...gaps), '| scenes counted', gaps.length + RUNS);
console.log(sample.slice(-60).join('\n'));
