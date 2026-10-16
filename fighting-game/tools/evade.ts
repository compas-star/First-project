// Does elusiveness help? Same matchup with the red fighter's evasion at two levels.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const pi = Number(process.argv[2] ?? 0), N = Number(process.argv[3] ?? 10), E = Number(process.argv[4] ?? 0.9);
RAPIER.init().then(() => {
  const w = [0, 0, 0]; const st: Record<string, number> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    a.evasion = E;
    const sim = new Sim(a, b, s * 37 + Number(process.env.OFF ?? 0));
    const seq = [0, 0];
    while (!sim.winner && sim.t < 90) {
      sim.step(sim.stepSize());
      const f = sim.fighters[0];
      if (f.thoughtSeq !== seq[0]) { seq[0] = f.thoughtSeq; const k = f.thought.split(':')[0]; if (/уклон|нырок|отклон|отскок|ушёл|убрал/.test(k)) st[k] = (st[k] ?? 0) + 1; }
      for (const e of sim.events as any[]) { if (e.type === 'moment') st[e.text] = (st[e.text] ?? 0) + 1; if (e.type === 'hit') { const k = (e.target.team ? 'onBlue ' : 'onRed ') + (e.blocked ? 'blocked' : e.zone); st[k] = (st[k] ?? 0) + 1; if (!e.blocked && e.target.team === 0 && e.zone === 'в голову') { const a = e.target.action; const kk = 'redHeadWhile ' + (a ? a.kind + (a.kind === 'dodge' ? '/' + a.pose : '') : 'idle') + (e.target.handledThreat === sim.fighters[1].action?.id ? ' seen' : ' unseen'); st[kk] = (st[kk] ?? 0) + 1; }
          if (!e.blocked && e.target.team === 0) st.dmgOnRed = (st.dmgOnRed ?? 0) + Math.round(e.dmg); if (!e.blocked && e.target.team === 1) st.dmgOnBlue = (st.dmgOnBlue ?? 0) + Math.round(e.dmg); } }
      for (const f of sim.fighters) if (f.action && f.action.kind === 'attack' && f.action.t === 0) {}
      sim.events.length = 0;
    }
    w[sim.winner ? sim.winner.team : 2]++;
    sim.dispose();
  }
  console.log(`evasion ${E}: red ${w[0]} blue ${w[1]} draw ${w[2]}`, JSON.stringify(st));
});
