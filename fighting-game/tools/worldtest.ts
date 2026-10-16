// The fight world without the screen: nights pass, rankings, the belt, bad blood.
import { newCareer, worldTick, rankings, rating, short, NIGHT_MS, rivalsOf, recordBout, titleBout, rankOf } from '../src/career';
const c = newCareer();
const t0 = Date.now();
const out = worldTick(c, t0 + 30 * NIGHT_MS);
console.log('nights', c.nights, 'lines', out.length);
const top = rankings(c).slice(0, 8).map((f, i) => `${i}. ${short(f)} ${rating(f)} elo ${Math.round(f.elo!)} ${f.record.w}-${f.record.l}${f.id === c.champion ? ' 🏆' : ''}`);
console.log(top.join('\n'));
console.log('news:', c.news!.slice(0, 6).join(' | '));
const me = c.roster[0];
console.log('mine rank', rankOf(c, me), 'rivals', rivalsOf(c, me).map(short));
const rivPairs = Object.values(c.rel!).filter((v) => v <= -50).length;
console.log('sworn enemy pairs', rivPairs, 'of', Object.keys(c.rel!).length);
// Push ours to the top and check the title shot.
me.elo = 3000;
console.log('title shot vs', titleBout(c, me) && short(titleBout(c, me)!));
const champ = titleBout(c, me)!;
console.log(recordBout(c, me, champ, true, true), 'champion now ours:', c.champion === me.id);
console.log('defence vs', short(titleBout(c, me)!));
