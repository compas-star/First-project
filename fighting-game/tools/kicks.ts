// Each kick in real fights: start distance vs range, outcome (hit, blocked, aborted, missed by how much).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { STRIKERS, partPoint } from '../src/physics';
import { aimPointOf } from '../src/strikes';
const N = Number(process.argv[3] ?? 4);
const which = (process.argv[2] ?? '2,3').split(',').map(Number);
RAPIER.init().then(() => {
  const rows: string[] = [];
  const sum: Record<string, number> = {};
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 23 + pi) as any;
    const track = new Map<any, any>();
    const sa = sim.startAction.bind(sim);
    sim.startAction = (f: any, kind: string, o: any) => {
      const r = sa(f, kind, o);
      if (kind === 'attack' && o.move && /Foot/.test(o.move.limb) && !o.feint)
        track.set(r, { f, id: o.move.id, d0: f.pos.distanceTo(f.enemy.pos), range: sim.attackRange(f, o.move), lunge: r.lunge, best: 9, res: '' });
      return r;
    };
    while (!sim.winner && sim.t < 40) {
      sim.step(sim.stepSize());
      for (const e of sim.events) if (e.type === 'hit') for (const [act, k] of track) if (e.target === k.f.enemy && k.f.action === act && !k.res) k.res = e.blocked ? 'block' : 'HIT ' + e.zone;
      sim.events.length = 0;
      for (const [act, k] of track) {
        if (k.done) continue;
        const f = k.f;
        if (f.action !== act) { k.done = 1; if (!k.res) k.res = act.t < act.dur * 0.95 ? (f.state !== 'ok' ? 'fell/hit' : 'aborted@' + (act.t / act.dur).toFixed(2) + ' [' + (f.action?.kind ?? '-') + ' ' + f.thought + ']') : 'miss'; rows.push(`${k.id.padEnd(9)} d0 ${k.d0.toFixed(2)} range ${k.range.toFixed(2)} lunge ${k.lunge.toFixed(2)} closest ${k.best.toFixed(2)} lag ${(k.lag??0).toFixed(2)} tgt-aim ${(k.tgt??9).toFixed(2)} hip→tgt ${(k.reach??0).toFixed(2)} → ${k.res}`); const key = k.res.split(/[ @]/)[0]; sum[key] = (sum[key] ?? 0) + 1; continue; }
        const st = STRIKERS[act.move.limb]; const P = partPoint(f.rag.byName[st.part], st.at, new THREE.Vector3());
        const A = aimPointOf(f, act, new THREE.Vector3()); k.best = Math.min(k.best, P.distanceTo(A));
        const u = act.t / act.dur; const [a0, a1] = act.move.active; if (act.dbgTarget && u > a0 + (a1 - a0) * 0.4 && u < a1) { k.lag = Math.max(k.lag ?? 0, P.distanceTo(act.dbgTarget)); k.tgt = Math.min(k.tgt ?? 9, act.dbgTarget.distanceTo(A)); const hipName = /^l/.test(act.move.limb) ? 'lThigh' : 'rThigh'; const hp = f.rag.byName[hipName].body.translation(); k.reach = Math.max(k.reach ?? 0, new THREE.Vector3(hp.x, hp.y, hp.z).distanceTo(act.dbgTarget)); }
      }
    }
    sim.dispose();
  }
  console.log(rows.join('\n'));
  console.log(sum);
});
