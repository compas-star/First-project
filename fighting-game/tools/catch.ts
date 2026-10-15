// How kick catches go: attempts, catches, sweeps, and what happened to the kick otherwise.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[2] ?? 6);
RAPIER.init().then(() => {
  const st: Record<string, number> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[2]);
    const sim = new Sim(a, b, s * 17 + 1) as any;
    const sa = sim.startAction.bind(sim);
    const pending: any[] = [];
    sim.startAction = (f: any, kind: string, o: any) => {
      const r = sa(f, kind, o);
      if (kind === 'catch') { st.attempt = (st.attempt ?? 0) + 1; pending.push({ f, kick: f.enemy.action, t: sim.t }); }
      return r;
    };
    while (!sim.winner && sim.t < 40) {
      sim.step(sim.stepSize());
      for (const e of sim.events) {
        if (e.type === 'catch') st.caught = (st.caught ?? 0) + 1;
        if (e.type === 'hit') for (const p of pending) if (e.target === p.f && !p.done) { p.done = 1; const k = 'hit:' + (e.blocked ? 'blocked' : e.zone) + ':' + p.f.action?.kind; st[k] = (st[k] ?? 0) + 1; }
      }
      sim.events.length = 0;
      for (const p of pending) if (!p.done && sim.t - p.t > 1) { p.done = 1; const k = 'nohit:' + (p.kick?.hitDone ? 'hd' : '') + (p.f.enemy.action === p.kick ? 'still' : 'ended'); st[k] = (st[k] ?? 0) + 1; }
    }
    sim.dispose();
  }
  console.log(st);
});
