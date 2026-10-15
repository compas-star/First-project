import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { applyPreset, PRESETS } from '../src/config';
RAPIER.init().then(() => {
  for (const dir of [[0,0,-1],[1,0,0]] as const) for (const dv of (process.argv[2]??"0.5,1,1.5,2,2.5,3.5").split(",").map(Number)) {
    const [a,b]=applyPreset(PRESETS[0]); const sim=new Sim(a,b,1);
    (sim as any).winner = sim.fighters[1];
    (sim as any).footwork = (f:any)=>{ f.self.set(0,0,0); };
    const f=sim.fighters[0];
    for(let i=0;i<240;i++) sim.step(1/240);
    for (const p of f.rag.parts) p.body.applyImpulse({x:dir[0]*p.mass*dv,y:0,z:dir[2]*p.mass*dv}, true);
    let steps=0, minStab=1; const p0=f.pos.clone(); let prevT=[f.feet[0].t,f.feet[1].t];
    for(let i=0;i<240*3;i++){ sim.step(1/240); minStab=Math.min(minStab,f.stability);
      f.feet.forEach((ft,j)=>{ if(ft.t>=0 && prevT[j]<0) steps++; prevT[j]=ft.t; }); }
    console.log(dir.join(','), 'dv', dv, '→', f.state, 'steps', steps, 'minStab', minStab.toFixed(2), 'moved', f.pos.distanceTo(p0).toFixed(2), f.thought);
    sim.dispose();
  }
});
