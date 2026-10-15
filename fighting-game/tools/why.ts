// Why attacks start: counts attack starts by the decision that made them, plus attack-time share.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const pi = Number(process.argv[2] ?? 0), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  const c: Record<string, number> = {}; let T = 0, atk = 0;
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 7 + 2) as any;
    const sa = sim.startAction.bind(sim);
    sim.startAction = (f: any, kind: string, o: any) => {
      const r = sa(f, kind, o);
      if (kind === 'attack') { const tag = o.feint ? 'feint' : new Error().stack!.split('\n')[2].trim().split(' ')[1]; const k = `${tag}${o.reply ? '/reply' : ''}`; c[k] = (c[k] ?? 0) + 1; }
      return r;
    };
    while (!sim.winner && sim.t < 40) { const h = sim.stepSize(); sim.step(h); T += h; for (const f of sim.fighters) if (f.action?.kind === 'attack') atk += h / 2; }
    sim.dispose();
  }
  console.log(`attacking ${(100 * atk / T).toFixed(0)}% of each fighter's time, ${(T / N).toFixed(0)}s per fight`);
  console.log(c, 'attacks/fighter/fight', (Object.values(c).reduce((a, b) => a + b, 0) / N / 2).toFixed(1), 'avg attack s', (atk * 2 / Object.values(c).reduce((a, b) => a + b, 0)).toFixed(2));
});
// thought prefixes
import { Fighter } from '../src/sim';
const cnt: Record<string, number> = {};
const orig = Fighter.prototype.say;
Fighter.prototype.say = function (t: string) { const k = t.split(/[: ]/)[0]; cnt[k] = (cnt[k] ?? 0) + 1; return orig.call(this, t); };
process.on('exit', () => console.log(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + '=' + v).join(' ')));
