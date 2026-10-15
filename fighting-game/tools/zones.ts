// Head-aimed punches: where they end up (head, arm, body, miss), and how far the fist was from the head at best.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { STRIKERS, partPoint } from '../src/physics';
const N = Number(process.argv[2] ?? 4);
RAPIER.init().then(() => {
  const st: Record<string, Record<string, number>> = {};
  const miss: Record<string, number[]> = {};
  for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[0]);
    const sim = new Sim(a, b, s * 53 + Number(process.env.OFF ?? 0)) as any;
    const track = new Map<any, any>();
    while (!sim.winner && sim.t < 70) {
      sim.step(sim.stepSize());
      sim.fighters.forEach((f: any) => { const act = f.action; if (act?.kind === 'attack' && !act.feint && act.zone === 'head' && act.move.path && act.move.limb.endsWith('Hand') && !track.has(act)) track.set(act, { f, id: act.move.id, res: null, best: 9 }); });
      for (const e of sim.events) if (e.type === 'hit') for (const [act, k] of track) if (!k.res && act.hitDone && k.f.enemy === e.target) k.res = e.blocked ? 'blocked' : e.zone;
      sim.events.length = 0;
      for (const [act, k] of track) {
        if (k.done) continue;
        const f = k.f; const S = STRIKERS[act.move.limb];
        const P = partPoint(f.rag.byName[S.part], S.at.clone().multiplyScalar(f.scale), new THREE.Vector3());
        const H = f.enemy.rag.byName.head.body.translation();
        k.best = Math.min(k.best, P.distanceTo(new THREE.Vector3(H.x, H.y + 0.12 * f.enemy.scale, H.z)));
        if (!k.y && act.hitDone) { k.y = 1; const A = (require('../src/strikes') as any).aimPointOf(f, act, new THREE.Vector3()); (globalThis as any).L = ((globalThis as any).L ?? []); (globalThis as any).L.push(`${k.id} res ${k.res} fistY-headY ${(P.y - H.y).toFixed(2)} aimY-headY ${(A.y - H.y).toFixed(2)} fist→aim ${P.distanceTo(A).toFixed(2)}`); }
        if (f.action !== act) { k.done = 1; const r = k.res ?? (f.state !== 'ok' ? 'interrupted' : act.t < act.dur * act.move.active[1] ? 'cut' : 'miss'); (st[k.id] ??= {})[r] = (st[k.id][r] ?? 0) + 1; if (r === 'miss') (miss[k.id] ??= []).push(k.best); }
      }
    }
    sim.dispose();
  }
  console.log(((globalThis as any).L ?? []).slice(0, 25).join('\n'));
  for (const [id, r] of Object.entries(st)) console.log(id.padEnd(10), JSON.stringify(r), 'miss closest median', (miss[id] ?? []).sort()[(miss[id] ?? []).length >> 1]?.toFixed(2));
});
