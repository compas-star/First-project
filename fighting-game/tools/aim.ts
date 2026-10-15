import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { applyPreset, PRESETS } from '../src/config';
import { MOVE_BY_ID } from '../src/moves';
import { STRIKERS, partPoint } from '../src/physics';
import { aimPointOf } from '../src/strikes';
RAPIER.init().then(() => {
  for (const id of process.argv.slice(2)) for (const zone of MOVE_BY_ID[id].zones) {
    const [a,b]=applyPreset(PRESETS[0]); a.skill=0.9; a.discipline='mma'; const sim=new Sim(a,b,1);
    (sim as any).winner = sim.fighters[1];
    const f=sim.fighters[0];
    for(let i=0;i<120;i++) sim.step(1/240);
    // put enemy at 1.0 m in front: they already stand ~2.5 apart; walk red forward artificially by lunge
    const dist = f.pos.distanceTo(f.enemy.pos);
    const m=MOVE_BY_ID[id]; const act = sim.startAction(f,'attack',{move:m, zone, lunge: Math.max(0, dist - 0.85)});
    const st=STRIKERS[m.limb]; const part=f.rag.byName[st.part];
    let prev=partPoint(part,st.at,new THREE.Vector3()).clone(); let vmax=0; let best=99; let hit='';
    const hp0 = f.enemy.hp; const origResolve=(sim as any).resolveHit.bind(sim); let closing=0;
    (sim as any).resolveHit=(att:any,def:any,mm:any,p:any,c:number,...r:any[])=>{hit=p.name; closing=c; return origResolve(att,def,mm,p,c,...r);};
    for(let i=0;i<240 && f.action===act;i++){ sim.step(1/240); const P=partPoint(part,st.at,new THREE.Vector3()).clone(); vmax=Math.max(vmax,P.distanceTo(prev)*240); prev=P;
      const T=aimPointOf(f,act,new THREE.Vector3()); best=Math.min(best,P.distanceTo(T)); }
    console.log(id.padEnd(9), zone.padEnd(5), 'fist vmax', vmax.toFixed(1), 'closest to aim', best.toFixed(2), 'hit', hit||'-', 'closing', closing.toFixed(1), 'dmg', (hp0-f.enemy.hp).toFixed(1));
    sim.dispose();
  }
});
