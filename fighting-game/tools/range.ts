// Distance management: how much of the time fighters stand inside each other's reach
// without striking. run.sh range "0,1,2,3" [seeds] [secs]
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MOVE_BY_ID } from '../src/moves';
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number);
const N = Number(process.argv[3] ?? 2), T = Number(process.argv[4] ?? 40);
if (process.env.OLD) (globalThis as { __oldRange?: boolean }).__oldRange = true;
RAPIER.init().then(() => {
  for (const pi of which) {
    let idle = 0, idleIn = 0, atk = 0, hits = 0, dIdle = 0, walkIn = 0, all = 0, allIn = 0, reachS = 0, close = 0; const kinds: Record<string, number> = {}; const gaps: number[] = []; let quiet = 0; const why: Record<string, number> = {};
    for (let s = 1; s <= N; s++) {
      const [a, b] = applyPreset(PRESETS[pi]);
      const sim = new Sim(a, b, s * 7 + 1);
      const seen = new Set<number>();
      while (!sim.winner && sim.t < T) {
        const h = sim.stepSize();
        sim.step(h);
        const [A, B] = sim.fighters;
        for (const e of sim.events) if (e.type === 'hit' && !e.blocked) hits++;
        for (const f of sim.fighters) if (f.action?.kind === 'attack' && !seen.has(f.action.id)) {
          seen.add(f.action.id);
          const k = f.comboLeft >= 0 && f.thought.match(/^(вхожу|наказываю|отвечаю|встречаю|ловлю|связка|своя|финт|прощупываю|контр)/)?.[1] || 'other';
          why[k] = (why[k] ?? 0) + 1;
        }
        sim.events.length = 0;
        if (A.state !== 'ok' || B.state !== 'ok') continue;
        const dist = A.pos.distanceTo(B.pos);
        const reach0 = Math.max(sim.attackRange(A, MOVE_BY_ID.jab), sim.attackRange(B, MOVE_BY_ID.jab));
        all += h; reachS += reach0 * h;
        if (dist < reach0) allIn += h;
        if (dist < 0.8 * reach0) close += h;
        for (const f of [A, B]) { const k = f.action?.kind ?? 'none'; kinds[k] = (kinds[k] ?? 0) + h / 2; }
        const busy = [A, B].some((f) => f.action && f.action.kind !== 'block');
        const fighting = [A, B].some((f) => f.action?.kind === 'attack');
        if (fighting) { if (quiet > 0) gaps.push(quiet); quiet = 0; } else quiet += h;
        for (const f of [A, B]) if (f.action?.kind === 'attack' && f.action.t === 0) {}
        if (busy) { atk += h; continue; }
        idle += h;
        dIdle += dist * h;
        // Inside the longer man's jab reach, nobody throwing.
        const reach = Math.max(sim.attackRange(A, MOVE_BY_ID.jab), sim.attackRange(B, MOVE_BY_ID.jab));
        if (dist < reach) idleIn += h;
        if (/сокращаю/.test(A.thought) || /сокращаю/.test(B.thought)) walkIn += h;
      }
      sim.dispose();
    }
    gaps.sort((x, y) => x - y);
    console.log(`  quiet gaps: n ${gaps.length}, median ${gaps[gaps.length >> 1]?.toFixed(2)}s, >1s ${gaps.filter((g) => g > 1).length}; attacks/min ${(Object.values(why).reduce((a, b) => a + b, 0) / (all / 60)).toFixed(0)} ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(' ')}`);
    console.log(`  all ${all.toFixed(0)}s, in reach ${(100 * allIn / all).toFixed(0)}%, closer than 0.8 reach ${(100 * close / all).toFixed(0)}%, reach ${(reachS / all).toFixed(2)}; actions ${Object.entries(kinds).map(([k, v]) => `${k} ${(100 * v / all).toFixed(0)}%`).join(' ')}`);
    console.log(`${PRESETS[pi].name}: idle ${idle.toFixed(0)}s, in reach while idle ${(100 * idleIn / idle).toFixed(0)}%, avg idle dist ${(dIdle / idle).toFixed(2)}, walking in ${(100 * walkIn / idle).toFixed(0)}%, clean hits ${hits}`);
  }
});
