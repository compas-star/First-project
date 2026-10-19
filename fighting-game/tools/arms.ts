// Arms that look twisted: where the elbow points (chest frame) and the forearm's twist
// against the upper arm about the bone. run.sh arms "0,1,2,3" [seeds] [secs]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const which = (process.argv[2] ?? '0,1,2,3').split(',').map(Number);
const N = Number(process.argv[3] ?? 2), T = Number(process.argv[4] ?? 40);
const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const q = (p: { x: number; y: number; z: number; w: number }) => new THREE.Quaternion(p.x, p.y, p.z, p.w);
const hxs: number[] = [];
const ups: Record<string, number[]> = {};
const mv: Record<string, [number, number]> = {};
RAPIER.init().then(() => {
  const by: Record<string, { n: number; up: number; inward: number; twist: number; hyper: number }> = {};
  const add = (k: string, up: boolean, inward: boolean, twist: boolean, hyper: boolean) => {
    const r = (by[k] ??= { n: 0, up: 0, inward: 0, twist: 0, hyper: 0 });
    r.n++; if (up) r.up++; if (inward) r.inward++; if (twist) r.twist++; if (hyper) r.hyper++;
  };
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 13 + 1);
    let k = 0;
    while (!sim.winner && sim.t < T) {
      sim.step(sim.stepSize());
      sim.events.length = 0;
      if (++k % 4) continue;
      for (const f of sim.fighters) {
        if (f.state !== 'ok') continue;
        const chestQ = q(f.rag.byName.chest.body.rotation()).invert();
        for (const side of ['l', 'r'] as const) {
          const U = f.rag.byName[`${side}Upper`].body, F = f.rag.byName[`${side}Fore`].body;
          const S = v(U.translation()), E = v(F.translation());
          const qF = q(F.rotation()), qU = q(U.rotation());
          const H = new THREE.Vector3(0, -0.29 * f.scale, 0).applyQuaternion(qF).add(E);
          const line = H.clone().sub(S);
          const t = THREE.MathUtils.clamp(E.clone().sub(S).dot(line) / line.lengthSq(), 0, 1);
          const d = E.clone().sub(S.clone().addScaledVector(line, t));
          const bent = d.length() > 0.04 * f.scale;
          const dl = d.clone().applyQuaternion(chestQ).normalize();
          // Chest frame: +x is the fighter's left (check sign with the shoulder offset).
          const sh = S.clone().sub(v(f.rag.byName.chest.body.translation())).applyQuaternion(chestQ);
          const outward = Math.sign(sh.x) * dl.x;
          const rel = qU.clone().invert().multiply(qF);
          if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
          // Twist about the bone axis (local Y).
          const tw = 2 * Math.atan2(rel.y, rel.w);
          const twistDeg = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(tw), Math.cos(tw))));
          // Hinge angle about local X (negative = folding forward).
          const hx = THREE.MathUtils.radToDeg(2 * Math.atan2(rel.x, rel.w));
          const kind = f.action?.kind === 'attack' ? 'attack' : f.action?.kind ?? 'idle';
          hxs.push(hx);
          // Upper arm's twist about its own bone against the chest.
          const ru = q(f.rag.byName.chest.body.rotation()).invert().multiply(qU);
          if (ru.w < 0) ru.set(-ru.x, -ru.y, -ru.z, -ru.w);
          const tu = THREE.MathUtils.radToDeg(2 * Math.atan2(ru.y, ru.w)) * (side === 'l' ? 1 : -1);
          (ups[kind] ??= []).push(tu);
          if (kind === 'attack') {
            const id = `${f.action!.move!.id}:${side}${f.action!.move!.limb[0] === side ? '*' : ''}`;
            const r = (mv[id] ??= [0, 0]); r[0]++; if (Math.abs(tu) > 70) r[1]++;
          }
          add(kind, bent && dl.y > 0.6, bent && outward < -0.7, twistDeg > 35, hx > 15);
        }
      }
    }
    sim.dispose();
  }
  console.log(Object.entries(mv).filter(([, r]) => r[1] > 0).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]).map(([k, r]) => `${k} ${(100 * r[1] / r[0]).toFixed(0)}%/${r[0]}`).join('  '));
  hxs.sort((a, b) => a - b);
  console.log('elbow hinge deg: p5', hxs[Math.floor(hxs.length * 0.05)].toFixed(0), 'p50', hxs[hxs.length >> 1].toFixed(0), 'p95', hxs[Math.floor(hxs.length * 0.95)].toFixed(0), '>+15', (100 * hxs.filter((x) => x > 15).length / hxs.length).toFixed(1) + '%', '<-15', (100 * hxs.filter((x) => x < -15).length / hxs.length).toFixed(1) + '%');
  for (const [k, a] of Object.entries(ups)) { a.sort((x, y) => x - y); const P = (p: number) => a[Math.floor(a.length * p)].toFixed(0); console.log(`upper twist ${k}: p2 ${P(0.02)} p10 ${P(0.1)} p50 ${P(0.5)} p90 ${P(0.9)} p98 ${P(0.98)}`); }
  for (const [k, r] of Object.entries(by)) console.log(`${k.padEnd(8)} n ${r.n}  elbow up ${(100 * r.up / r.n).toFixed(1)}%  elbow inward ${(100 * r.inward / r.n).toFixed(1)}%  forearm twist>35° ${(100 * r.twist / r.n).toFixed(1)}%  bent backwards ${(100 * r.hyper / r.n).toFixed(1)}%`);
});
