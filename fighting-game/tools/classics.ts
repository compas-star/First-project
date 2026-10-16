// Which built-in combinations survive the filter, and which styles can throw them.
import { CLASSICS } from '../src/combos';
import { DISCIPLINES } from '../src/disciplines';
console.log('classics:', CLASSICS.length);
for (const d of DISCIPLINES) {
  const ok = CLASSICS.filter((c) => c.styles.includes(d.id) && c.steps.every((s) => (d.weights[s.move] ?? 0) > 0));
  console.log(d.id, ok.length, ok.map((c) => c.id).join(' '));
}
