// What happens to kicks in real fights: clean, blocked, arm, missed, abandoned.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
import * as THREE from 'three';
import { partPoint } from '../src/physics';
const which = (process.argv[2] ?? '2,3,6').split(',').map(Number), N = Number(process.argv[3] ?? 3);
RAPIER.init().then(() => {
  const fate: Record<string, Record<string, number>> = {};
  const add = (m: string, k: string) => { (fate[m] ??= {})[k] = (fate[m][k] ?? 0) + 1; };
  for (const pi of which) for (let s = 1; s <= N; s++) {
    const [a, b] = applyPreset(PRESETS[pi]);
    const sim = new Sim(a, b, s * 19 + pi);
    const cur: ({ id: number; m: string; got: string; d0: number; minD: number; ea: Set<string> } | null)[] = [null, null];
    const foot = new THREE.Vector3();
    while (!sim.winner && sim.t < 40) {
      sim.step(sim.stepSize());
      for (const ev of sim.events) if (ev.type === 'hit') {
        const i = ev.target === sim.fighters[0] ? 1 : 0;
        const c = cur[i];
        if (c && !c.got) c.got = ev.blocked ? 'blocked' : ev.zone === 'в руку' || /рук/.test(ev.zone) ? 'arm' : 'clean';
      }
      sim.events.length = 0;
      sim.fighters.forEach((f, i) => {
        const act = f.action;
        const c = cur[i];
        if (c && act && act.id === c.id) {
          partPoint(f.rag.byName[act.move!.limb === 'lFoot' ? 'lShin' : 'rShin'], new THREE.Vector3(0, -0.46, 0.05), foot);
          const ch = f.enemy.rag.byName.chest.body.translation();
          c.minD = Math.min(c.minD, foot.distanceTo(new THREE.Vector3(ch.x, ch.y, ch.z)));
          if (f.enemy.action) c.ea.add(f.enemy.action.kind + (f.enemy.action.kind === 'dodge' ? ':' + (f.enemy.action.pose ?? 'geo') : ''));
        }
        if (c && (!act || act.id !== c.id)) { const g = c.got || (f.thought === 'ставлю ногу' ? 'abandoned' : act?.kind === 'stagger' ? 'interrupted' : 'miss'); add(c.m, g); if (g === 'miss' && process.env.V) console.log(c.m, 'd0', c.d0.toFixed(2), 'min foot→chest', c.minD.toFixed(2), [...c.ea].join(',')); cur[i] = null; }
        if (act?.kind === 'attack' && !act.feint && /Foot$/.test(act.move!.limb) && !cur[i]) cur[i] = { id: act.id, m: act.move!.id, got: '', d0: f.pos.distanceTo(f.enemy.pos), minD: 9, ea: new Set() };
      });
    }
    sim.dispose();
  }
  for (const [m, r] of Object.entries(fate)) console.log(m.padEnd(10), JSON.stringify(r));
});
