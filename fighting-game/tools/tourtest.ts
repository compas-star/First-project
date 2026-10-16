// The bracket logic without the screen: win through, and lose early.
import { newCareer, enterTour, tourFight, settleOthers, current, myMatch, finished, closeTour, roundName, TIERS } from '../src/career';
const win = { won: true, ko: false, reason: '', trauma: 0, body: 0, broken: 0, seconds: 60 };
const lose = { ...win, won: false, reason: 'нокаут' };
for (const plan of ['win', 'lose']) {
  const c = newCareer();
  c.money = 10000;
  const f = c.roster[0];
  f.fame = 999;
  console.log(plan, enterTour(c, f, TIERS[2]) ?? 'ok', 'size', c.tour!.field.length + 1);
  let guard = 0;
  while (c.tour && !finished(c.tour) && guard++ < 10) {
    const t = c.tour;
    const name = roundName(current(t).length);
    const m = myMatch(t);
    if (m && !m.w) {
      console.log(' ', name, tourFight(c, f, plan === 'win' ? win : lose).slice(-1)[0]);
      f.busyUntil = 0;
    }
    settleOthers(c);
    if (plan === 'lose' && !finished(t)) { console.log(' ', closeTour(c)); break; }
  }
  if (c.tour && finished(c.tour)) console.log(' ', closeTour(c));
  console.log('  money', c.money, 'tokens', c.tokens, 'record', f.record);
}
