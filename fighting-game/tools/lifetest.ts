// Career life: incidents over many days, answered at random (no bar trips).
import { newCareer, nextDay, makeFighter } from '../src/career';
import { resolve, TRAITS, moodOf } from '../src/life';
const DAYS = Number(process.argv[2] ?? 60);
const c = newCareer();
for (const t of ['drinker', 'hothead', 'lazy', 'ladies', 'star'] as const) { const f = makeFighter(0.05, 0.6); f.traits = [t]; c.roster.push(f); }
const kinds: Record<string, number> = {};
const lines: string[] = [];
for (let d = 0; d < DAYS; d++) {
  c.tokens = 999;
  c.money = 5000;
  c.dayAt = Date.now() - 3 * 60000 - 1;
  for (const i of [...(c.incidents ?? [])]) {
    kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
    const opts = i.opts.filter((o) => o.id !== 'fetch');
    const o = opts[Math.floor(Math.random() * opts.length)];
    const r = resolve(c, i, o.id);
    if (lines.length < 12) lines.push(`д${c.day} ${i.text} → ${o.label}: ${r.lines.join('; ')}`);
  }
  const err = nextDay(c, true);
  if (err) { console.log('nextDay', err); break; }
}
console.log('incidents', JSON.stringify(kinds));
console.log(lines.join('\n'));
for (const f of c.roster) console.log(f.name, (f.traits ?? []).map((t) => TRAITS[t].name).join(', '), 'mood', moodOf(f), f.busyWhat);
