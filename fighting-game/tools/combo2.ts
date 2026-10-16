// Do fighters throw the player's combinations in fights? run.sh combo2 [preset] [fights]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { addCombo } from '../src/combos';
const pi = Number(process.argv[2] ?? 0), N = Number(process.argv[3] ?? 2);
RAPIER.init().then(() => {
  addCombo([{ move: 'jab', zone: 'head' }, { move: 'cross', zone: 'head' }, { move: 'hook', zone: 'body' }]);
  addCombo([{ move: 'lowkick', zone: 'leg' }, { move: 'cross', zone: 'head' }]);
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 17);
    const seq = [0, 0]; let mine = 0, all = 0;
    while (!sim.winner && sim.t < 60) {
      sim.step(sim.stepSize());
      sim.fighters.forEach((f, i) => { if (f.thoughtSeq !== seq[i]) { seq[i] = f.thoughtSeq; if (f.thought.startsWith('своя связка')) mine++; if (f.action?.kind === 'attack' && !f.action.reply) all++; } });
      sim.events.length = 0;
    }
    console.log(`fight ${s}: ${sim.t.toFixed(0)}s, own combos started ${mine}`);
    sim.dispose();
  }
});
