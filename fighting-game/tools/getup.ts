import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Sim } from '../src/sim';
import { applyPreset, PRESETS } from '../src/config';
RAPIER.init().then(() => {
  for (const dir of [[0,0,-1],[0,0,1],[1,0,0]]) {
  const [a,b]=applyPreset(PRESETS[0]); const sim=new Sim(a,b,1);
  (sim as any).winner = sim.fighters[1];
  (sim as any).footwork = (f:any)=>{ f.self.set(0,0,0); };
  const f=sim.fighters[0];
  for(let i=0;i<240;i++) sim.step(1/240);
  for (const p of f.rag.parts) p.body.applyImpulse({x:dir[0]*p.mass*6,y:0,z:dir[2]*p.mass*6}, true);
  const log:string[]=[];
  for(let i=0;i<240*6;i++){ sim.step(1/240); if(i%60===0){ const p=f.rag.pelvis.body.translation(); const r=f.rag.pelvis.body.rotation(); const up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(r.x,r.y,r.z,r.w));
    log.push(`${(i/240).toFixed(1)}:${f.state}${f.action?.kind==='getup'?'/getup':''} y${p.y.toFixed(2)} up${up.y.toFixed(2)}`); } }
  console.log(dir.join(','), log.join(' | '));
  sim.dispose(); }
});
