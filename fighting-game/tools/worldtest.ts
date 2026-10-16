// The fight world without the screen: days pass, rankings, the belt, bad blood.
import { newCareer, tick, rankings, rating, short, DAY_MS, rivalsOf, recordBout, titleBout, rankOf } from '../src/career';
const c = newCareer();
let lines = 0;
for (let i = 0; i < 6; i++) lines += tick(c, c.dayAt + 10 * DAY_MS + 1).length;
console.log('day', c.day, 'lines', lines, 'events planned', c.events.length);
const top = rankings(c).slice(0, 8).map((f, i) => `${i}. ${short(f)} ${rating(f)} elo ${Math.round(f.elo!)} ${f.record.w}-${f.record.l}${f.id === c.champion ? ' 🏆' : ''}`);
console.log(top.join('\n'));
console.log('news:', c.news!.slice(0, 6).join(' | '));
const me = c.roster[0];
console.log('mine rank', rankOf(c, me), 'rivals', rivalsOf(c, me).map(short));
const rivPairs = Object.values(c.rel!).filter((v) => v <= -50).length;
console.log('sworn enemy pairs', rivPairs, 'of', Object.keys(c.rel!).length, 'world size', c.world!.length);
me.elo = 3000;
const champ = titleBout(c, me)!;
console.log('title shot vs', champ && short(champ));
console.log(recordBout(c, me, champ, true, true), 'champion now ours:', c.champion === me.id);
console.log('defence vs', short(titleBout(c, me)!));
