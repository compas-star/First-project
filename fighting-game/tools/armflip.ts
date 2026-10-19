// When a hook's arm flips: the IK target twist of the upper arm (against the chest) and the
// real one, over the strike's time. run.sh armflip [move] [preset]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const mv = process.argv[2] ?? 'hook', pi = Number(process.argv[3] ?? 0);
const q = (p: { x: number; y: number; z: number; w: number }) => new THREE.Quaternion(p.x, p.y, p.z, p.w);
const tw = (chest: THREE.Quaternion, u: THREE.Quaternion) => {
  const r = chest.clone().invert().multiply(u);
  if (r.w < 0) r.set(-r.x, -r.y, -r.z, -r.w);
  return THREE.MathUtils.radToDeg(2 * Math.atan2(r.y, r.w));
};
RAPIER.init().then(() => {
  const [a, b] = applyPreset(PRESETS[pi]);
  const sim = new Sim(a, b, 3);
  const ov = (sim as unknown as { override: Record<string, THREE.Quaternion> }).override;
  let shown = 0;
  const lastIds = [-1, -1];
  const rowsOf: string[][] = [[], []];
  while (sim.t < 120 && shown < 6) {
    if (sim.winner) break;
    sim.step(sim.stepSize());
    sim.events.length = 0;
    for (const f of [sim.fighters[1]]) {
      const ac = f.action;
      const rows = rowsOf[f.team];
      if (ac?.kind !== 'attack' || ac.move!.id !== mv || ac.id !== lastIds[f.team]) {
        if (rows.length > 5) { console.log(rows.join('\n')); console.log('--'); shown++; }
        rows.length = 0;
        lastIds[f.team] = ac?.kind === 'attack' && ac.move!.id === mv ? ac.id : -1;
        if (lastIds[f.team] < 0) continue;
      }
      const side = ac.move!.limb[0];
      const chest = q(f.rag.byName.chest.body.rotation());
      const real = tw(chest, q(f.rag.byName[`${side}Upper` as 'lUpper'].body.rotation()));
      if (!(globalThis as any).__k) { (globalThis as any).__k = 1; console.log('keys', Object.keys(ov)); }
      const tgt = ov[`${side}Upper`] ? tw(chest, ov[`${side}Upper`]) : NaN;
      rows.push(`t ${(ac.t / ac.dur).toFixed(2)} target ${tgt.toFixed(0)} real ${real.toFixed(0)} ${Object.keys(ov).filter((k) => k.includes("Up")).join(",")}`);
    }
  }
});
