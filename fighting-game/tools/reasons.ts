// For strikes chosen for a reason ("он наклонился" etc.): how often they land, vs the same strikes without a reason.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, Fighter } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[2] ?? 6);
RAPIER.init().then(() => {
  const st: Record<string, [number, number, number]> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[s % 2 ? 0 : 2]);
    const sim = new Sim(a, b, s * 41 + 7 + Number(process.env.OFF ?? 0)) as any;
    const pend = new Map<any, string>();
    const say = Fighter.prototype.say;
    while (!sim.winner && sim.t < 70) {
      const before = sim.fighters.map((f: any) => f.action);
      sim.step(sim.stepSize());
      sim.fighters.forEach((f: any, i: number) => {
        const act = f.action;
        if (act && act !== before[i] && act.kind === 'attack' && !act.feint) {
          const m = /\(([^)]*)\)/.exec(f.thought);
          pend.set(act, `${act.move.id}${m && f.thought.includes(act.move.name) ? ' | ' + m[1] : ''}`);
        }
      });
      for (const e of sim.events) if (e.type === 'hit') for (const [act, k] of pend) if (act.hitDone && !act.counted && e.target !== undefined) { act.counted = 1; const r = (st[k] ??= [0, 0, 0]); if (!e.blocked && (e.zone === 'голову' || e.zone === 'в голову' || /голов/.test(e.zone))) r[0]++; if (e.blocked || /рук/.test(e.zone)) r[1]++; }
      sim.events.length = 0;
      for (const [act, k] of pend) if (act.t >= act.dur || act !== sim.fighters[0].action && act !== sim.fighters[1].action) { const r = (st[k] ??= [0, 0, 0]); r[2]++; pend.delete(act); }
    }
    sim.dispose();
  }
  for (const [k, [clean, blocked, total]] of Object.entries(st).sort()) if (total >= 3) console.log(k.padEnd(40), `${clean}/${total} to head (${Math.round(100 * clean / total)}%), into guard/arm ${blocked}`);
});
