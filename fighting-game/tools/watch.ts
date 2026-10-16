// Records a fight for Claude to look at: every frame, both fighters' body segments (the
// two ends of each part's hit segment in world space), what they are doing and thinking,
// and the events (hits, knockdowns). Draw it with tools/watch.py.
// run.sh watch <preset> <seconds> [fps] [out.json] [seed]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import { MAP_BY_ID } from '../src/maps';
import { partPoint } from '../src/physics';

const pi = Number(process.argv[2] ?? 0);
const secs = Number(process.argv[3] ?? 20);
const fps = Number(process.argv[4] ?? 30);
const out = process.argv[5] ?? 'watch.json';
const seed = Number(process.argv[6] ?? 1);

RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[pi]);
  const sim = new Sim(a, b, seed, MAP_BY_ID[PRESETS[pi].map]);
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const frames: unknown[] = [];
  const events: unknown[] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  let next = 0;
  while (sim.t < secs && !(sim.winner && sim.t > (sim as unknown as { koT?: number }).koT!)) {
    sim.step(sim.stepSize());
    for (const ev of sim.events) {
      const e = ev as { type: string; target?: unknown; zone?: string; dmg?: number; blocked?: boolean };
      if (e.type === 'hit' || e.type === 'liver' || e.type === 'break' || e.type === 'moment')
        events.push({ t: r2(sim.t), type: e.type, who: e.target === sim.fighters[0] ? 0 : 1, zone: e.zone, dmg: e.dmg && r2(e.dmg), blocked: e.blocked });
    }
    sim.events.length = 0;
    if (sim.t < next) continue;
    next += 1 / fps;
    frames.push({
      t: r2(sim.t),
      f: sim.fighters.map((f) => ({
        parts: Object.fromEntries(f.rag.parts.map((p) => {
          const h = p.def.hit;
          partPoint(p, pa.set(h.a[0], h.a[1], h.a[2]).multiplyScalar(f.scale), pa);
          partPoint(p, pb.set(h.b[0], h.b[1], h.b[2]).multiplyScalar(f.scale), pb);
          return [p.name, [pa.x, pa.y, pa.z, pb.x, pb.y, pb.z].map(r2)];
        })),
        state: f.state,
        act: f.action ? f.action.kind + (f.action.move ? `:${f.action.move.id}` : '') + (f.action.feint ? '(финт)' : '') : '',
        thought: f.thought,
        daze: r2(f.daze),
        wind: r2(f.stamina),
        facing: r2(f.facing),
      })),
    });
    if (sim.winner && !(sim as unknown as { koT?: number }).koT) (sim as unknown as { koT?: number }).koT = sim.t + 2;
  }
  writeFileSync(out, JSON.stringify({ preset: PRESETS[pi].name, names: sim.fighters.map((f) => f.p.name), winner: sim.winner ? sim.winner.team : null, reason: sim.winner?.enemy.koReason ?? '', frames, events }));
  console.log(`${frames.length} frames, ${events.length} events, ${sim.t.toFixed(1)}s, winner ${sim.winner ? sim.winner.p.name + ' (' + sim.winner.enemy.koReason + ')' : '-'} -> ${out}`);
});
