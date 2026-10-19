// Ratings of the story's opponents against ours. run.sh storylv
import { newCareer, rating, makeFighter } from '../src/career';
import { story, storyChoose } from '../src/story';
for (const L of [0.02, 0.3, 0.6, 0.9]) {
  const c = newCareer();
  const f = makeFighter(L, 0.5);
  c.roster = [f];
  c.pick = f.id;
  f.fame = 60;
  const s = story(c);
  const res: string[] = [];
  for (const [ch, opt] of [['debt2', 'fight'], ['debt3', 'fight'], ['rival2', 'fight'], ['fix2', 'fight'], ['gym2', 'fight'], ['gym4', 'fight']]) {
    s.pending = ch;
    s.flags.debt = 1000;
    const o = storyChoose(c, opt);
    if (o.fight) res.push(`${ch} ${rating(o.fight.opp)}`);
    f.busyUntil = 0;
  }
  console.log(`ours ${rating(f)}: ${res.join(', ')}`);
}
