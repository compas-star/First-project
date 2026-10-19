// Story lines over many days: which chapters open when, choices taken at random, story
// fights settled by a coin flip weighted by rating. run.sh storytest [days]
import { newCareer, nextDay, rating } from '../src/career';
import { pendingChapter, storyChoose, storyFightDone, story } from '../src/story';
const DAYS = Number(process.argv[2] ?? 90);
const c = newCareer();
const f0 = c.roster[0];
for (let d = 0; d < DAYS; d++) {
  c.tokens = 999;
  c.money = Math.max(c.money, 2000);
  f0.fame += 1;
  c.dayAt = Date.now() - 3 * 60000 - 1;
  for (const i of [...(c.incidents ?? [])]) c.incidents = c.incidents!.filter((x) => x !== i);
  const ch = pendingChapter(c);
  if (ch) {
    const opts = ch.opts.filter((o) => !o.no);
    const o = opts[0] ?? ch.opts[0];
    const out = storyChoose(c, o.id);
    let res = out.lines.join('; ');
    if (out.fight) {
      const f = c.roster.find((x) => x.id === c.pick) ?? c.roster[0];
      const won = Math.random() < 1 / (1 + Math.exp((rating(out.fight.opp) - rating(f)) / 8));
      res += ` [бой с ${out.fight.opp.name}: ${won ? 'победа' : 'поражение'}] ` + storyFightDone(c, f, out.fight, { won, ko: false, reason: 'решение', trauma: 0, body: 0, broken: 0 } as never).join('; ');
    }
    console.log(`д${c.day} ${ch.lineName} «${ch.title}» → ${o.label}: ${res}`);
  }
  for (const f of c.roster) { f.busyUntil = Math.min(f.busyUntil, c.day); }
  const err = nextDay(c, true);
  if (err && err !== 'fight' && err !== 'tour') { console.log('nextDay', err); break; }
  if (err) { for (const e of c.events) if (e.day === c.day) e.done = true; nextDay(c, true); }
}
console.log('done', story(c).done.join(','), 'money', c.money, 'roster', c.roster.length);
