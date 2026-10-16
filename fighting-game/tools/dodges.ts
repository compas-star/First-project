// What happens to a blow when the target dodges: by dodge kind, landed (zone) or missed.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[2] ?? 6);
RAPIER.init().then(() => {
  const st: Record<string, Record<string, number>> = {};
  const dist: Record<string, number[]> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[0]);
    a.evasion = b.evasion = 0.9;
    const sim = new Sim(a, b, s * 41) as any;
    const watch = new Map<any, any>();
    while (!sim.winner && sim.t < 60) {
      sim.step(sim.stepSize());
      for (const f of sim.fighters) {
        const da = f.action;
        const ea = f.enemy.action;
        if (da?.kind === 'dodge' && ea?.kind === 'attack' && !watch.has(ea)) watch.set(ea, { kind: da.pose + (da.into ? '(into)' : ''), def: f, res: '' , headMove: 0, h0: null });
      }
      for (const e of sim.events) if (e.type === 'hit') for (const [ea, w] of watch) if (!w.res && w.def === e.target && ea.hitDone) w.res = e.zone;
      sim.events.length = 0;
      for (const [ea, w] of watch) {
        const H = w.def.rag.byName.head.body.translation();
        const hv = new THREE.Vector3(H.x, H.y, H.z);
        if (!w.h0) w.h0 = hv.clone();
        w.headMove = Math.max(w.headMove, hv.distanceTo(w.h0));
        if (!w.done && w.def.enemy.action !== ea) { w.done = 1; const r = w.res || 'miss'; (st[w.kind] ??= {})[r] = (st[w.kind][r] ?? 0) + 1; (dist[w.kind] ??= []).push(w.headMove); }
      }
    }
    sim.dispose();
  }
  for (const [k, v] of Object.entries(st)) { const d = dist[k].sort(); console.log(k.padEnd(16), JSON.stringify(v), 'head moved median', d[d.length >> 1].toFixed(2)); }
});
