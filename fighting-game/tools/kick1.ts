// One kick on a standing target, step by step: hip→aim, foot→aim, foot→IK target.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { applyPreset, PRESETS } from '../src/config';
import { MOVE_BY_ID } from '../src/moves';
import { STRIKERS, partPoint, segSegDist } from '../src/physics';
import { aimPointOf } from '../src/strikes';
const id = process.argv[2] ?? 'bodykick';
const D = Number(process.argv[3] ?? 0.8);
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[0]); a.skill = 0.9;
  const sim = new Sim(a, b, 3) as any;
  const f = sim.fighters[0], e = sim.fighters[1];
  sim.think = () => {};
  // walk them together with AI muted: set desired distance
  const ai = require('../src/ai');
  for (let i = 0; i < 2000 && f.pos.distanceTo(e.pos) > D; i++) { f.wantDist = D; e.wantDist = D; sim.step(1 / 240); f.action = null; e.action = null; }
  const m = MOVE_BY_ID[id];
  const act = sim.startAction(f, 'attack', { move: m, zone: m.zones[0], lunge: 0 });
  const st = STRIKERS[m.limb]; const leg = f.rag.byName[st.part];
  const hipN = m.limb[0] === 'l' ? 'lThigh' : 'rThigh';
  let hit = '';
  const or = sim.resolveHit.bind(sim); sim.resolveHit = (...r: any[]) => { hit = r[3].name; return or(...r); };
  console.log('start dist', f.pos.distanceTo(e.pos).toFixed(2));
  for (let i = 0; i < 400 && f.action === act; i++) {
    sim.step(1 / 240);
    if (i % 6 === 0) {
      const P = partPoint(leg, st.at, new THREE.Vector3()); const A = aimPointOf(f, act, new THREE.Vector3());
      const hp = f.rag.byName[hipN].body.translation();
      let gap = 9, gp = ''; for (const ep of e.rag.parts) { const sa = partPoint(ep, ep.hitA, new THREE.Vector3()), sb = partPoint(ep, ep.hitB, new THREE.Vector3()); const d = segSegDist(P, P, sa, sb, new THREE.Vector3()) - (st.r * f.scale + ep.hitR); if (d < gap) { gap = d; gp = ep.name; } }
      const lv = leg.body.linvel();
      console.log(`u ${(act.t / act.dur).toFixed(2)} dist ${f.pos.distanceTo(e.pos).toFixed(2)} hip→aim ${new THREE.Vector3(hp.x, hp.y, hp.z).distanceTo(A).toFixed(2)} foot→aim ${P.distanceTo(A).toFixed(2)} footY ${P.y.toFixed(2)} aimY ${A.y.toFixed(2)} tgt→aim ${act.dbgTarget?.distanceTo(A).toFixed(2)} foot→tgt ${act.dbgTarget?.distanceTo(P).toFixed(2)} gap ${gap.toFixed(2)} ${gp} v ${Math.hypot(lv.x,lv.y,lv.z).toFixed(1)} hit ${hit}`);
    }
  }
});
