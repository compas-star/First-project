// The calendar and the bracket without the screen: book, wait for the day, win through or lose early.
import { newCareer, book, startTour, tourFight, settleOthers, current, myMatch, finished, closeTour, roundName, nextDay, waiting, dayName, busy, startTraining, INTENSITY, canBook } from '../src/career';
const win = { won: true, ko: false, reason: '', trauma: 0, body: 0, broken: 0, seconds: 60 };
const lose = { ...win, won: false, reason: 'нокаут', ko: true, trauma: 0.8 };
for (const plan of ['win', 'lose']) {
  const c = newCareer();
  c.money = 10000;
  c.tokens = 1000;
  const f = c.roster[0];
  f.fame = 20;
  const e = c.events.find((x) => x.kind === 'tour' && x.tier === 'club' && x.day > c.day)!;
  console.log(plan, 'book club tour on', e.day, dayName(e.day), book(c, f, e) ?? 'ok', 'money', c.money);
  // Train until the day; training the day before is fine, on the day not.
  while (c.day < e.day) {
    const err = startTraining(c, f, 'bodySpeed', INTENSITY[1]);
    if (err) console.log('  train day', c.day, err);
    nextDay(c);
  }
  console.log('  day', c.day, 'waiting', waiting(c)?.kind, 'train today ->', startTraining(c, f, 'bodySpeed', INTENSITY[0]), '| nextDay ->', nextDay(c));
  console.log('  start', startTour(c, f, e) ?? 'ok', 'size', c.tour!.field.length + 1);
  let guard = 0;
  while (c.tour && !finished(c.tour) && guard++ < 10) {
    const t = c.tour;
    const m = myMatch(t);
    if (m && !m.w) console.log(' ', roundName(current(t).length), tourFight(c, f, plan === 'win' ? win : lose).slice(-1)[0]);
    settleOthers(c);
    if (plan === 'lose') break;
  }
  if (c.tour) console.log(' ', closeTour(c));
  console.log('  ours', f.name, 'ev done', e.done, 'busy', busy(c, f), 'until', f.busyUntil, 'day', c.day, f.busyWhat);
  console.log('  nextDay', nextDay(c) ?? 'ok', 'day', c.day, 'money', c.money, 'tokens', c.tokens, 'record', f.record, 'speed', f.stats.bodySpeed.toFixed(3));
  const n = c.events.find((x) => x.kind === 'night' && x.day >= c.day && x.tier === 'basement')!;
  console.log('  book night', n.day, canBook(c, f, n) ?? 'ok');
}
