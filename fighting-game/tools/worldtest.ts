// The fight world without the screen: days pass, rankings, the belt, bad blood.
import { newCareer, tick, rankings, rating, short, DAY_MS, rivalsOf, recordBout, titleBout, rankOf, WCLASSES, classOf, isChamp } from '../src/career';
const c = newCareer();
let lines = 0;
for (let i = 0; i < 6; i++) lines += tick(c, c.dayAt + 10 * DAY_MS + 1).length;
console.log('day', c.day, 'lines', lines, 'events planned', c.events.length);
for (const cls of WCLASSES) {
  const r = rankings(c, cls);
  console.log(`== ${cls.name}: ${r.length} men, weights ${Math.min(...r.map((x) => x.weight))}-${Math.max(...r.map((x) => x.weight))} kg, heights ${Math.min(...r.map((x) => x.height))}-${Math.max(...r.map((x) => x.height))}`);
  console.log(r.slice(0, 4).map((f, i) => `${i}. ${short(f)} ${f.weight}kg ${rating(f)} elo ${Math.round(f.elo!)} ${f.record.w}-${f.record.l}${isChamp(c, f) ? ' 🏆' : ''}`).join('\n'));
}
console.log('news:', c.news!.slice(0, 6).join(' | '));
const me = c.roster[0];
console.log('mine', classOf(me).name, me.weight, 'rank', rankOf(c, me), 'rivals', rivalsOf(c, me).map(short));
const rivPairs = Object.values(c.rel!).filter((v) => v <= -50).length;
console.log('sworn enemy pairs', rivPairs, 'of', Object.keys(c.rel!).length, 'world size', c.world!.length);
me.elo = 3000;
const champ = titleBout(c, me)!;
console.log('title shot vs', champ && short(champ));
console.log(recordBout(c, me, champ, true, true), 'champion now ours:', isChamp(c, me));
console.log('defence vs', short(titleBout(c, me)!));
