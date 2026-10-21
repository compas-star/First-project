// Stats of the city gangs (act 3) and the championship's men for a fighter of a given rating.
import { newCareer, rating, short, type CareerFighter } from '../src/career';
import { ladder } from '../src/clubs';
import { titanOf } from '../src/act3';
import { heavy } from '../src/story';
const c = newCareer();
c.act3 = { v: 1, start: 1, rob: 0, done: [], seen: [], pending: null, flags: {}, wins: 0, losses: 0, risk: 0, why: [], m: 0 };
const L = ladder(c);
const row = (m: CareerFighter) => `${short(m).padEnd(22)} рейт ${String(rating(m)).padStart(3)} | скор ${m.stats.bodySpeed.toFixed(2)} сила ${m.stats.strength.toFixed(2)} ум ${m.stats.mindSpeed.toFixed(2)} тех ${Math.round(m.stats.skill * 100)}% уклон ${Math.round(m.stats.evasion * 100)}% дых ${m.stats.cardio.toFixed(2)} | ${m.height.toFixed(2)}м ${m.weight}кг`;
for (const k of L.clubs.filter((x) => x.stage >= 2)) {
  console.log(`\n${k.name} (ступень ${k.stage})`);
  for (const m of [...k.members].sort((a, b) => rating(b) - rating(a))) console.log('  ' + row(m));
}
for (const r of [40, 50, 60]) {
  // A fighter of about this rating, then Титан made for him.
  let f = heavy(c.roster[0], 0, 'Наш «Боец» Тест', 'boxing');
  for (let i = 0; i < 200 && Math.abs(rating(f) - r) > 2; i++) f = heavy(c.roster[0], (r - 17) / 67 - 0.3 + Math.random() * 0.6 - 0.3 + 0.3, 'Наш «Боец» Тест', 'boxing');
  c.story = undefined;
  console.log(`\nЕсли твой рейтинг ${rating(f)}: ` + row(titanOf(c, f)));
}
