// The city day in the real career code: a simple player for N days (eat, work by need,
// train the rest, sleep). run.sh citytest [days]
import { newCareer, nextDay, INTENSITY, STAT_KEYS, rating } from '../src/career';
import { trainNow, work, eat, rest, JOBS, FOODS, partsLeft, satOf, energyOf, jobClosed, TRAIN_ENERGY } from '../src/city';
const DAYS = Number(process.argv[2] ?? 14);
const c = newCareer();
const f = c.roster[0];
const r0 = rating(f);
const norm = INTENSITY[1];
for (let d = 0; d < DAYS; d++) {
  c.incidents = [];
  const did: string[] = [];
  let guard = 0;
  while (partsLeft(c, f) > 0 && guard++ < 6) {
    if (satOf(f) < 45) { const r = eat(c, f, FOODS[c.money > 60 ? 1 : 0]); did.push(r.text); continue; }
    const need = c.money < 150;
    const job = JOBS.find((j) => !jobClosed(c, f, j) && (j.id !== 'market' || need));
    if (need && job) { did.push(work(c, f, job).text); continue; }
    if (energyOf(f) >= TRAIN_ENERGY.normal) { did.push(trainNow(c, f, STAT_KEYS[d % 6], norm).text); continue; }
    did.push(rest(c, f).text);
  }
  console.log(`д${c.day} $${c.money} сыт ${Math.round(satOf(f))} эн ${Math.round(energyOf(f))} | ${did.join('; ')}`);
  const err = nextDay(c, true);
  if (err) { console.log('nextDay', err); break; }
}
console.log(`рейтинг ${r0} → ${rating(f)}, тонус ${Math.round(f.tonus ?? 0)}, настроение ${f.mood}`);
